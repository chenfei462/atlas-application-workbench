import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImportPlan } from '../src/migration/index.ts';
import { createDemoStore } from '../outputs/domain.js';
const owner='11111111-1111-4111-8111-111111111111';
test('preserves raw bytes and maps nested demo graph with deterministic owner IDs',async()=>{
 const raw=JSON.stringify(createDemoStore(),null,2)+'\n'; const p=await buildImportPlan(raw,owner);
 assert.equal(p.raw,raw); assert.match(p.checksum,/^[a-f0-9]{64}$/);
 assert.equal(p.counts.application_rounds,5); assert.equal(p.counts.universities,2);
 assert.equal(p.counts.essay_evidence_links,1); assert.equal(p.counts.source_assertions,7);
 assert.equal(p.rows.essays[0].current_version_number,2);
 assert.deepEqual((await buildImportPlan(raw,owner)).idMap,p.idMap);
 assert.notEqual((await buildImportPlan(raw,'22222222-2222-4222-8222-222222222222')).rows.programs[0].id,p.rows.programs[0].id);
 assert.ok(p.warnings.some(x=>x.includes('archive')));
});
test('rejects dangling references and duplicate IDs before any upload',async()=>{
 const d=createDemoStore(); d.essayVersions[0].essayId='missing';
 await assert.rejects(buildImportPlan(JSON.stringify(d),owner),/missing/);
 const e=createDemoStore(); e.programs.push(e.programs[0]);
 await assert.rejects(buildImportPlan(JSON.stringify(e),owner),/duplicate/i);
});
test('portable rows remap IDs and references while excluding forged audit events',async()=>{
 const raw=JSON.stringify({schemaVersion:3,tables:{universities:[{id:'u',owner_id:'old',name:'U'}],programs:[{id:'p',owner_id:'old',university_id:'u',program_name:'P',intake_year:2027}],audit_events:[{id:'a',action:'FAKE'}]}});
 const p=await buildImportPlan(raw,owner);
 assert.equal(p.rows.programs[0].university_id,p.rows.universities[0].id); assert.equal(p.rows.programs[0].owner_id,owner);
 assert.equal(p.rows.audit_events,undefined); assert.ok(p.warnings.some(x=>x.includes('audit')));
});

