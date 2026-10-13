import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {root,backupRoot,settings,project,sql,command,api,exportTables,inventory,writeJSON,safePath,sha256,retain,references,schemaSecurity,verifyBundle} from './backup-lib.mjs';
export async function backup({daily=false,cwd=root}={}){
 const backupId=new Date().toISOString().replaceAll(':','-')+'-'+crypto.randomUUID().slice(0,8);const dumpTmp=`/tmp/atlas-${backupId}.dump`;const dir=safePath(backupRoot,backupId);await fs.mkdir(backupRoot,{recursive:true});const backupRel=path.relative(await fs.realpath(root),await fs.realpath(backupRoot));if(!backupRel||backupRel.startsWith('..')||path.isAbsolute(backupRel))throw Error('Backup root escapes workspace');await fs.mkdir(dir);
 const manifest={backupId,createdAt:new Date().toISOString(),environment:'Atlas local Supabase',kind:daily?'daily':'manual',migrationHead:null,status:'RUNNING',files:[],objects:[]};
 async function record(filename){const bytes=await fs.readFile(safePath(dir,filename));manifest.files.push({filename,size:bytes.length,sha256:sha256(bytes),status:'PASS'});}
 try{
 const s=settings(cwd),db=project(cwd);manifest.environment=new URL(s.API_URL).origin;
 manifest.migrationHead=sql(db,"select coalesce(max(version),'') from supabase_migrations.schema_migrations;");
 manifest.schemaSecurity=schemaSecurity(db);
 const tables=await exportTables(s,db);const objects=await inventory(db);
 manifest.buckets=JSON.parse(sql(db,"select coalesce(json_agg(b),'[]') from storage.buckets b;"));
 command('docker',['exec',db,'pg_dump','-U','postgres','-d','postgres','--format=custom',`--file=${dumpTmp}`,'--schema=public','--schema=auth','--schema=storage']);
 command('docker',['cp',`${db}:${dumpTmp}`,path.join(dir,'database.dump')]);command('docker',['exec',db,'rm','--',dumpTmp]);await record('database.dump');
 await writeJSON(path.join(dir,'atlas-export.json'),{schemaVersion:3,exportedAt:new Date().toISOString(),tables});await record('atlas-export.json');
 const refs=references(tables);
 for(const object of objects){const entry={bucket:object.bucket_id,path:object.name,owner:object.owner_id,materialIds:refs.filter(x=>x.bucket===object.bucket_id&&x.path===object.name).map(x=>x.materialId).filter(Boolean),versionIds:refs.filter(x=>x.bucket===object.bucket_id&&x.path===object.name).map(x=>x.versionId).filter(Boolean),metadata:object.metadata,objectVersion:object.version,backedUpAt:new Date().toISOString(),status:'FAIL'};manifest.objects.push(entry);try{const filename=`storage/${object.bucket_id}/${object.name}`;const target=safePath(dir,filename);const response=await api(s,`/storage/v1/object/authenticated/${encodeURIComponent(object.bucket_id)}/${object.name.split('/').map(encodeURIComponent).join('/')}`);const bytes=Buffer.from(await response.arrayBuffer());await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);entry.filename=filename;entry.size=bytes.length;entry.sha256=sha256(bytes);entry.status='PASS';await record(filename);}catch{entry.error='Object download or path validation failed';}}
 const missing=refs.filter(r=>!objects.some(o=>o.bucket_id===r.bucket&&o.name===r.path));manifest.missingReferences=missing;
 if(manifest.objects.some(x=>x.status!=='PASS')||missing.length)throw Error('Storage inventory incomplete or referenced objects missing');
 const after=await exportTables(s,db);if(sha256(Buffer.from(JSON.stringify(tables)))!==sha256(Buffer.from(JSON.stringify(after)))||sha256(Buffer.from(JSON.stringify(objects)))!==sha256(Buffer.from(JSON.stringify(await inventory(db)))))throw Error('Source changed during backup; retry during a quiet period');
 if(sql(db,"select coalesce(max(version),'') from supabase_migrations.schema_migrations;")!==manifest.migrationHead||JSON.stringify(schemaSecurity(db))!==JSON.stringify(manifest.schemaSecurity))throw Error('Schema changed during backup; retry');
 manifest.status='PASS';await writeJSON(path.join(dir,'manifest.json'),manifest);await verifyBundle(dir,{container:db});if(daily)await retain();console.log(`BACKUP_PASS ${backupId}`);return dir;
 }catch(e){manifest.status='FAIL';manifest.failure=e.message;await writeJSON(path.join(dir,'manifest.json'),manifest);throw e;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const cwdIndex=process.argv.indexOf('--cwd');const cwdArg=cwdIndex>=0?process.argv[cwdIndex+1]:undefined;if(cwdIndex>=0&&(!cwdArg||cwdArg.startsWith('--'))){console.error('BACKUP_FAIL --cwd requires a directory path');process.exitCode=1;}else backup({daily:process.argv.includes('--daily'),cwd:cwdArg?path.resolve(cwdArg):root}).catch(e=>{console.error(`BACKUP_FAIL ${e.message}`);process.exitCode=1;});}

