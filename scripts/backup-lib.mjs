import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
export const root=path.resolve(import.meta.dirname,'..');
export const backupRoot=path.join(root,'backups');
export const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
export function safePath(base,logical){
 if(typeof logical!=='string'||!logical||/[\\:\x00-\x1f]/.test(logical)||logical.startsWith('/')||logical.split('/').some(x=>!x||x==='.'||x==='..'||/[. ]$/.test(x)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(x))) throw Error('Unsafe logical path');
 const target=path.resolve(base,...logical.split('/')); const rel=path.relative(path.resolve(base),target);
 if(rel.startsWith('..')||path.isAbsolute(rel)) throw Error('Path escapes backup root'); return target;
}
export function bundleStatus(items){return items.length&&items.every(x=>x.status==='PASS')?'PASS':'FAIL';}
export function retentionCandidates(rows){return rows.filter(x=>x.status==='PASS'&&x.kind==='daily').sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(7);}
export function references(tables){
 const out=[];
 for(const [table,rows] of Object.entries(tables)) for(const row of rows) for(const [field,value] of Object.entries(row)) if(typeof value==='string'&&value&&(field==='storage_path'||field==='archive_path'||field.endsWith('_storage_path'))) out.push({table,id:row.id,owner:row.owner_id,path:value,bucket:row.storage_bucket||row.bucket_id||'application-documents',materialId:row.material_id,versionId:table==='material_versions'?row.id:undefined});
 return out;
}
export function command(bin,args,options={}) { const r=spawnSync(bin,args,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024,...options}); if(r.status!==0) throw Error(`Command failed: ${bin} ${args[0]} (exit ${r.status})`);return r.stdout; }
export function settings(cwd=root){return JSON.parse(command(process.execPath,[path.join(root,'node_modules/supabase/dist/supabase.js'),'status','--output','json'],{cwd}));}
export function project(cwd=root){return requireProject(command('docker',['ps','--format','{{.Names}}']),cwd);}
// F11 fix: this previously shelled out to `powershell` to read config.toml, which fails with
// spawnSync EPERM under the current subprocess allowlist (`powershell.exe` is blocked; `pwsh` is
// not). The spawn error was silently swallowed, so the failure surfaced far away as a cryptic
// "Cannot read properties of undefined (reading 'match')". Reading the file with Node removes the
// subprocess dependency entirely; the explicit error makes any future failure self-describing.
function requireProject(names,cwd){
  const cfgPath=path.join(cwd,'supabase/config.toml');
  let config;
  try{ config=readFileSync(cfgPath,'utf8'); }
  catch(e){ throw Error(`Cannot read ${cfgPath}: ${e.message}`); }
  const id=config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
  if(!id) throw Error(`project_id not found in ${cfgPath}`);
  const name=`supabase_db_${id}`;
  if(!names.split(/\r?\n/).includes(name))throw Error(`Database container unavailable: ${name} not among [${names.split(/\r?\n/).filter(Boolean).join(', ')}]`);
  return name;
}
export function sql(container,q){return command('docker',['exec','-i',container,'psql','-U','postgres','-d','postgres','-X','-q','-t','-A','-v','ON_ERROR_STOP=1'],{input:q}).trim();}
export async function api(s,route,options={}){const r=await fetch(`${s.API_URL}${route}`,{...options,headers:{apikey:s.ANON_KEY,Authorization:`Bearer ${s.SERVICE_ROLE_KEY}`,...options.headers}});if(!r.ok)throw Error(`API failed ${r.status} on ${route.split('?')[0]}`);return r;}
export async function exportTables(s,container){const names=JSON.parse(sql(container,"select coalesce(json_agg(tablename order by tablename),'[]') from pg_tables where schemaname='public';"));const tables={};for(const table of names){tables[table]=[];for(let offset=0;;offset+=500){const rows=await (await api(s,`/rest/v1/${table}?select=*&order=id.asc&limit=500&offset=${offset}`)).json();tables[table].push(...rows);if(rows.length<500)break;}}return tables;}
export async function writeJSON(file,data){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(data,null,2)+'\n');}
export async function inventory(container){return JSON.parse(sql(container,"select coalesce(json_agg(x order by bucket_id,name),'[]') from (select bucket_id,name,owner_id,metadata,version from storage.objects) x;"));}
export function schemaSecurity(container){
 return JSON.parse(sql(container,`select json_build_object(
 'version',2,
 'functions',(select coalesce(json_agg(x order by schema,name,arguments),'[]') from (select n.nspname as schema,p.proname as name,pg_get_function_identity_arguments(p.oid) as arguments,pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','storage')) x),
 'triggers',(select coalesce(json_agg(x order by schema,"table",name),'[]') from (select n.nspname as schema,c.relname as "table",t.tgname as name,t.tgenabled as enabled,pg_get_triggerdef(t.oid,true) as definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','storage') and not t.tgisinternal) x),
 'policies',(select coalesce(json_agg(x order by schema,"table",name),'[]') from (select schemaname as schema,tablename as "table",policyname as name,permissive,cmd,(select json_agg(r order by r) from unnest(roles) r) as roles,qual,with_check from pg_policies where schemaname in('public','storage')) x),
 'tables',(select coalesce(json_agg(x order by schema,name),'[]') from (select n.nspname as schema,c.relname as name,c.relrowsecurity as "rlsEnabled",c.relforcerowsecurity as "rlsForced" from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','storage') and c.relkind in('r','p')) x));`));
}
export function securitySummary(snapshot){return {publicTables:snapshot.tables.filter(x=>x.schema==='public').length,publicFunctions:snapshot.functions.filter(x=>x.schema==='public').length,publicTriggers:snapshot.triggers.filter(x=>x.schema==='public').length,publicPolicies:snapshot.policies.filter(x=>x.schema==='public').length,storagePolicies:snapshot.policies.filter(x=>x.schema==='storage').length,rlsDisabled:snapshot.tables.filter(x=>x.schema==='public'&&!x.rlsEnabled).length,definitionSha256:sha256(Buffer.from(JSON.stringify(snapshot)))};}
export function assertSchemaSecurity(expected,actual){if(expected?.version!==2||actual?.version!==2||JSON.stringify(expected)!==JSON.stringify(actual))throw Error('Schema security definitions differ');}
export function assertConfined(base,target,flavor=path){const rel=flavor.relative(flavor.resolve(base),flavor.resolve(target));if(rel==='..'||rel.startsWith('..'+flavor.sep)||flavor.isAbsolute(rel))throw Error('Real path escapes bundle');return target;}
export const coreTables=['profiles','universities','programs','application_rounds','sources','source_assertions','applications','program_material_requirements','program_test_requirements','program_essay_requirements','program_recommendation_requirements','materials','material_versions','application_materials','evidence_items','evidence_material_links','material_application_links','essays','essay_versions','essay_evidence_links','essay_evidence_items','recommenders','recommendation_requests','portal_sections','submissions','decisions','tasks','inbox_items','import_batches','audit_events'];
export function validateSecuritySnapshot(snapshot){
 if(snapshot?.version!==2||!['functions','triggers','policies','tables'].every(key=>Array.isArray(snapshot[key])))throw Error('Complete schema security definitions required');
 const tableKeys=new Set();for(const table of snapshot.tables){if(!['public','storage'].includes(table.schema)||typeof table.name!=='string'||typeof table.rlsEnabled!=='boolean'||typeof table.rlsForced!=='boolean')throw Error('Invalid table security definitions');const key=table.schema+'.'+table.name;if(tableKeys.has(key))throw Error('Duplicate table security definitions');tableKeys.add(key);}
 if(coreTables.some(table=>!tableKeys.has('public.'+table))||!tableKeys.has('storage.objects')||!snapshot.functions.length||!snapshot.triggers.length||!snapshot.policies.length)throw Error('Incomplete schema security definitions');
 if(['is_owner','set_updated_at','import_atlas_backup','save_essay_version','record_submission','delete_material_version'].some(name=>!snapshot.functions.some(fn=>fn.schema==='public'&&fn.name===name)))throw Error('Required application function definitions missing');
 for(const fn of snapshot.functions)if(!['public','storage'].includes(fn.schema)||typeof fn.name!=='string'||typeof fn.arguments!=='string'||typeof fn.definition!=='string'||!/^CREATE OR REPLACE FUNCTION /i.test(fn.definition))throw Error('Invalid function security definitions');
 for(const trigger of snapshot.triggers)if(!tableKeys.has(trigger.schema+'.'+trigger.table)||typeof trigger.name!=='string'||!['O','D','R','A'].includes(trigger.enabled)||typeof trigger.definition!=='string'||!/^CREATE /i.test(trigger.definition))throw Error('Invalid trigger security definitions');
 for(const policy of snapshot.policies)if(!tableKeys.has(policy.schema+'.'+policy.table)||typeof policy.name!=='string'||!['PERMISSIVE','RESTRICTIVE'].includes(policy.permissive)||!['ALL','SELECT','INSERT','UPDATE','DELETE'].includes(policy.cmd)||!Array.isArray(policy.roles)||!policy.roles.length||policy.roles.some(role=>typeof role!=='string')||!(policy.qual===null||typeof policy.qual==='string')||!(policy.with_check===null||typeof policy.with_check==='string'))throw Error('Invalid policy security definitions');
 for(const table of snapshot.tables.filter(t=>t.schema==='public'||t.schema==='storage'&&t.name==='objects'))if(!table.rlsEnabled||!snapshot.policies.some(policy=>policy.schema===table.schema&&policy.table===table.name))throw Error('Private table RLS or policy definitions missing');
 return snapshot;
}
export function validateExport(data,expectedTables=[]){
 if(!data||data.schemaVersion!==3||typeof data.exportedAt!=='string'||!Number.isFinite(Date.parse(data.exportedAt))||!data.tables||typeof data.tables!=='object'||Array.isArray(data.tables))throw Error('Invalid schema3 export');
 for(const table of coreTables)if(!Object.hasOwn(data.tables,table))throw Error('Required core export table missing');
 if(expectedTables.length&&JSON.stringify(Object.keys(data.tables).sort())!==JSON.stringify([...expectedTables].sort()))throw Error('Export tables differ from schema snapshot');
 for(const [table,rows]of Object.entries(data.tables)){if(!/^[a-z][a-z0-9_]*$/.test(table)||!Array.isArray(rows))throw Error('Export tables must be normalized array values');const ids=new Set();for(const row of rows){if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.id!=='string'||!row.id.trim())throw Error('Export row ID missing');if(ids.has(row.id))throw Error('Export row has duplicate ID');ids.add(row.id);}}
 return data.tables;
}
export function validateRestoreCredentials(credentials,manifest,tables){
 if(!credentials||credentials.backupId!==manifest.backupId||typeof credentials.id!=='string'||typeof credentials.email!=='string'||!credentials.email.includes('@')||typeof credentials.password!=='string'||!credentials.password)throw Error('Matching private restore credentials required');
 if(!tables.profiles?.some(row=>row.id===credentials.id)||!Object.values(tables).some(rows=>rows.some(row=>row.owner_id===credentials.id)))throw Error('Restore credential owner absent from backup');return credentials;
}
export async function loadRestoreCredentials({file=path.join(root,'work/backup-test-credentials.json'),env=process.env,manifest,tables}){
 const keys=['ATLAS_RESTORE_EMAIL','ATLAS_RESTORE_PASSWORD','ATLAS_RESTORE_OWNER_ID','ATLAS_RESTORE_BACKUP_ID'];let credentials;
 if(keys.some(key=>env[key]!==undefined))credentials={email:env.ATLAS_RESTORE_EMAIL,password:env.ATLAS_RESTORE_PASSWORD,id:env.ATLAS_RESTORE_OWNER_ID,backupId:env.ATLAS_RESTORE_BACKUP_ID};
 else{try{credentials=JSON.parse(await fs.readFile(file,'utf8'));}catch{throw Error('Matching private restore credentials required');}}
 return validateRestoreCredentials(credentials,manifest,tables);
}
export async function preflightRestoreBundle(dir,{file,env=process.env,credentials}={}){
 const manifest=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'));if(manifest.status!=='PASS')throw Error('Backup is partial or failed');
 if(manifest.backupId!==path.basename(path.resolve(dir)))throw Error('Invalid backup metadata');validateSecuritySnapshot(manifest.schemaSecurity);
 const entry=manifest.files?.filter(file=>file.filename==='atlas-export.json');if(entry?.length!==1||entry[0].status!=='PASS')throw Error('Export component missing');
 const target=safePath(dir,'atlas-export.json');assertConfined(await fs.realpath(dir),await fs.realpath(target));const bytes=await fs.readFile(target);if(bytes.length!==entry[0].size||sha256(bytes)!==entry[0].sha256)throw Error('Export checksum mismatch');
 let data;try{data=JSON.parse(bytes.toString());}catch{throw Error('Invalid schema3 export JSON');}const tables=validateExport(data,manifest.schemaSecurity.tables.filter(table=>table.schema==='public').map(table=>table.name));
 credentials=credentials?validateRestoreCredentials(credentials,manifest,tables):await loadRestoreCredentials({file,env,manifest,tables});return {manifest,tables,credentials};
}
export function validateArchiveList(list,tables){
 const publicTables=list.split(/\r?\n/).map(line=>line.match(/\bTABLE DATA public ([a-z][a-z0-9_]*)\s/)?.[1]).filter(Boolean).sort();
 if(JSON.stringify(publicTables)!==JSON.stringify([...tables].sort()))throw Error('Database dump public table inventory differs from export');
 for(const table of ['users','identities'])if(!list.split(/\r?\n/).some(line=>line.includes(` TABLE DATA auth ${table} `)))throw Error('Database dump missing auth-compatible users');return true;
}
export function validateArchive(bytes,tables,container){
 if(bytes.length<20||bytes.subarray(0,5).toString()!=='PGDMP')throw Error('Invalid database dump header');
 const databaseContainer=container||project();const list=command('docker',['exec','-i',databaseContainer,'pg_restore','--list'],{input:bytes});validateArchiveList(list,tables);
 // Listing checks only the TOC. Decode the entire archive without executing SQL or exposing data.
 command('docker',['exec','-i',databaseContainer,'pg_restore','--file=/dev/null','--exit-on-error'],{input:bytes});return true;
}
export async function verifyBundle(dir,{archiveValidator=validateArchive,container}={}){
 const manifest=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'));
 if(manifest.status!=='PASS')throw Error('Backup is partial or failed');
 if(!Array.isArray(manifest.files)||!Array.isArray(manifest.objects)||!['database.dump','atlas-export.json'].every(name=>manifest.files.some(f=>f.filename===name&&f.status==='PASS')))throw Error('Required backup components missing');
 if(manifest.objects.some(object=>object.bytesPresent===false||object.checksumKind==='METADATA_ROW_JSON'||object.contentChecksumKind==='METADATA_ROW_JSON_SHA256'))throw Error('Backup requires original file bytes; metadata-only forensic copies are not file backups');
 if(manifest.objects.some(o=>o.status!=='PASS'||!manifest.files.some(f=>f.filename===o.filename&&f.size===o.size&&f.sha256===o.sha256))||manifest.missingReferences?.length)throw Error('Backup contains partial storage results');
 if(manifest.backupId!==path.basename(path.resolve(dir))||!Number.isFinite(Date.parse(manifest.createdAt))||!['daily','manual'].includes(manifest.kind)||!/^\d{12}$/.test(manifest.migrationHead))throw Error('Invalid backup metadata');
 validateSecuritySnapshot(manifest.schemaSecurity);
 const fileNames=new Set();const content=new Map();const realBase=await fs.realpath(dir);
 for(const file of manifest.files){if(fileNames.has(file.filename)||!Number.isSafeInteger(file.size)||file.size<0||!/^([a-f0-9]{64})$/.test(file.sha256))throw Error('Invalid or duplicate file metadata');fileNames.add(file.filename);const target=safePath(dir,file.filename),real=await fs.realpath(target);assertConfined(realBase,real);const bytes=await fs.readFile(target);if(file.status!=='PASS'||bytes.length!==file.size||sha256(bytes)!==file.sha256)throw Error(`Checksum mismatch: ${file.filename}`);content.set(file.filename,bytes);}
 let exported;try{exported=JSON.parse(content.get('atlas-export.json').toString());}catch{throw Error('Invalid schema3 export JSON');}
 const tables=validateExport(exported,manifest.schemaSecurity.tables.filter(t=>t.schema==='public').map(t=>t.name));
 const dump=content.get('database.dump');if(dump.length<20||dump.subarray(0,5).toString()!=='PGDMP')throw Error('Invalid database dump header');if(await archiveValidator(dump,Object.keys(tables),container)!==true)throw Error('Database archive validation failed');
 const objectKeys=new Set();for(const object of manifest.objects){if(typeof object.bucket!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(object.bucket)||typeof object.path!=='string'||object.filename!==`storage/${object.bucket}/${object.path}`)throw Error('Object logical path differs from file path');safePath(dir,object.filename);const key=JSON.stringify([object.bucket,object.path]);if(objectKeys.has(key))throw Error('Duplicate storage object');objectKeys.add(key);}
 if(manifest.files.some(file=>file.filename.startsWith('storage/')&&!manifest.objects.some(object=>object.filename===file.filename)))throw Error('Storage file missing from object inventory');
 const refs=references(tables);for(const ref of refs){const object=manifest.objects.find(o=>o.bucket===ref.bucket&&o.path===ref.path);if(!object)throw Error('Referenced storage object missing from bundle');if(ref.table==='material_versions'){const row=tables.material_versions.find(r=>r.id===ref.id);if(row.sha256&&row.sha256!==object.sha256||row.size_bytes!=null&&Number(row.size_bytes)!==object.size)throw Error('Material reference checksum or size mismatch');}if(ref.table==='import_batches'){const row=tables.import_batches.find(r=>r.id===ref.id);if(row.checksum&&row.checksum!==object.sha256)throw Error('Import archive checksum mismatch');}}
 for(const object of manifest.objects){const linked=refs.filter(r=>r.bucket===object.bucket&&r.path===object.path);for(const [key,values]of [['materialIds',linked.map(r=>r.materialId)],['versionIds',linked.map(r=>r.versionId)]]){const expected=[...new Set(values.filter(Boolean))].sort();if(!Array.isArray(object[key])||JSON.stringify([...new Set(object[key])].sort())!==JSON.stringify(expected))throw Error('Object material/version metadata differs from export');}}
 return manifest;
}
export async function retain(){
 await fs.mkdir(backupRoot,{recursive:true});const realRoot=await fs.realpath(backupRoot);const rel=path.relative(await fs.realpath(root),realRoot);if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw Error('Backup root escapes workspace');
 const rows=[];for(const entry of await fs.readdir(backupRoot,{withFileTypes:true})){if(!entry.isDirectory()||entry.isSymbolicLink())continue;const dir=safePath(backupRoot,entry.name);try{const m=await verifyBundle(dir);rows.push({...m,directory:dir});}catch{}}
 for(const row of retentionCandidates(rows)){const real=await fs.realpath(row.directory);if(path.dirname(real)!==realRoot)throw Error('Retention target escapes backup root');await fs.rm(real,{recursive:true});}
}