test('schema1 follows legacy mappings and preserves joins without inventing versions',async()=>{
 const d=createDemoStore();d.schemaVersion=1;const p=await buildImportPlan(JSON.stringify(d),owner);
 assert.equal(p.counts.evidence_material_links,1);assert.equal(p.counts.material_application_links,6);assert.equal(p.counts.material_versions,0);
 const a=p.rows.applications.find(x=>x.id===p.idMap['applications:app-fe']);
 assert.equal(a.target_round_id,p.idMap['application_rounds:cuhksz-fe-r2']);
 const r=p.rows.application_rounds.find(x=>x.id===p.idMap['application_rounds:cuhksz-fe-r2']);assert.equal(r.deadline_time,'23:59:00');assert.equal(r.timezone,'Asia/Hong_Kong');
});
test('duplicates version numbers and wrong essay pointers fail planning',async()=>{
 const d=createDemoStore();d.essayVersions.push({...d.essayVersions[0],id:'another'});
 await assert.rejects(buildImportPlan(JSON.stringify(d),owner),/Duplicate version/);
 const e=createDemoStore();e.essays[0].currentVersionId='missing';await assert.rejects(buildImportPlan(JSON.stringify(e),owner),/missing/);
});
test('known legacy UI semantics migrate into explicit columns instead of archive-only warnings',async()=>{
 const d=createDemoStore();d.programs[0].tuition='¥180000';d.materials[0].issuedAt='2026-01-01';d.materials[0].expiresAt='2028-01-01';d.materials[0].fileReference='local-only-file';d.applications[0].languageRequirementMet=false;d.essays[0].notes='Keep essay note';
 const p=await buildImportPlan(JSON.stringify(d),owner);
 assert.equal(p.rows.programs[0].tuition_text,'¥180000');assert.equal(p.rows.programs[0].country_text,'中国');assert.deepEqual(p.rows.programs[0].tags,['FinTech','Finance']);
 assert.equal(p.rows.materials[0].legacy_file_reference,'local-only-file');assert.equal(p.rows.materials[0].legacy_version_number,3);assert.equal(p.rows.materials[0].verified,true);
 assert.equal(p.rows.essays[0].prompt,'Personal Statement');assert.equal(p.rows.essays[0].notes,'Keep essay note');assert.equal(p.rows.applications[0].language_requirement_met,false);assert.equal(p.rows.recommendation_requests[0].required,true);
});
test('portable profile belongs to current actor and unsupported source snapshots remain valid JSON',async()=>{
 const p=await buildImportPlan(JSON.stringify({schemaVersion:3,tables:{profiles:[{id:'old-owner',display_name:'Preserved applicant',timezone:'Asia/Tokyo'}]}}),owner);
 assert.equal(p.rows.profiles[0].id,owner);assert.equal(p.rows.profiles[0].owner_id,undefined);assert.equal(p.rows.profiles[0].display_name,'Preserved applicant');
 const d=createDemoStore();d.programs[2].applicationRounds=[{id:'unknown-round',name:'Unknown',deadline:null,sourceUrl:'https://example.edu'}];const q=await buildImportPlan(JSON.stringify(d),owner);
 assert.deepEqual(q.rows.source_assertions.find(x=>x.id===q.idMap['source_assertions:round:unknown-round']).observed_value,{value:null});
});
test('unknown top-level local preferences remain explicitly recoverable',async()=>{
 const d=createDemoStore();d.displayPreferences={permissionLabel:'Keep me'};const p=await buildImportPlan(JSON.stringify(d),owner);
 assert.ok(p.warnings.some(w=>w.includes('displayPreferences')));
});
test('portable current version must exist on the same essay',async()=>{
 const d=createDemoStore();const p=await buildImportPlan(JSON.stringify(d),owner);
 const tables=structuredClone(p.rows);tables.essays[0].current_version_number=99;
 await assert.rejects(buildImportPlan(JSON.stringify({schemaVersion:3,tables}),owner),/current version/i);
});
test('every explicit legacy relationship is mapped and dangling values are rejected',async()=>{
 const d=createDemoStore();d.programs[0].sourceRecords[0].applicationRoundId='cuhksz-fe-r2';
 d.programs[0].requiredDocuments[0]={id:'req-cv',type:'CV',sourceId:'source-fe'};d.programs[0].essayRequirements[0].id='req-ps';d.programs[0].essayRequirements[0].sourceId='source-fe';d.programs[0].recommendationRequirement.sourceId='source-fe';d.programs[0].testRequirements=[{id:'req-test',testType:'IELTS',sourceId:'source-fe'}];d.essays[0].programEssayRequirementId='req-ps';
 const p=await buildImportPlan(JSON.stringify(d),owner);
 assert.equal(p.rows.source_assertions.find(x=>x.id===p.idMap['source_assertions:source-fe']).application_round_id,p.idMap['application_rounds:cuhksz-fe-r2']);
 for(const t of ['program_material_requirements','program_essay_requirements','program_test_requirements','program_recommendation_requirements'])assert.equal(p.rows[t][0].source_id,p.idMap['sources:source-fe']);
 assert.equal(p.rows.essays[0].program_essay_requirement_id,p.idMap['program_essay_requirements:req-ps']);
 for(const key of ['round','source','essay']){const x=structuredClone(d);if(key==='round')x.programs[0].sourceRecords[0].applicationRoundId='missing';if(key==='source')x.programs[0].requiredDocuments[0].sourceId='missing';if(key==='essay')x.essays[0].programEssayRequirementId='missing';await assert.rejects(buildImportPlan(JSON.stringify(x),owner),/missing/);}
});
test('essay-level evidence survives without versions and validates its reference',async()=>{
 const d=createDemoStore();d.essays[0].currentVersionId=null;d.essayVersions=[];
 const p=await buildImportPlan(JSON.stringify(d),owner);assert.equal(p.counts.essay_evidence_items,1);assert.equal(p.counts.essay_evidence_links,0);
 d.essays[0].evidenceIds=['missing'];await assert.rejects(buildImportPlan(JSON.stringify(d),owner),/missing/);
});
test('exact deadlines never depend on host timezone and ambiguous/gap times reject',async()=>{
 const d=createDemoStore();const r=d.programs[0].applicationRounds[0];r.deadline='2027-01-15T12:34:56.123456';r.timezone='Asia/Hong_Kong';
 const p=await buildImportPlan(JSON.stringify(d),owner);assert.equal(p.rows.application_rounds[0].deadline_time,'12:34:56.123456');
 delete r.timezone;await assert.rejects(buildImportPlan(JSON.stringify(d),owner),/timezone|offset/i);
 r.timezone='America/New_York';r.deadline='2026-11-01T01:30:00';await assert.rejects(buildImportPlan(JSON.stringify(d),owner),/ambiguous/i);
 r.deadline='2026-03-08T02:30:00';await assert.rejects(buildImportPlan(JSON.stringify(d),owner),/nonexistent|invalid/i);
 r.deadline='2026-02-31T12:30:00';await assert.rejects(buildImportPlan(JSON.stringify(d),owner),/invalid/i);
});
