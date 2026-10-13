import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const binary=path.join(root,'node_modules/supabase/dist/supabase.js');
const status=spawnSync(process.execPath,[binary,'status','--output','json'],{cwd:root,encoding:'utf8'});
if(status.status!==0) throw new Error('Run npm run db:start first');
const settings=JSON.parse(status.stdout);
const base=settings.API_URL;
// This test creates/deletes only random fake users in this specific local stack.
assert.equal(base,'http://127.0.0.1:55421','Integration tests are restricted to Atlas local API');
const anon=settings.ANON_KEY;
const admin=settings.SERVICE_ROLE_KEY;
const bucket='application-documents';
const users=[]; const objects=[];
async function request(route,{token=anon,method='GET',body,headers={}}={}) {
  return fetch(`${base}${route}`,{method,headers:{apikey:anon,Authorization:`Bearer ${token}`,...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
}
async function json(route,options={}) {
  const response=await request(route,options);
  const raw=await response.text();
  const data=raw?JSON.parse(raw):null;
  assert.ok(response.ok,`Request failed ${response.status}: ${route}: ${JSON.stringify(data)}`);
  return data;
}
async function signup() {
  const email=`atlas-test-${crypto.randomUUID()}@example.invalid`;
  const password=crypto.randomBytes(24).toString('base64url');
  const data=await json('/auth/v1/signup',{method:'POST',body:{email,password}});
  assert.ok(data.access_token && data.user.id,'Local signup must return a session');
  const user={id:data.user.id,token:data.access_token,email,password}; users.push(user); return user;
}
async function insert(table,row,user) {
  const records=await json(`/rest/v1/${table}`,{token:user.token,method:'POST',body:row,headers:{Prefer:'return=representation'}});
  assert.equal(records.length,1); return records[0];
}
async function upload(object,user,content) {
  const response=await fetch(`${base}/storage/v1/object/${bucket}/${object}`,{method:'POST',headers:{apikey:anon,Authorization:`Bearer ${user.token}`,'Content-Type':'application/pdf','x-upsert':'false'},body:content});
  assert.ok(response.ok,`Upload failed: ${response.status}`);
}
async function remove(object,user) {
  await json(`/storage/v1/object/${bucket}`,{token:user.token,method:'DELETE',body:{prefixes:[object]}});
}
try {
  const a=await signup(); const b=await signup();
  const owner_id=a.id;
  await insert('profiles',{id:a.id,display_name:'Fake Atlas applicant'},a);
  const university=await insert('universities',{owner_id,name:'Example University'},a);
  const program=await insert('programs',{owner_id,university_id:university.id,program_name:'Example MSc',intake_year:2027},a);
  const rounds=[];
  for(let i=1;i<=4;i++) rounds.push(await insert('application_rounds',{owner_id,program_id:program.id,name:`Round ${i}`,sort_order:i,deadline_date:`2027-0${i}-20`,deadline_precision:'DATE_ONLY',timezone:'Asia/Hong_Kong'},a));
  const source=await insert('sources',{owner_id,url:'https://example.edu/program',source_type:'USER_INPUT'},a);
  await insert('source_assertions',{owner_id,source_id:source.id,program_id:program.id,application_round_id:rounds[0].id,field_path:'deadline_date',observed_value:'2027-01-20'},a);
  const app=await insert('applications',{owner_id,program_id:program.id,target_round_id:rounds[0].id,status:'PREPARING'},a);
  const mr=await insert('program_material_requirements',{owner_id,program_id:program.id,material_type:'CV',label:'CV',source_id:source.id},a);
  await insert('program_test_requirements',{owner_id,program_id:program.id,test_type:'IELTS',source_id:source.id},a);
  const er=await insert('program_essay_requirements',{owner_id,program_id:program.id,essay_type:'PS',source_id:source.id},a);
  await insert('program_recommendation_requirements',{owner_id,program_id:program.id,required_count:1,maximum_count:2},a);
  const material=await insert('materials',{owner_id,type:'CV',title:'Fake CV'},a);
  const versionId=crypto.randomUUID();
  const object=`${a.id}/materials/${material.id}/${versionId}/fake.pdf`;
  const content=Buffer.from('%PDF-1.4\nAtlas fake test only\n%%EOF');
  const checksum=crypto.createHash('sha256').update(content).digest('hex');
  await upload(object,a,content); objects.push({object,user:a});
  const version=await insert('material_versions',{id:versionId,owner_id,material_id:material.id,version_number:1,storage_path:object,original_filename:'fake.pdf',mime_type:'application/pdf',size_bytes:content.length,sha256:checksum},a);
  await insert('application_materials',{owner_id,application_id:app.id,requirement_id:mr.id,material_version_id:version.id,status:'COMPLETE'},a);
  const evidence=await insert('evidence_items',{owner_id,type:'PROJECT',title:'Fake Project'},a);
  const essay=await insert('essays',{owner_id,application_id:app.id,program_essay_requirement_id:er.id,type:'PS'},a);
  const ev=await insert('essay_versions',{owner_id,essay_id:essay.id,version_number:1,content:'Fake essay',word_count:2},a);
  await insert('essay_evidence_links',{owner_id,essay_version_id:ev.id,evidence_item_id:evidence.id},a);
  const recommender=await insert('recommenders',{owner_id,name:'Fake Recommender',email:'fake@example.invalid'},a);
  await insert('recommendation_requests',{owner_id,application_id:app.id,recommender_id:recommender.id},a);
  await insert('portal_sections',{owner_id,application_id:app.id,section_key:'education',status:'COMPLETE',progress_percent:100},a);
  await insert('submissions',{owner_id,application_id:app.id,submitted_at:new Date().toISOString(),application_number:'FAKE-ONLY',receipt_storage_path:object},a);
  await insert('decisions',{owner_id,application_id:app.id,type:'OFFER'},a);
  await insert('tasks',{owner_id,application_id:app.id,title:'Fake task'},a);
  await insert('inbox_items',{owner_id,application_id:app.id,type:'GENERAL'},a);
  await insert('import_batches',{owner_id,source_schema_version:2,checksum},a);
  const tables=['profiles','universities','programs','application_rounds','sources','source_assertions','applications','program_material_requirements','program_test_requirements','program_essay_requirements','program_recommendation_requirements','materials','material_versions','application_materials','evidence_items','essays','essay_versions','essay_evidence_links','recommenders','recommendation_requests','portal_sections','submissions','decisions','tasks','inbox_items','import_batches','audit_events'];
  for(const table of tables) {
    const filter=`${table==='profiles'?'id':'owner_id'}=eq.${a.id}`;
    const own=await json(`/rest/v1/${table}?${filter}`,{token:a.token}); assert.ok(own.length>0,`Missing fixture: ${table}`);
    assert.deepEqual(await json(`/rest/v1/${table}?${filter}`,{token:b.token}),[],`Cross-user read: ${table}`);
    const mutation=await request(`/rest/v1/${table}?${filter}`,{token:b.token,method:'PATCH',body:{id:own[0].id},headers:{Prefer:'return=representation'}});
    assert.ok(mutation.ok); assert.deepEqual(await mutation.json(),[],`Cross-user update: ${table}`);
    const deletion=await request(`/rest/v1/${table}?${filter}`,{token:b.token,method:'DELETE',headers:{Prefer:'return=representation'}});
    if(deletion.ok) assert.deepEqual(await deletion.json(),[],`Cross-user delete: ${table}`);
    else assert.equal(deletion.status,403); // profiles exposes no DELETE grant/policy.
    const anonymous=await json(`/rest/v1/${table}?${filter}`); assert.deepEqual(anonymous,[],`Anonymous read: ${table}`);
  }
  console.log('HTTP RLS PASS: 27 private tables, A read; B/anonymous read denied; B update/delete affect no rows');
  const spoof=await request('/rest/v1/universities',{token:b.token,method:'POST',body:{owner_id:a.id,name:'Spoof'}}); assert.equal(spoof.status,403);
  const overwrite=await request(`/rest/v1/essay_versions?id=eq.${ev.id}`,{token:a.token,method:'PATCH',body:{content:'Overwrite'}}); assert.ok(!overwrite.ok);
  const relogin=await json('/auth/v1/token?grant_type=password',{method:'POST',body:{email:a.email,password:a.password}});
  assert.equal((await json(`/rest/v1/application_rounds?program_id=eq.${program.id}`,{token:relogin.access_token})).length,4);
  console.log('AUTH + NORMALIZED CHAIN PASS: password re-login retrieves persisted application and four rounds');
  const downloaded=await request(`/storage/v1/object/authenticated/${bucket}/${object}`,{token:a.token}); assert.ok(downloaded.ok);
  const backup=Buffer.from(await downloaded.arrayBuffer()); assert.equal(crypto.createHash('sha256').update(backup).digest('hex'),checksum);
  for(const token of [b.token,anon]) { const denied=await request(`/storage/v1/object/authenticated/${bucket}/${object}`,{token}); assert.ok(!denied.ok,'Private file downloaded by another user'); }
  const listed=await json(`/storage/v1/object/list/${bucket}`,{token:b.token,method:'POST',body:{prefix:object.slice(0,object.lastIndexOf('/')),limit:100}}); assert.equal(listed.length,0);
  const badUpload=await fetch(`${base}/storage/v1/object/${bucket}/${a.id}/spoof.pdf`,{method:'POST',headers:{apikey:anon,Authorization:`Bearer ${b.token}`,'Content-Type':'application/pdf'},body:content});
  assert.ok(!badUpload.ok,'B uploaded into A prefix');
  const badUpdate=await fetch(`${base}/storage/v1/object/${bucket}/${object}`,{method:'PUT',headers:{apikey:anon,Authorization:`Bearer ${b.token}`,'Content-Type':'application/pdf'},body:Buffer.from('tampered')});
  assert.ok(!badUpdate.ok,'B updated A file');
  await json(`/storage/v1/object/${bucket}`,{token:b.token,method:'DELETE',body:{prefixes:[object]}});
  const stillPresent=await request(`/storage/v1/object/authenticated/${bucket}/${object}`,{token:a.token}); assert.ok(stillPresent.ok);
  assert.equal(crypto.createHash('sha256').update(Buffer.from(await stillPresent.arrayBuffer())).digest('hex'),checksum,'B modified or deleted A file');
  const sign=await json(`/storage/v1/object/sign/${bucket}/${object}`,{token:a.token,method:'POST',body:{expiresIn:1}});
  const signed=sign.signedURL ?? sign.signedUrl; assert.ok(signed);
  const signedUrl=`${base}/storage/v1${signed}`;
  assert.ok((await fetch(signedUrl)).ok);
  await new Promise(resolve=>setTimeout(resolve,3000));
  assert.ok(!(await fetch(signedUrl,{headers:{'Cache-Control':'no-cache'}})).ok,'Expired signed URL remained usable');
  console.log('STORAGE PASS: A upload/download; B/anonymous download denied; B upload/update/delete denied; B listing empty; signed URL expires');
  await remove(object,a);
  assert.ok(!(await request(`/storage/v1/object/authenticated/${bucket}/${object}`,{token:a.token})).ok);
  assert.equal((await json(`/rest/v1/material_versions?id=eq.${version.id}`,{token:a.token})).length,1,'Metadata must remain to report missing objects');
  await upload(object,a,backup);
  const restored=await request(`/storage/v1/object/authenticated/${bucket}/${object}`,{token:a.token}); assert.ok(restored.ok);
  assert.equal(crypto.createHash('sha256').update(Buffer.from(await restored.arrayBuffer())).digest('hex'),checksum);
  console.log('STORAGE BACKUP/RESTORE PASS: checksum matches; missing object retains detectable metadata');
  await remove(object,a);
  await json(`/rest/v1/application_materials?material_version_id=eq.${version.id}`,{token:a.token,method:'DELETE'});
  await json(`/rest/v1/material_versions?id=eq.${version.id}`,{token:a.token,method:'DELETE'});
  assert.equal((await json(`/rest/v1/material_versions?id=eq.${version.id}`,{token:a.token})).length,0);
  console.log('DELETE CONSISTENCY PASS: fake object and references removed explicitly');
} finally {
  for(const {object,user} of objects) try { await remove(object,user); } catch {}
  for(const user of users) {
    const response=await fetch(`${base}/auth/v1/admin/users/${user.id}`,{method:'DELETE',headers:{apikey:admin,Authorization:`Bearer ${admin}`}});
    assert.ok(response.ok,`Failed to clean fake user ${user.id}`);
  }
  console.log('CLEANUP PASS: generated fake users and objects removed');
}
