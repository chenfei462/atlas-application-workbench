// Isolated synthetic-only SOURCE stack for M5/M6/M7 backup + integrity.
// Creates a disposable Supabase stack under work/ on unique 5545x ports (never
// 55421 main local stack, never 55431/5543x restore target), seeds a synthetic
// fixture, backs it up with backup({cwd}) into a fresh backups/ bundle, runs
// integrity.mjs --bundle --report (report-only), then stops the source stack.
// Never touches the main local stack or any real data/credentials.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import {spawnSync} from 'node:child_process';
import {root,settings,command,api,writeJSON} from './backup-lib.mjs';
import {backup} from './backup.mjs';

const cli=path.join(root,'node_modules/supabase/dist/supabase.js');
const excludes='realtime,studio,postgres-meta,edge-runtime,logflare,vector,supavisor,imgproxy';
const argValue=name=>{const i=process.argv.indexOf(name);return i>=0&&process.argv[i+1]&&!process.argv[i+1].startsWith('--')?process.argv[i+1]:undefined;};
const reportArg=argValue('--report');
const credentialsArg=argValue('--credentials');
const runId=crypto.randomUUID().slice(0,8);
const sourceDir=path.join(root,'work',`backup-source-${runId}`);
const reportPath=reportArg?path.resolve(reportArg):path.join(root,'work',`backup-source-integrity-${runId}.json`);
const credentialsPath=credentialsArg?path.resolve(credentialsArg):path.join(root,'work',`backup-source-credentials-${runId}.json`);
const sourceStarted={value:false};

async function freePort(port){return await new Promise(resolve=>{const server=net.createServer();server.once('error',()=>resolve(false));server.listen(port,'127.0.0.1',()=>server.close(()=>resolve(true)));});}
async function writeConfig(){
 const configPath=path.join(sourceDir,'supabase/config.toml');await fs.mkdir(path.dirname(configPath),{recursive:true});
 const config=(await fs.readFile(path.join(root,'supabase/config.toml'),'utf8'))
  .replace(/^project_id\s*=.*$/m,`project_id = "atlas-source-${runId}"`)
  .replaceAll('55421','55451').replaceAll('55422','55452').replaceAll('55423','55453')
  .replaceAll('55424','55454').replaceAll('55420','55450').replaceAll('54327','55457')
  .replaceAll('54329','55459').replaceAll('55429','55459');
 await fs.writeFile(configPath,config);
 await fs.cp(path.join(root,'supabase/migrations'),path.join(sourceDir,'supabase/migrations'),{recursive:true});
 await fs.copyFile(path.join(root,'supabase/seed.sql'),path.join(sourceDir,'supabase/seed.sql'));
}
async function seedFixture(s){
 const email=`atlas-source-${runId}@example.invalid`,password=crypto.randomBytes(28).toString('base64url');
 const user=await(await api(s,'/auth/v1/admin/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,email_confirm:true})})).json();
 const fixture={id:user.id,email,password};
 const insert=async(table,row)=>(await(await api(s,`/rest/v1/${table}`,{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(row)})).json())[0];
 await insert('profiles',{id:user.id,display_name:'Isolated source fake applicant'});
 const owner_id=user.id;
 const uni=await insert('universities',{owner_id,name:'Isolated Source University'});
 const program=await insert('programs',{owner_id,university_id:uni.id,program_name:'Isolated Source MSc',intake_year:2027});
 const round=await insert('application_rounds',{owner_id,program_id:program.id,name:'Source Round',deadline_date:'2027-06-01',deadline_precision:'DATE_ONLY',timezone:'Asia/Tokyo'});
 const app=await insert('applications',{owner_id,program_id:program.id,target_round_id:round.id,status:'PREPARING'});
 const material=await insert('materials',{owner_id,type:'CV',title:'Isolated source CV'});
 const versionId=crypto.randomUUID(),storage_path=`${owner_id}/materials/${material.id}/${versionId}/drill.pdf`;
 const bytes=Buffer.from('%PDF-1.4\nAtlas isolated source fixture\n%%EOF');
 await api(s,`/storage/v1/object/application-documents/${storage_path}`,{method:'POST',headers:{'Content-Type':'application/pdf'},body:bytes});
 await insert('material_versions',{id:versionId,owner_id,material_id:material.id,version_number:1,storage_path,original_filename:'drill.pdf',mime_type:'application/pdf',size_bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
 await insert('submissions',{owner_id,application_id:app.id,submitted_at:new Date().toISOString(),application_number:'SOURCE-FAKE',receipt_storage_path:storage_path});
 const archiveBytes=Buffer.from(JSON.stringify({schemaVersion:3,exportedAt:new Date().toISOString(),tables:{}}));
 const checksum=crypto.createHash('sha256').update(archiveBytes).digest('hex'),archive_path=`${owner_id}/imports/${checksum}/source.json`;
 fixture.archive_path=archive_path;
 await api(s,`/storage/v1/object/application-documents/${archive_path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:archiveBytes});
 await insert('import_batches',{owner_id,source:'ISOLATED_SOURCE',source_schema_version:3,checksum,archive_path,status:'COMPLETED',completed_at:new Date().toISOString(),records_imported:{},plan_checksum:checksum});
 fixture.backupId=null;fixture.storage_path=storage_path;
 await writeJSON(credentialsPath,fixture);
 return fixture;
}
async function runIntegrity(bundleDir){
 const r=spawnSync(process.execPath,['scripts/integrity.mjs','--bundle',bundleDir,'--report',reportPath],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024});
 return {status:r.status,stdout:r.stdout,stderr:r.stderr};
}
const result={sourceDir,reportPath,credentialsPath,status:'FAIL'};
try {
 for(const port of [55451,55452,55453,55454,55450,55457,55459]){if(!await freePort(port))throw Error(`Port ${port} occupied; abort source stack`);}
 await writeConfig();
 command(process.execPath,[cli,'start','-x',excludes],{cwd:sourceDir,timeout:300000});
 sourceStarted.value=true;
 const s=settings(sourceDir);
 if(s.API_URL==='http://127.0.0.1:55421')throw Error('Source settings resolved to the main local stack; aborting');
 result.apiUrl=s.API_URL;result.dbPort=new URL(s.DB_URL).port;
 const fixture=await seedFixture(s);
 result.fixtureId=fixture.id;
 const bundleDir=await backup({cwd:sourceDir});
 result.bundleDir=bundleDir;result.backupId=path.basename(bundleDir);
 fixture.backupId=result.backupId;await writeJSON(credentialsPath,fixture);
 const integrity=await runIntegrity(bundleDir);
 result.integrity={exitCode:integrity.status,stdoutTail:(integrity.stdout||'').slice(-4000)};
 if(integrity.status!==0)throw Error(`integrity --bundle exited ${integrity.status}`);
 result.status='SOURCE_BACKUP_PASS';
 console.log(JSON.stringify(result,null,2));
 console.log('\nISOLATED SOURCE BACKUP + INTEGRITY PASS');
}catch(e){
 result.failure=e.message;
 console.error(`ISOLATED_SOURCE_FAIL ${e.message}`);
 try{await writeJSON(reportPath,{status:'FAIL',failure:e.message,checkedAt:new Date().toISOString()});}catch{}
 process.exitCode=1;
}finally{
 if(sourceStarted.value){try{command(process.execPath,[cli,'stop'],{cwd:sourceDir,timeout:120000});result.sourceStopped=true;console.log('SOURCE_STOPPED');}catch(e){result.sourceStopped=false;console.error(`SOURCE_STOP_FAIL ${e.message}`);process.exitCode=1;}}
}