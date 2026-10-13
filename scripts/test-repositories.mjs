import assert from 'node:assert/strict';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {repository,loadSnapshot,coreTables,portableExport} from '../src/repositories.ts';
import {MaterialService} from '../src/material-service.ts';
const root=path.resolve(import.meta.dirname,'..');
const status=spawnSync(process.execPath,[path.join(root,'node_modules/supabase/dist/supabase.js'),'status','--output','json'],{cwd:root,encoding:'utf8'});assert.equal(status.status,0);const config=JSON.parse(status.stdout);assert.equal(config.API_URL,'http://127.0.0.1:55421');
const admin=createClient(config.API_URL,config.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const users=[];const paths=[];let failMetadata=false,failRemoval=false,failDelete=false;let reads=0;
const patchedFetch=async(input,options)=>{const url=new URL(String(input));const method=options?.method??'GET';if(url.pathname.includes('/rest/v1/')&&method==='GET')reads++;if(failMetadata&&url.pathname.endsWith('/rest/v1/material_versions')&&method==='POST')return new Response(JSON.stringify({code:'23505',message:'Injected conflict'}),{status:409,headers:{'Content-Type':'application/json'}});if(failRemoval&&url.pathname.endsWith('/storage/v1/object/application-documents')&&method==='DELETE')return new Response(JSON.stringify({error:'Injected removal failure'}),{status:503,headers:{'Content-Type':'application/json'}});if(failDelete&&url.pathname.endsWith('/rest/v1/rpc/delete_material_version'))return new Response(JSON.stringify({code:'42501',message:'Injected metadata delete failure'}),{status:403,headers:{'Content-Type':'application/json'}});return fetch(input,options);};
async function user(){const c=createClient(config.API_URL,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:patchedFetch}});const signup=await c.auth.signUp({email:`atlas-repo-${crypto.randomUUID()}@example.invalid`,password:crypto.randomUUID()+'Aa!'});assert.equal(signup.error,null);const u={c,id:signup.data.user.id};users.push(u);return u;}
class Journal {items=new Map();failClear=false;async put(op){this.items.set(op.id,op);}async remove(id){if(this.failClear)throw Error('Journal unavailable');this.items.delete(id);}async list(owner){return [...this.items.values()].filter(op=>op.owner===owner);}}
try{
 const a=await user(),b=await user();const own=t=>repository(a.c,a.id,t);
 const university=await own('universities').insert({name:'Repository Fake University'});await assert.rejects(repository(b.c,b.id,'universities').get(university.id),e=>e.kind==='NOT_FOUND');
 const program=await own('programs').insert({university_id:university.id,program_name:'Repository Fake MSc',intake_year:2027});
 await own('programs').update(program.id,{notes:'Second session edit'},program.updated_at);await assert.rejects(own('programs').update(program.id,{notes:'Stale overwrite'},program.updated_at),e=>e.kind==='CONFLICT');
 const round=await own('application_rounds').insert({program_id:program.id,name:'Round 1',deadline_date:'2027-01-20'});
 const app=await own('applications').insert({program_id:program.id,target_round_id:round.id});const essay=await own('essays').insert({application_id:app.id,type:'PS'});
 let saved=await a.c.rpc('save_essay_version',{p_essay_id:essay.id,p_expected_version:null,p_content:'First text'});assert.equal(saved.error,null);const stale=await a.c.rpc('save_essay_version',{p_essay_id:essay.id,p_expected_version:null,p_content:'Stale text'});assert.equal(stale.error.code,'40001');assert.equal((await own('essay_versions').list()).length,1);
 const material=await own('materials').insert({title:'Fake document',type:'CV'});const journal=new Journal();const service=new MaterialService(a.c,a.id,journal);const file=new File(['%PDF-1.4\nHarmless compensation test\n%%EOF'],'fake.pdf',{type:'application/pdf'});
 failMetadata=true;await assert.rejects(service.upload(material.id,file),e=>e.kind==='CONFLICT');assert.equal(journal.items.size,0);assert.equal((await own('material_versions').list()).length,0);
 failRemoval=true;await assert.rejects(service.upload(material.id,file));assert.equal(journal.items.size,1);paths.push(...[...journal.items.values()].map(op=>op.path));failMetadata=false;failRemoval=false;await service.recover();assert.equal(journal.items.size,0);
 journal.failClear=true;const committed=await service.upload(material.id,file);paths.push(committed.storage_path);assert.equal(journal.items.size,1);assert.equal((await service.download(committed.id)).blob.size,file.size);journal.failClear=false;await service.recover();assert.equal(journal.items.size,0);
 failDelete=true;await assert.rejects(service.delete(committed.id));assert.equal((await service.download(committed.id)).blob.size,file.size);assert.equal(journal.items.size,0);failDelete=false;
 await service.delete(committed.id);assert.equal((await own('material_versions').list()).length,0);
 reads=0;await loadSnapshot(a.c,a.id);assert.equal(reads,coreTables.length,'Table reads must not multiply by applications');const portable=await portableExport(a.c,a.id);assert.equal(portable.schemaVersion,3);assert.ok(portable.tables.programs.some(p=>p.id===program.id));
 console.log('REPOSITORIES PASS: typed CRUD, owner isolation, stale update conflict, atomic essay version');
 console.log('COMPENSATION PASS: upload DB failure cleanup, failed cleanup recovery, committed journal failure safety, delete DB failure file restoration');
 console.log(`QUERY/EXPORT PASS: ${coreTables.length} fixed table reads, portable export uses database`);
}finally{failRemoval=false;failMetadata=false;failDelete=false;for(const path of paths)await admin.storage.from('application-documents').remove([path]);async function cleanPrefix(prefix){const result=await admin.storage.from('application-documents').list(prefix,{limit:1000});assert.equal(result.error,null);for(const entry of result.data){const full=`${prefix}/${entry.name}`;if(entry.id){const removed=await admin.storage.from('application-documents').remove([full]);assert.equal(removed.error,null);}else await cleanPrefix(full);}}for(const user of users){await cleanPrefix(user.id);const result=await admin.auth.admin.deleteUser(user.id);assert.equal(result.error,null);}console.log('CLEANUP PASS: generated repository fake users and files removed');}
