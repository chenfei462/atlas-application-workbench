import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createClient} from '@supabase/supabase-js';
import {buildImportPlan,importBackup,sha256} from '../src/migration/index.ts';
import {createDemoStore} from '../outputs/domain.js';
const root=path.resolve(import.meta.dirname,'..');
const status=spawnSync(process.execPath,[path.join(root,'node_modules/supabase/dist/supabase.js'),'status','--output','json'],{cwd:root,encoding:'utf8'});
assert.equal(status.status,0,'Start local Supabase first');const settings=JSON.parse(status.stdout);
assert.equal(settings.API_URL,'http://127.0.0.1:55421','Importer tests restricted to this Atlas local stack');
const admin=createClient(settings.API_URL,settings.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const clients=[];const archives=[];const ok=r=>{assert.equal(r.error,null,JSON.stringify(r.error));return r.data;};
async function user(){const c=createClient(settings.API_URL,settings.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const d=ok(await c.auth.signUp({email:`atlas-import-${crypto.randomUUID()}@example.invalid`,password:crypto.randomUUID()+'Aa!'}));assert.ok(d.session);clients.push({c,id:d.user.id});return clients.at(-1);}
async function count(c,t){return ok(await c.from(t).select('*')).length;}
try{
 const a=await user(),b=await user();const demo=createDemoStore();demo.programs[2].applicationRounds=[{id:'unknown-round',name:'Unknown deadline',deadline:null,sourceUrl:'https://example.edu/unknown'}];demo.materialVersions=[{id:'cv-v3',materialId:'mat-cv',version:3,variant:'FINTECH',originalFilename:'fake-cv.txt',mimeType:'text/plain',sizeBytes:0}];demo.applications[0].portal.sections=[{id:'education',key:'education',status:'COMPLETE'}];demo.applications[0].submission={id:'submit1',submittedAt:'2026-10-10T10:00:00+08:00',applicationNumber:'FAKE-TEST',confirmationReceived:true};demo.applications[0].decision={id:'decision1',type:'OFFER',receivedAt:'2026-10-10T10:30:00+08:00',conditions:['Fake condition']};demo.applications[0].materialLinks=[{id:'am1',requirementId:'program-cuhksz-fintech:document:0',materialVersionId:'cv-v3',status:'COMPLETE'}];demo.auditLog=[{id:'legacy-audit',action:'CLIENT_HISTORY'}];demo.essayVersions[0].content='真实保存文本 🌏';const raw=' '+JSON.stringify(demo,null,2)+'\r\n';
 const plan=await buildImportPlan(raw,a.id);const archive=`${a.id}/imports/${plan.checksum}/source.json`;archives.push({c:a.c,path:archive});
 const first=await importBackup(a.c,raw);assert.equal(first.repeated,false);assert.deepEqual(first.counts,plan.counts);
 const saved=ok(await a.c.storage.from('application-documents').download(archive));assert.deepEqual(new Uint8Array(await saved.arrayBuffer()),new TextEncoder().encode(raw));assert.equal(await sha256(raw),plan.checksum);
 const again=await importBackup(a.c,raw);assert.equal(again.repeated,true);assert.equal(await count(a.c,'essay_versions'),1);assert.equal(await count(a.c,'import_batches'),1);
 assert.equal(await count(b.c,'programs'),0);assert.ok((await b.c.storage.from('application-documents').download(archive)).error);
 console.log('SDK IMPORT PASS: nested graph, repeat, owner isolation, original UTF-8 bytes');
 const changed=structuredClone(demo);changed.essayVersions[0].content='Contradictory immutable history';const changedRaw=JSON.stringify(changed);archives.push({c:a.c,path:`${a.id}/imports/${await sha256(changedRaw)}/source.json`});
 await assert.rejects(importBackup(a.c,changedRaw),/conflict/i);assert.equal(await count(a.c,'import_batches'),1);assert.equal(ok(await a.c.from('essay_versions').select('content'))[0].content,'真实保存文本 🌏');
 const late=structuredClone(demo);late.programs.forEach(p=>{p.id='late-'+p.id;p.universityId='late-'+p.universityId;p.applicationRounds.forEach(r=>r.id='late-'+r.id);p.sourceRecords.forEach(r=>r.id='late-'+r.id);});late.applications=[];late.materials=[];late.materialVersions=[];late.essays=[];late.essayVersions=[];late.recommenders=[];late.recommendationRequests=[];late.evidence=[];late.tasks=[{id:'late-task',title:'Late failure',status:'INVALID'}];const lateRaw=JSON.stringify(late);archives.push({c:a.c,path:`${a.id}/imports/${await sha256(lateRaw)}/source.json`});
 const before=await count(a.c,'universities');await assert.rejects(importBackup(a.c,lateRaw),/Transactional import failed/);assert.equal(await count(a.c,'universities'),before);assert.equal(await count(a.c,'import_batches'),1);
 const spoof=structuredClone(plan.rows);spoof.universities[0].owner_id=b.id;const rpc=await a.c.rpc('import_atlas_backup',{p_checksum:plan.checksum,p_schema_version:2,p_archive_path:archive,p_rows:spoof,p_id_map:plan.idMap,p_warnings:[]});assert.ok(rpc.error);
 ok(await a.c.from('programs').update({notes:'Remote edit preserved'}).eq('id',plan.rows.programs[0].id));await assert.rejects(importBackup(a.c,raw),/conflict/i);assert.equal(ok(await a.c.from('programs').select('notes').eq('id',plan.rows.programs[0].id))[0].notes,'Remote edit preserved');
 const invalidPointerRaw=JSON.stringify({schemaVersion:3,tables:{universities:[{id:'injected-u',name:'Injected Test'}],programs:[{id:'injected-p',university_id:'injected-u',program_name:'Injected Test',intake_year:2027}],applications:[{id:'injected-a',program_id:'injected-p'}],essays:[{id:'injected-e',application_id:'injected-a',type:'PS',current_version_number:1}],essay_versions:[{id:'injected-v',essay_id:'injected-e',version_number:1,content:'Fake injected'}]}});
 const injected=await buildImportPlan(invalidPointerRaw,a.id);const injectedPath=`${a.id}/imports/${injected.checksum}/source.json`;archives.push({c:a.c,path:injectedPath});ok(await a.c.storage.from('application-documents').upload(injectedPath,new TextEncoder().encode(invalidPointerRaw),{contentType:'application/json',upsert:false}));
 injected.rows.essays[0].current_version_number=99;
 const rejected=await a.c.rpc('import_atlas_backup',{p_checksum:injected.checksum,p_schema_version:3,p_archive_path:injectedPath,p_rows:injected.rows,p_id_map:injected.idMap,p_warnings:[]});assert.ok(rejected.error);assert.match(rejected.error.message,/essays_current_version_fk/);assert.equal(await count(a.c,'universities'),before);assert.equal(await count(a.c,'import_batches'),1);
 injected.rows.universities[0].owner_id=b.id;const rejectedOwner=await a.c.rpc('import_atlas_backup',{p_checksum:injected.checksum,p_schema_version:3,p_archive_path:injectedPath,p_rows:injected.rows,p_id_map:injected.idMap,p_warnings:[]});assert.ok(rejectedOwner.error);assert.match(rejectedOwner.error.message,/owner/i);
 assert.equal(await count(b.c,'essay_evidence_items'),0);assert.ok((await b.c.from('essay_evidence_items').insert({id:crypto.randomUUID(),owner_id:b.id,essay_id:plan.rows.essays[0].id,evidence_item_id:plan.rows.evidence_items[0].id})).error);
 console.log('SDK TRANSACTION PASS: contradictory immutable version, late failure rollback, owner spoof, remote edit protection, server current-version rollback, essay evidence owner isolation');
 // A schema3 portable payload is tested through the same actual SDK, under B.
 const portable=JSON.stringify({schemaVersion:3,tables:{profiles:[{id:a.id,display_name:'Portable applicant',timezone:'Asia/Tokyo'}],universities:[{id:'old-u',owner_id:a.id,name:'Portable U'}],programs:[{id:'old-p',owner_id:a.id,university_id:'old-u',program_name:'Portable',intake_year:2027}]}});archives.push({c:b.c,path:`${b.id}/imports/${await sha256(portable)}/source.json`});const restored=await importBackup(b.c,portable);assert.equal(restored.counts.programs,1);assert.equal(restored.counts.profiles,1);assert.equal(ok(await b.c.from('profiles').select('id,display_name'))[0].id,b.id);assert.equal((await importBackup(b.c,portable)).repeated,true);console.log('SDK PORTABLE RESTORE PASS');
}finally{
 for(const a of archives)ok(await a.c.storage.from('application-documents').remove([a.path]));
 for(const u of clients)ok(await admin.auth.admin.deleteUser(u.id));console.log('CLEANUP PASS: only generated local fake users and archive objects removed');
}

