import {spawnSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');const status=spawnSync(process.execPath,[path.join(root,'node_modules/supabase/dist/supabase.js'),'status','--output','json'],{cwd:root,encoding:'utf8'});assert.equal(status.status,0);const s=JSON.parse(status.stdout);assert.equal(s.API_URL,'http://127.0.0.1:55421');
const admin=createClient(s.API_URL,s.SERVICE_ROLE_KEY,{auth:{persistSession:false}});const c=createClient(s.API_URL,s.ANON_KEY,{auth:{persistSession:false}});const ok=r=>{assert.equal(r.error,null,JSON.stringify(r.error));return r.data;};
const session=ok(await c.auth.signUp({email:`atlas-import-pointer-${crypto.randomUUID()}@example.invalid`,password:crypto.randomUUID()+'Aa!'}));const owner_id=session.user.id;
try{
 const u=ok(await c.from('universities').insert({owner_id,name:'Pointer Test'}).select().single());const p=ok(await c.from('programs').insert({owner_id,university_id:u.id,program_name:'Pointer Test',intake_year:2027}).select().single());const a=ok(await c.from('applications').insert({owner_id,program_id:p.id}).select().single());const e=ok(await c.from('essays').insert({owner_id,application_id:a.id,type:'PS'}).select().single());
 const v1=ok(await c.from('essay_versions').insert({owner_id,essay_id:e.id,version_number:1,content:'Fake'}).select().single());const v2=ok(await c.from('essay_versions').insert({owner_id,essay_id:e.id,version_number:2,content:'Historical fake'}).select().single());
 const wrong=await c.from('essays').update({current_version_number:99}).eq('id',e.id);assert.ok(wrong.error,'Missing version pointer must fail at commit');
 ok(await c.from('essays').update({current_version_number:1}).eq('id',e.id));
 const deletion=await c.from('essay_versions').delete().eq('id',v1.id);assert.ok(deletion.error,'Deleting the current target must fail');
 ok(await c.from('essay_versions').delete().eq('id',v2.id));
 const saved=ok(await c.rpc('save_essay_version',{p_essay_id:e.id,p_expected_version:1,p_content:'Atomic new version'}));assert.ok(saved);assert.equal(ok(await c.from('essays').select('current_version_number').eq('id',e.id).single()).current_version_number,2);
 console.log('VERSION POINTER PASS: invalid pointer/current target delete rejected, historical delete permitted, atomic save succeeds');
}finally{ok(await admin.auth.admin.deleteUser(owner_id));console.log('ACCOUNT CASCADE CLEANUP PASS');}
