import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import {root,settings,project,command,api,writeJSON,preflightRestoreBundle} from './backup-lib.mjs';
import {backup} from './backup.mjs';
import {restore} from './restore.mjs';
import {parseRestoreArgs,restoreHelp,validateRestoreTarget,validateRestoreSource} from './restore-preflight.mjs';
let options;
try{options=parseRestoreArgs(process.argv.slice(2));}catch(e){console.error(e.message);process.exit(1);}
if(options.help){console.log(restoreHelp);process.exit(0);}
const cli=path.join(root,'node_modules/supabase/dist/supabase.js');
const excludes='realtime,studio,postgres-meta,edge-runtime,logflare,vector,supavisor,imgproxy';
const targetArg=options.target;
const reportArg=options.report;
const credentialsArg=options.credentials;
const bundleFlag=Boolean(options.bundle);
const bundleArg=options.bundle;
const cwd=targetArg?path.resolve(targetArg):path.join(root,'work/backup-test-stack');
const reportPath=reportArg?path.resolve(reportArg):null;
const reportTarget=reportPath||path.join(root,'work/backup-test-restore-report.json');
const fixedTarget=path.join(root,'work/backup-test-stack');
const fixedReport=path.join(root,'work/backup-test-restore-report.json');
const fixedCredentials=path.join(root,'work/backup-test-credentials.json');
const samePath=(a,b)=>path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
const isIsolatedTarget=p=>{const rel=path.relative(path.join(root,'work'),path.resolve(p));return Boolean(rel&&!rel.startsWith('..')&&!path.isAbsolute(rel));};
async function freePort(port){return await new Promise(resolve=>{const server=net.createServer();server.once('error',()=>resolve(false));server.listen(port,'127.0.0.1',()=>server.close(()=>resolve(true)));});}
async function addImportFixture(s,fixture){
 const bytes=Buffer.from(JSON.stringify({schemaVersion:3,exportedAt:new Date().toISOString(),tables:{}}));const checksum=crypto.createHash('sha256').update(bytes).digest('hex');const archive_path=`${fixture.id}/imports/${checksum}/source.json`;
 fixture.archive_path=archive_path;await writeJSON(path.join(root,'work/backup-test-credentials.json'),fixture);
 await api(s,`/storage/v1/object/application-documents/${archive_path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:bytes});
 await api(s,'/rest/v1/import_batches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner_id:fixture.id,source:'BACKUP_DRILL',source_schema_version:3,checksum,archive_path,status:'COMPLETED',completed_at:new Date().toISOString(),records_imported:{},plan_checksum:checksum})});
}
let fixture;let createdFixture=false;
try {
 let dir=bundleArg?path.resolve(bundleArg):null;
 if(bundleFlag&&!bundleArg)throw Error('--bundle requires a bundle directory path');
 if(dir&&(!targetArg||!reportArg||!credentialsArg))throw Error('--bundle requires explicit --target/--target-cwd, --report, and --credentials paths');
 if(dir&&(samePath(cwd,root)||!isIsolatedTarget(cwd)||samePath(cwd,fixedTarget)))throw Error('--bundle target must be a unique isolated directory inside work/');
 if(dir&&(samePath(reportTarget,fixedReport)||samePath(credentialsArg,fixedCredentials)))throw Error('--bundle refuses legacy fixed report or credentials paths');
 if(dir){
  const manifest=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'));
  if(manifest.environment==='http://127.0.0.1:55421')throw Error('--bundle refuses a backup from the main local stack');
  validateRestoreSource(manifest);
 }
 if(process.argv.includes('--verify-only')&&(!dir||!process.argv.includes('--resume')))throw Error('--verify-only requires --bundle and --resume');
 if(await validateRestoreTarget(cwd,root,{resume:Boolean(options.resume)}))if(!options.resume)throw Error('Archive/stop the previous isolated restore project before a fresh drill');
 if(!dir){const s=settings();if(s.API_URL!=='http://127.0.0.1:55421')throw Error('Fixture limited to Atlas local stack');const email=`atlas-restore-${crypto.randomUUID()}@example.invalid`,password=crypto.randomBytes(28).toString('base64url');const user=await(await api(s,'/auth/v1/admin/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,email_confirm:true})})).json();fixture={id:user.id,email,password};createdFixture=true;await writeJSON(path.join(root,'work/backup-test-credentials.json'),fixture);
 async function insert(table,row){return (await(await api(s,`/rest/v1/${table}`,{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(row)})).json())[0];}
 await insert('profiles',{id:user.id,display_name:'Restore drill fake applicant'});const owner_id=user.id;const uni=await insert('universities',{owner_id,name:'Restore Drill University'});const program=await insert('programs',{owner_id,university_id:uni.id,program_name:'Restore Drill MSc',intake_year:2027});const round=await insert('application_rounds',{owner_id,program_id:program.id,name:'Drill Round',deadline_date:'2027-06-01',deadline_precision:'DATE_ONLY',timezone:'Asia/Tokyo'});const app=await insert('applications',{owner_id,program_id:program.id,target_round_id:round.id,status:'PREPARING'});const material=await insert('materials',{owner_id,type:'CV',title:'Restore drill CV'});const versionId=crypto.randomUUID(),storage_path=`${owner_id}/materials/${material.id}/${versionId}/drill.pdf`,bytes=Buffer.from('%PDF-1.4\nAtlas restore fixture\n%%EOF');await api(s,`/storage/v1/object/application-documents/${storage_path}`,{method:'POST',headers:{'Content-Type':'application/pdf'},body:bytes});await insert('material_versions',{id:versionId,owner_id,material_id:material.id,version_number:1,storage_path,original_filename:'drill.pdf',mime_type:'application/pdf',size_bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});await insert('submissions',{owner_id,application_id:app.id,submitted_at:new Date().toISOString(),application_number:'RESTORE-FAKE',receipt_storage_path:storage_path});fixture.storage_path=storage_path;await writeJSON(path.join(root,'work/backup-test-credentials.json'),fixture);await addImportFixture(s,fixture);dir=await backup();}
 if(createdFixture){fixture.backupId=path.basename(dir);await writeJSON(path.join(root,'work/backup-test-credentials.json'),fixture);await writeJSON(path.join(root,`work/backup-test-credentials-${fixture.backupId}.json`),fixture);}
 const preflight=await preflightRestoreBundle(dir,{file:credentialsArg?path.resolve(credentialsArg):undefined,credentials:createdFixture?fixture:undefined});fixture=preflight.credentials;
 const configPath=path.join(cwd,'supabase/config.toml');await fs.mkdir(path.dirname(configPath),{recursive:true});
 const configExists=await fs.stat(configPath).catch(()=>null);
 if(configExists&&!process.argv.includes('--resume'))throw Error('Restore drill directory exists; use --resume only for an interrupted empty isolated restore, or archive before rerunning');
 if(!configExists){
 const dbPort=await freePort(55432)?55432:55442;if(!await freePort(dbPort)||!await freePort(55431)||!await freePort(55434))throw Error('Isolated restore ports occupied');
 const config=(await fs.readFile(path.join(root,'supabase/config.toml'),'utf8')).replace(/^project_id\s*=.*$/m,`project_id = "atlas-restore-${crypto.randomUUID().slice(0,8)}"`).replaceAll('55421','55431').replaceAll('55422',String(dbPort)).replaceAll('55423','55433').replaceAll('55424','55434').replaceAll('55420','55430').replaceAll('54327','55437').replaceAll('54329','55439').replaceAll('55429','55439');await fs.writeFile(configPath,config);await fs.cp(path.join(root,'supabase/migrations'),path.join(cwd,'supabase/migrations'),{recursive:true});await fs.copyFile(path.join(root,'supabase/seed.sql'),path.join(cwd,'supabase/seed.sql'));
 }
 command(process.execPath,[cli,'start','-x',excludes],{cwd,timeout:300000});
 const report=await restore(dir,cwd,{verifyOnly:process.argv.includes('--verify-only')});report.relationships='All public foreign keys checked against restored parent rows';
 const s=settings(cwd);const response=await fetch(`${s.API_URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:s.ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({email:fixture.email,password:fixture.password})});if(!response.ok||(await response.json()).user.id!==fixture.id)throw Error('Restored matching owner auth login failed');report.authLogin='PASS';report.status='RESTORE_PASS';
 await writeJSON(reportTarget,report);console.log(JSON.stringify(report,null,2));
}catch(e){if(reportArg||!bundleFlag)await writeJSON(reportTarget,{status:'RESTORE_FAIL',failure:e.message,checkedAt:new Date().toISOString()});console.error(`RESTORE_FAIL ${e.message}`);process.exitCode=1;}
finally{if(createdFixture&&fixture){try{const s=settings();if(fixture.storage_path)await api(s,'/storage/v1/object/application-documents',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[fixture.storage_path,fixture.archive_path].filter(Boolean)})});await api(s,`/auth/v1/admin/users/${fixture.id}`,{method:'DELETE'});}catch{console.error('Fake fixture cleanup incomplete; private credentials file identifies only its ID');process.exitCode=1;}}}



