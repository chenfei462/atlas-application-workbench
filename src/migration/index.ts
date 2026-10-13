import { normalizeRoundDeadline } from './deadlines.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../../types/database.types.js';

// Legacy JSON is untyped at the parser boundary; the public transport is generated Json.
type LegacyRow = Record<string, any>;
type Payload = Record<string, Json | undefined>;
type Row = Payload & {id:string;owner_id?:string};
export type ImportPlan = { checksum:string; raw:string; rows:Record<string,Row[]>; idMap:Record<string,string>; counts:Record<string,number>; warnings:string[] };
export const IMPORT_TABLES = ['profiles','universities','programs','application_rounds','sources','source_assertions','applications','program_material_requirements','program_test_requirements','program_essay_requirements','program_recommendation_requirements','materials','material_versions','application_materials','evidence_items','evidence_material_links','material_application_links','essays','essay_evidence_items','essay_versions','essay_evidence_links','recommenders','recommendation_requests','portal_sections','submissions','tasks','inbox_items','decisions'] as const;
const refs:Record<string,Record<string,string>> = {
 programs:{university_id:'universities'},application_rounds:{program_id:'programs'},source_assertions:{source_id:'sources',program_id:'programs',application_round_id:'application_rounds'},applications:{program_id:'programs',target_round_id:'application_rounds'},
 program_material_requirements:{program_id:'programs',source_id:'sources'},program_test_requirements:{program_id:'programs',source_id:'sources'},program_essay_requirements:{program_id:'programs',source_id:'sources'},program_recommendation_requirements:{program_id:'programs',source_id:'sources'},material_versions:{material_id:'materials'},application_materials:{application_id:'applications',requirement_id:'program_material_requirements',material_version_id:'material_versions',program_id:'programs'},
 evidence_material_links:{evidence_item_id:'evidence_items',material_id:'materials'},material_application_links:{material_id:'materials',application_id:'applications'},essays:{application_id:'applications',program_essay_requirement_id:'program_essay_requirements',program_id:'programs'},essay_evidence_items:{essay_id:'essays',evidence_item_id:'evidence_items'},essay_versions:{essay_id:'essays'},essay_evidence_links:{essay_version_id:'essay_versions',evidence_item_id:'evidence_items'},recommendation_requests:{application_id:'applications',recommender_id:'recommenders'},portal_sections:{application_id:'applications'},submissions:{application_id:'applications'},tasks:{application_id:'applications'},inbox_items:{application_id:'applications'},decisions:{application_id:'applications'}
};
const snake=(s:string)=>s.replace(/[A-Z]/g,c=>'_'+c.toLowerCase());
const day=(v:any)=>v==null?null:String(v).slice(0,10);
export async function sha256(raw:string|Uint8Array):Promise<string> {
 const bytes=typeof raw==='string'?new TextEncoder().encode(raw):raw;
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as BufferSource)),x=>x.toString(16).padStart(2,'0')).join('');
}
async function uuid(owner:string,table:string,id:string) {
 const h=(await sha256(JSON.stringify(['atlas-import-v1',owner,table,id]))).slice(0,32).split(''); h[12]='5'; h[16]=((parseInt(h[16],16)&3)|8).toString(16); const s=h.join(''); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;
}
function list(value:any,label:string):LegacyRow[] { if(value==null)return []; if(!Array.isArray(value))throw new Error(`${label} must be an array`);return value; }
export async function buildImportPlan(raw:string,ownerId:string):Promise<ImportPlan> {
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ownerId))throw new Error('Invalid owner UUID');
 let d:LegacyRow;try{d=JSON.parse(raw);}catch{throw new Error('Invalid JSON backup');}
 if(!d||typeof d!=='object'||Array.isArray(d)||![1,2,3].includes(d.schemaVersion))throw new Error('Unsupported backup schema');
 const rows:Record<string,Row[]>=Object.fromEntries(IMPORT_TABLES.map(t=>[t,[]])); const warnings:string[]=[];const idMap:Record<string,string>={};
 const rootKeys=d.schemaVersion===3?['schemaVersion','tables']:['schemaVersion','programs','applications','materials','materialVersions','evidence','essays','essayVersions','recommenders','recommendationRequests','tasks','inbox','decisions','auditLog'];
 for(const key of Object.keys(d))if(!rootKeys.includes(key))warnings.push(`archive: root field ${key} retained in source; no normalized column`);
 const add=(t:string,id:any,r:Payload)=>{if(typeof id!=='string'||!id.trim())throw new Error(`${t} has invalid id`);if(rows[t].some(x=>x.id===id))throw new Error(`Duplicate ${t} id ${id}`);rows[t].push(t==='profiles'?{id,...r}:{id,...r,owner_id:ownerId});};
 const mapped=(r:LegacyRow,fields:string[],aliases:Record<string,string>={})=>{const out:Payload={};for(const f of fields){if(r[f]!==undefined)out[aliases[f]??snake(f)]=r[f];}for(const key of Object.keys(r))if(key!=='id'&&!fields.includes(key))warnings.push(`archive: ${r.id??'nested'} field ${key} retained in original source; not a normalized column`);return out;};
 if(d.schemaVersion===3){
  if(!d.tables||typeof d.tables!=='object'||Array.isArray(d.tables))throw new Error('Portable tables object required');
  for(const [t,items]of Object.entries(d.tables)){if(['audit_events','import_batches'].includes(t)){warnings.push(`archive: ${t} operational/audit records retained, never replayed as authenticated history`);continue;}if(!IMPORT_TABLES.includes(t as any))throw new Error(`Unknown portable table ${t}`);for(const r of list(items,t)){const {id,...fields}=r;add(t,id,fields);}}
 }else{
  for(const p of list(d.programs,'programs')){
   const uid=p.universityId??p.universityName;if(typeof uid!=='string'||!uid)throw new Error(`Program ${p.id} missing university`);
   const countryCodes:Record<string,string>={'中国':'CN','新加坡':'SG','China':'CN','Singapore':'SG'};const university={name:p.universityName??uid,country_text:p.country??null,country_code:countryCodes[p.country]??null,...(p.city?{city:p.city}:{})};const existing=rows.universities.find(x=>x.id===uid);if(!existing)add('universities',uid,university);else if(existing.name!==university.name)throw new Error(`Contradictory university ${uid}`);
   const fields=mapped(p,['school','programName','degreeName','intakeYear','duration','rollingAdmission','officialProgramUrl','officialApplicationUrl','verificationStatus','lastVerifiedAt','notes','tuition','applicationFee','tags','academicRequirements','languageRequirements','region','country','applicationStatus'],{tuition:'tuition_text',applicationFee:'application_fee_text',academicRequirements:'academic_requirements_text',languageRequirements:'language_requirements_text',region:'region_text',country:'country_text',applicationStatus:'legacy_application_status',school:'school_name',duration:'duration_text',lastVerifiedAt:'verified_at'});
   add('programs',p.id,{...fields,university_id:uid,intake_term:p.intakeTerm==='秋季'?'FALL':p.intakeTerm??'UNKNOWN',study_mode:p.studyMode==='授课型'?'TAUGHT':p.studyMode==='研究型'?'RESEARCH':p.studyMode??'UNKNOWN',application_open_date:day(p.applicationOpenDate)});
   list(p.applicationRounds,'applicationRounds').forEach((r,i)=>{
    const normalizedDeadline=normalizeRoundDeadline(r.deadline,r.timezone,r.id);
    add('application_rounds',r.id,{...mapped(r,['name','applicantType','timezone','notes','verifiedAt','status'],{status:'legacy_status'}),program_id:p.id,sort_order:i+1,open_date:day(r.openDate),...normalizedDeadline});
    if(r.sourceUrl){const sid=`round:${r.id}`;add('sources',sid,{url:r.sourceUrl,source_type:'OFFICIAL_PROGRAM',verified_at:r.verifiedAt??null});add('source_assertions',sid,{source_id:sid,program_id:p.id,application_round_id:r.id,field_path:'deadline',observed_value:r.deadline??{value:null},verified_at:r.verifiedAt??null});}
   });
   for(const s of list(p.sourceRecords,'sourceRecords')){add('sources',s.id,{...mapped(s,['url','sourceType','title','retrievedAt','verifiedAt','notes']),source_type:s.sourceType??'UNKNOWN'});add('source_assertions',s.id,{source_id:s.id,program_id:p.id,application_round_id:s.applicationRoundId??null,field_path:s.field??'unknown',observed_value:s.valueSnapshot??{value:null},verification_status:s.verificationStatus??'NEEDS_VERIFICATION',verified_at:s.verifiedAt??null});}
   list(p.requiredDocuments,'requiredDocuments').forEach((x:any,i)=>{const r=typeof x==='string'?{type:x,label:x}:x;add('program_material_requirements',r.id??`${p.id}:document:${i}`,{program_id:p.id,material_type:r.type??r.materialType,label:r.label??r.title??r.type,required:r.required??true,quantity:r.quantity??1,notes:r.notes??null,source_id:r.sourceId??null});});
   list(p.essayRequirements,'essayRequirements').forEach((r,i)=>add('program_essay_requirements',r.id??`${p.id}:essay:${i}`,{program_id:p.id,essay_type:r.type,prompt:r.prompt??null,word_limit:r.wordLimit??null,character_limit:r.characterLimit??null,required:r.required??true,source_id:r.sourceId??null}));
   list(p.testRequirements,'testRequirements').forEach((r,i)=>add('program_test_requirements',r.id??`${p.id}:test:${i}`,{...mapped(r,['testType','required','minimumOverall','waiverAllowed','minimumSections','notes','sourceId']),program_id:p.id}));
   if(p.recommendationRequirement){const r=p.recommendationRequirement;add('program_recommendation_requirements',p.id,{program_id:p.id,required_count:r.required??r.requiredCount??0,maximum_count:r.maximum??r.maximumCount??r.required??r.requiredCount??0,notes:r.notes??null,source_id:r.sourceId??null});}
  }
  for(const a of list(d.applications,'applications')){
   add('applications',a.id,{...mapped(a,['status','priority','notes','languageRequirementMet','readinessScore'],{readinessScore:'legacy_readiness_score'}),portal_payment_status:a.portal?.paymentStatus??null,portal_submission_status:a.portal?.submissionStatus??null,program_id:a.programId,target_round_id:a.targetRoundId??null});
   list(a.portal?.sections,'portal.sections').forEach((r,i)=>add('portal_sections',r.id??`${a.id}:${i}`,{application_id:a.id,section_key:r.sectionKey??r.key??r.title??String(i),label:r.title??r.label??null,status:r.status??'NOT_STARTED',progress_percent:r.progressPercent??(r.status==='COMPLETE'?100:0),notes:r.notes??null}));
   if(a.submission)add('submissions',a.submission.id??a.id,{...mapped(a.submission,['submittedAt','applicationNumber','confirmationReceived','paymentAmount','paymentCurrency','notes']),application_id:a.id});
   if(a.decision&&!list(d.decisions,'decisions').some(x=>x.applicationId===a.id))add('decisions',a.decision.id??a.id,{...mapped(a.decision,['type','receivedAt','depositAmount','depositCurrency','conditions','notes']),application_id:a.id,response_deadline:day(a.decision.responseDeadline)});
   for(const r of list(a.materialLinks,'materialLinks'))add('application_materials',r.id??`${a.id}:${r.requirementId}`,{application_id:a.id,requirement_id:r.requirementId,material_version_id:r.materialVersionId??null,status:r.status??'MISSING',notes:r.notes??null});
  }
  const definitions:Array<[string,string,string[],Record<string,string>?]>=[
   ['materials','materials',['type','title','status','notes','issuedAt','expiresAt','verified','fileReference','variant','version'],{fileReference:'legacy_file_reference',version:'legacy_version_number'}],['materialVersions','material_versions',['materialId','versionNumber','version','variant','storagePath','originalFilename','mimeType','sizeBytes','sha256','createdAt','notes'],{version:'version_number'}],
   ['evidence','evidence_items',['type','title','organization','role','startDate','endDate','description','responsibilities','achievements','metrics','skills','technologies','verified','notes']],
   ['essays','essays',['applicationId','type','status','prompt','wordLimit','notes','programEssayRequirementId'],{}],['essayVersions','essay_versions',['essayId','versionNumber','version','content','wordCount','contentHash','createdAt','notes'],{version:'version_number'}],
   ['recommenders','recommenders',['name','title','organization','relationship','email','notes']],['recommendationRequests','recommendation_requests',['applicationId','recommenderId','status','invitedAt','acceptedAt','submittedAt','reminderAt','notes','required'],{invitedAt:'requested_at'}],
   ['tasks','tasks',['applicationId','title','description','status','priority','source','sourceKey','manual','createdAt','updatedAt','completedAt'],{source:'source_type'}],['inbox','inbox_items',['applicationId','externalMessageId','type','sender','subject','receivedAt','summary','actionRequired','status','rawMetadata','createdAt','updatedAt']],['decisions','decisions',['applicationId','type','receivedAt','depositAmount','depositCurrency','conditions','notes']]
  ];
  for(const[key,t,fields,aliases]of definitions)for(const r of list(d[key],key)){
   const value=mapped(r,fields,aliases);if(key==='materials'&&value.legacy_file_reference!=null&&typeof value.legacy_file_reference!=='string')value.legacy_file_reference=JSON.stringify(value.legacy_file_reference);if(key==='essays'){value.deadline_date=day(r.deadline);if(r.currentVersionId){const v=list(d.essayVersions,'essayVersions').find(v=>v.id===r.currentVersionId&&v.essayId===r.id);if(!v)throw new Error(`Essay ${r.id} missing or wrong current version`);value.current_version_number=v.versionNumber??v.version;}}
   if(key==='recommendationRequests')value.due_date=day(r.dueDate);if(key==='tasks'||key==='inbox')value.due_at=r.dueAt??r.dueDate??null;if(key==='decisions')value.response_deadline=day(r.responseDeadline);
   add(t,r.id,value);
   if(key==='essays')for(const ev of list(r.evidenceIds,'evidenceIds') as any[])add('essay_evidence_items',`${r.id}:${ev}`,{essay_id:r.id,evidence_item_id:ev});
   if(key==='materials')for(const app of list(r.linkedApplications,'linkedApplications') as any[])add('material_application_links',`${r.id}:${app}`,{material_id:r.id,application_id:app});
   if(key==='evidence')for(const mat of list(r.proofMaterials,'proofMaterials') as any[])add('evidence_material_links',`${r.id}:${mat}`,{evidence_item_id:r.id,material_id:mat});
   if(key==='essayVersions')for(const ev of new Set(list(r.evidenceIds,'evidenceIds')) as Set<any>)add('essay_evidence_links',`${r.id}:${ev}`,{essay_version_id:r.id,evidence_item_id:ev});
  }
  if(list(d.auditLog,'auditLog').length)warnings.push('archive: auditLog preserved as original legacy history, never replayed as authenticated audit events');
 }
 if(rows.profiles.length>1)throw new Error('Portable backup must contain at most one profile');
 for(const t of IMPORT_TABLES)for(const r of rows[t])idMap[`${t}:${r.id}`]=t==='profiles'?ownerId:await uuid(ownerId,t,r.id);
 for(const t of IMPORT_TABLES)for(const r of rows[t]){const old=r.id;r.id=idMap[`${t}:${old}`];for(const[f,parent]of Object.entries(refs[t]??{})){if(r[f]!=null){if(typeof r[f]!=='string')throw new Error(`${t}.${f} must be a string reference`);const id=idMap[`${parent}:${r[f]}`];if(!id)throw new Error(`${t} ${old} references missing ${parent} ${r[f]}`);r[f]=id;}}}
 const versions=new Set();for(const t of ['material_versions','essay_versions'])for(const r of rows[t]){if(typeof r.version_number!=='number'||!Number.isInteger(r.version_number)||r.version_number<1)throw new Error(`${t} invalid version`);const k=`${t}:${r.material_id??r.essay_id}:${r.version_number}`;if(versions.has(k))throw new Error(`Duplicate version ${k}`);versions.add(k);}
 for(const e of rows.essays)if(e.current_version_number!=null&&!rows.essay_versions.some(v=>v.essay_id===e.id&&v.version_number===e.current_version_number))throw new Error(`Essay ${e.id} current version is missing or belongs to another essay`);
 return {raw,checksum:await sha256(raw),rows,idMap,counts:Object.fromEntries(IMPORT_TABLES.map(t=>[t,rows[t].length])),warnings:[...new Set(warnings)]};
}
export type ImportVerification={batchId:string;status:'COMPLETED';counts:Record<string,number>;checksum:string;archivePath:string;repeated:boolean;warnings:string[]};
export async function importBackup(client:SupabaseClient<Database>,raw:string):Promise<ImportVerification>{
 const {data,error}=await client.auth.getUser();if(error||!data.user)throw new Error('Sign in before importing');
 const plan=await buildImportPlan(raw,data.user.id);const archivePath=`${data.user.id}/imports/${plan.checksum}/source.json`;const storage=client.storage.from('application-documents');
 // Always download and verify an existing object; never overwrite an archive.
 const existing=await storage.download(archivePath);
 if(existing.data){if(await sha256(new Uint8Array(await existing.data.arrayBuffer()))!==plan.checksum)throw new Error('Source archive checksum conflict');}
 else{const upload=await storage.upload(archivePath,new TextEncoder().encode(raw),{contentType:'application/json',upsert:false});if(upload.error){const retry=await storage.download(archivePath);if(!retry.data||await sha256(new Uint8Array(await retry.data.arrayBuffer()))!==plan.checksum)throw new Error(`Archive upload failed: ${upload.error.message}`);}}
 const archived=await storage.download(archivePath);if(!archived.data||await sha256(new Uint8Array(await archived.data.arrayBuffer()))!==plan.checksum)throw new Error('Source archive verification failed');
 const result=await client.rpc('import_atlas_backup',{p_checksum:plan.checksum,p_schema_version:JSON.parse(raw).schemaVersion,p_archive_path:archivePath,p_rows:plan.rows,p_id_map:plan.idMap,p_warnings:plan.warnings});
 if(result.error)throw new Error(`Transactional import failed: ${result.error.message}`);
 const verification=result.data;
 if(!verification||typeof verification!=='object'||Array.isArray(verification)||verification.status!=='COMPLETED'||verification.checksum!==plan.checksum||verification.archivePath!==archivePath||typeof verification.batchId!=='string'||typeof verification.repeated!=='boolean')throw new Error('Import verification mismatch');
 const counts=verification.counts;
 if(!counts||typeof counts!=='object'||Array.isArray(counts)||Object.keys(plan.counts).some(t=>counts[t]!==plan.counts[t]))throw new Error('Import verification count mismatch');
 return {batchId:verification.batchId,status:'COMPLETED',checksum:plan.checksum,archivePath,repeated:verification.repeated,counts:plan.counts,warnings:plan.warnings};
}

