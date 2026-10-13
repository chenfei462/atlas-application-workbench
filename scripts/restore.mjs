import fs from 'node:fs/promises';
import path from 'node:path';
import {root,settings,project,command,sql,verifyBundle,safePath,api,exportTables,inventory,sha256,writeJSON,schemaSecurity,securitySummary,assertSchemaSecurity} from './backup-lib.mjs';
import {validateRestoreSource,assertRestoreCompatibility,readTargetCompatibility,authFingerprintSQL,assertRestoredAuth,canonicalRows,assertRestoredObjects,assertRestoreBuckets} from './restore-preflight.mjs';
export async function restore(dir,cwd,{verifyOnly=false,operations={}}={}){
 const {settings,project,command,sql,verifyBundle,api,exportTables,inventory,schemaSecurity}={...restoreOperations,...operations};
 const s=settings(cwd),db=project(cwd),m=await verifyBundle(dir,{container:db});
 if(s.API_URL!=='http://127.0.0.1:55431'||!['55432','55442'].includes(new URL(s.DB_URL).port)||!db.startsWith('supabase_db_atlas-restore-'))throw Error('Restore allowed only in isolated Atlas restore project on API 55431 and DB 55432/55442');
 if(sql(db,"select max(version) from supabase_migrations.schema_migrations;")!==m.migrationHead)throw Error('Restore migration head must exactly match the backup source');
 // Refuse drift before the first database or Storage mutation, then recheck after restoration.
 assertSchemaSecurity(m.schemaSecurity,schemaSecurity(db));
 const compatibility=assertRestoreCompatibility(m,validateRestoreSource(m)?readTargetCompatibility(db,sql):{});
 const liveBuckets=await(await api(s,'/storage/v1/bucket')).json();assertRestoreBuckets(m.buckets||[],liveBuckets,{allowMissing:!verifyOnly});
 for(const object of m.objects)if(object.owner!=null&&(typeof object.owner!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(object.owner)))throw Error('BLOCKED_RESTORE_COMPATIBILITY unsupported non-UUID storage owner');
 const expected=JSON.parse(await fs.readFile(path.join(dir,'atlas-export.json'),'utf8')).tables;
 if(!verifyOnly){
 for(const table of ['auth.users','auth.identities','storage.objects'])if(sql(db,`select count(*) from ${table};`)!=='0')throw Error('Restore requires fresh empty auth and storage database');
 for(const table of Object.keys(expected))if(sql(db,`select count(*) from public."${table}";`)!=='0')throw Error('Restore requires empty public tables');
 command('docker',['cp',path.join(dir,'database.dump'),`${db}:/tmp/atlas-restore.dump`]);
 const allTables=[...Object.keys(expected),'users','identities'];
 command('docker',['exec',db,'pg_restore','-U','supabase_admin','-d','postgres','--data-only','--disable-triggers','--single-transaction','--exit-on-error',...allTables.flatMap(t=>['--table',t]),'/tmp/atlas-restore.dump']);
 for(const bucket of m.buckets||[]){if(!liveBuckets.some(b=>b.id===bucket.id))await api(s,'/storage/v1/bucket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:bucket.id,name:bucket.name,public:bucket.public,file_size_limit:bucket.file_size_limit,allowed_mime_types:bucket.allowed_mime_types})});}
 for(const object of m.objects){const bytes=await fs.readFile(safePath(dir,object.filename));await api(s,`/storage/v1/object/${encodeURIComponent(object.bucket)}/${object.path.split('/').map(encodeURIComponent).join('/')}`,{method:'POST',headers:{'Content-Type':object.metadata?.mimetype||'application/octet-stream','x-upsert':'false'},body:bytes});if(object.owner)sql(db,`update storage.objects set owner_id='${object.owner.replaceAll("'","''")}', owner='${object.owner.replaceAll("'","''")}'::uuid where bucket_id='${object.bucket.replaceAll("'","''")}' and name='${object.path.replaceAll("'","''")}';`);}
 }
 const actual=await exportTables(s,db);const counts={};for(const [table,rows]of Object.entries(expected)){counts[table]={expected:rows.length,actual:actual[table]?.length};if(!actual[table]||canonicalRows(rows)!==canonicalRows(actual[table]))throw Error(`Restored rows differ: ${table}`);}
 const foreignKeys=JSON.parse(sql(db,`select coalesce(json_agg(x),'[]') from (select n.nspname as schema,c.relname as table,rn.nspname as ref_schema,rc.relname as ref_table,(select json_agg(a.attname order by k.ord) from unnest(f.conkey) with ordinality k(num,ord) join pg_attribute a on a.attrelid=f.conrelid and a.attnum=k.num) as columns,(select json_agg(a.attname order by k.ord) from unnest(f.confkey) with ordinality k(num,ord) join pg_attribute a on a.attrelid=f.confrelid and a.attnum=k.num) as ref_columns from pg_constraint f join pg_class c on c.oid=f.conrelid join pg_namespace n on n.oid=c.relnamespace join pg_class rc on rc.oid=f.confrelid join pg_namespace rn on rn.oid=rc.relnamespace where f.contype='f' and n.nspname='public') x;`));
 const ident=value=>'"'+value.replaceAll('"','""')+'"';
 for(const fk of foreignKeys){const count=sql(db,`select count(*) from ${ident(fk.schema)}.${ident(fk.table)} c where ${fk.columns.map(col=>`c.${ident(col)} is not null`).join(' and ')} and not exists(select 1 from ${ident(fk.ref_schema)}.${ident(fk.ref_table)} p where ${fk.columns.map((col,i)=>`c.${ident(col)}=p.${ident(fk.ref_columns[i])}`).join(' and ')});`);if(count!=='0')throw Error(`Foreign key mismatch in ${fk.table}`);}
 for(const object of m.objects){const r=await api(s,`/storage/v1/object/authenticated/${encodeURIComponent(object.bucket)}/${object.path.split('/').map(encodeURIComponent).join('/')}`);if(sha256(Buffer.from(await r.arrayBuffer()))!==object.sha256)throw Error('Restored object hash differs');}
 assertRestoredObjects(m.objects,await inventory(db));
 const bucketSecurity=assertRestoreBuckets(m.buckets||[],await(await api(s,'/storage/v1/bucket')).json());
 const policies=Number(sql(db,"select count(*) from pg_policies where schemaname='public';"));const unsafe=Number(sql(db,"select count(*) from pg_tables where schemaname='public' and not rowsecurity;"));if(!policies||unsafe)throw Error('RLS verification failed');
 const restoredSchemaSecurity=schemaSecurity(db);assertSchemaSecurity(m.schemaSecurity,restoredSchemaSecurity);
 const authContent=assertRestoredAuth(m,validateRestoreSource(m)?['users','identities'].map(name=>JSON.parse(sql(db,authFingerprintSQL(name)))):[]);
 const invalidIdentityOwners=Number(sql(db,'select count(*) from auth.identities i where not exists(select 1 from auth.users u where u.id=i.user_id);'));if(invalidIdentityOwners)throw Error('Restored auth identities reference missing accounts');
 return {status:'RESTORE_DATA_PASS',backupId:m.backupId,sourceMigrationHead:m.migrationHead,restoredMigrationHead:sql(db,"select max(version) from supabase_migrations.schema_migrations;"),apiUrl:s.API_URL,dbPort:new URL(s.DB_URL).port,counts,foreignKeysVerified:foreignKeys.length,filesVerified:m.objects.length,storageOwners:'EXACT_MATCH',bucketSecurity,schemaSecurity:securitySummary(restoredSchemaSecurity),schemaDefinitions:'EXACT_MATCH',publicPolicies:policies,publicRlsDisabled:unsafe,compatibility,authContent,authIdentityOwners:'PASS'};
}

const restoreOperations={settings,project,command,sql,verifyBundle,api,exportTables,inventory,schemaSecurity};

