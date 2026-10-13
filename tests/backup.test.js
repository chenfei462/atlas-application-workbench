import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { safePath, sha256, retentionCandidates, bundleStatus, references, verifyBundle } from '../scripts/backup-lib.mjs';
import * as lib from '../scripts/backup-lib.mjs';
const simulatedArchiveValidator=async(bytes,tables)=>{assert.equal(bytes.subarray(0,5).toString(),'PGDMP');assert.ok(lib.coreTables.every(table=>tables.includes(table)));return true;};
async function fixtureBundle(){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-backup-test-'));const tables=Object.fromEntries(lib.coreTables.map(t=>[t,[]]));
 const dump=Buffer.concat([Buffer.from('PGDMP'),Buffer.from([1,16,0,4,8,1]),Buffer.alloc(80)]);const exported=Buffer.from(JSON.stringify({schemaVersion:3,exportedAt:new Date().toISOString(),tables}));
 const requiredFunctions=['is_owner','set_updated_at','import_atlas_backup','save_essay_version','record_submission','delete_material_version'];
 const manifest={backupId:path.basename(dir),createdAt:new Date().toISOString(),kind:'daily',migrationHead:'202610110015',status:'PASS',files:[],objects:[],schemaSecurity:{version:2,functions:requiredFunctions.map(name=>({schema:'public',name,arguments:'',definition:`CREATE OR REPLACE FUNCTION public.${name}() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;`})),triggers:[{schema:'public',table:'universities',name:'updated',enabled:'O',definition:'CREATE TRIGGER updated BEFORE UPDATE ON public.universities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()'}],policies:[...lib.coreTables.map(table=>({schema:'public',table,name:'owner_policy',permissive:'PERMISSIVE',cmd:'ALL',roles:['authenticated'],qual:'owner_id = auth.uid()',with_check:'owner_id = auth.uid()'})),{schema:'storage',table:'objects',name:'owner_policy',permissive:'PERMISSIVE',cmd:'ALL',roles:['authenticated'],qual:'owner_id = auth.uid()::text',with_check:'owner_id = auth.uid()::text'}],tables:[...lib.coreTables.map(name=>({schema:'public',name,rlsEnabled:true,rlsForced:false})),{schema:'storage',name:'objects',rlsEnabled:true,rlsForced:false}]}};
 for(const [filename,bytes]of [['database.dump',dump],['atlas-export.json',exported]]){await fs.writeFile(path.join(dir,filename),bytes);manifest.files.push({filename,size:bytes.length,sha256:sha256(bytes),status:'PASS'});}await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest));return {dir,manifest,tables};
}
async function saveFixture({dir,manifest,tables}){const bytes=Buffer.from(JSON.stringify({schemaVersion:3,exportedAt:new Date().toISOString(),tables}));await fs.writeFile(path.join(dir,'atlas-export.json'),bytes);Object.assign(manifest.files.find(f=>f.filename==='atlas-export.json'),{size:bytes.length,sha256:sha256(bytes)});await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest));}
test('logical paths cannot escape or use Windows separators',()=>{
 for(const p of ['../secret','/absolute','a\\..\\x','C:/secret','a//b']) assert.throws(()=>safePath('C:/backups',p));
 assert.ok(safePath('C:/backups','bucket/owner/file.pdf').endsWith('file.pdf'));
});
test('checksum is content based and partial never passes',()=>{
 assert.equal(sha256(Buffer.from('abc')),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
 assert.equal(bundleStatus([{status:'PASS'},{status:'FAIL'}]),'FAIL');
 assert.equal(bundleStatus([{status:'PASS'}]),'PASS');
});
test('retention keeps seven successful daily bundles, failures and sole valid backup',()=>{
 const rows=Array.from({length:9},(_,i)=>({backupId:String(i),createdAt:`2026-10-${String(i+1).padStart(2,'0')}`,kind:'daily',status:'PASS'}));
 rows.push({backupId:'failed',createdAt:'2026-11-01',kind:'daily',status:'FAIL'});
 assert.deepEqual(retentionCandidates(rows).map(x=>x.backupId),['1','0']);
 assert.deepEqual(retentionCandidates(rows.slice(0,1)),[]);
});
test('receipts and import archives are valid references, alongside materials',()=>{
 const refs=references({material_versions:[{id:'v',storage_path:'u/m/v.pdf',owner_id:'u'}],submissions:[{id:'s',receipt_storage_path:'u/receipt.pdf'}],import_batches:[{id:'i',archive_path:'u/import.json'}]});
 assert.deepEqual(refs.map(x=>x.path),['u/m/v.pdf','u/receipt.pdf','u/import.json']);
});
test('bundle verification refuses a partial manifest, missing components and byte corruption',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-backup-test-'));
 try{await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify({status:'FAIL',files:[]}));await assert.rejects(verifyBundle(dir),/partial|failed/);
 await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify({status:'PASS',files:[],objects:[]}));await assert.rejects(verifyBundle(dir),/components/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
 const fixture=await fixtureBundle();try{await verifyBundle(fixture.dir,{archiveValidator:simulatedArchiveValidator});await fs.writeFile(path.join(fixture.dir,'database.dump'),'tampered');await assert.rejects(verifyBundle(fixture.dir,{archiveValidator:simulatedArchiveValidator}),/Checksum/);}finally{await fs.rm(fixture.dir,{recursive:true,force:true});}
});
test('realpath confinement rejects different Windows volumes and same-volume siblings',()=>{
 assert.throws(()=>lib.assertConfined('D:\\backups\\bundle','C:\\outside\\dump',path.win32),/escape/);
 assert.throws(()=>lib.assertConfined('D:\\backups\\bundle','D:\\outside\\dump',path.win32),/escape/);
 assert.doesNotThrow(()=>lib.assertConfined('D:\\backups\\bundle','D:\\backups\\bundle\\database.dump',path.win32));
});
test('same counts cannot hide changed function, trigger, policy or forced RLS definitions',()=>{
 const schema={version:2,functions:[{definition:'return true'}],triggers:[{definition:'before insert'}],policies:[{qual:'owner_id = auth.uid()',roles:['authenticated'],cmd:'SELECT'}],tables:[{rlsEnabled:true,rlsForced:false}]};
 for(const changed of [{...schema,functions:[{definition:'return false'}]},{...schema,triggers:[{definition:'after insert'}]},{...schema,policies:[{qual:'true',roles:['anon'],cmd:'ALL'}]},{...schema,tables:[{rlsEnabled:true,rlsForced:true}]}])assert.throws(()=>lib.assertSchemaSecurity(schema,changed),/definitions/);
 assert.doesNotThrow(()=>lib.assertSchemaSecurity(schema,structuredClone(schema)));
});
test('schema3 export validation refuses duplicate IDs, omitted core tables and non-array tables',()=>{
 const tables=Object.fromEntries(lib.coreTables.map(t=>[t,[]]));const data={schemaVersion:3,exportedAt:new Date().toISOString(),tables};
 assert.doesNotThrow(()=>lib.validateExport(data));
 assert.throws(()=>lib.validateExport({...data,schemaVersion:2}),/schema/);
 assert.throws(()=>lib.validateExport({...data,tables:{...tables,profiles:{}}}),/array/);
 assert.throws(()=>lib.validateExport({...data,tables:{...tables,materials:[{id:'same'},{id:'same'}]}}),/duplicate/);
 const missing=structuredClone(data);delete missing.tables.programs;assert.throws(()=>lib.validateExport(missing),/core/);
});
test('restore credentials must be present, belong to exported owner, and match backup ID',()=>{
 const bundle={backupId:'backup-15'};const tables={profiles:[{id:'owner-a'}],applications:[{id:'a',owner_id:'owner-a'}]};const credentials={backupId:'backup-15',id:'owner-a',email:'fake@example.invalid',password:'private-fixture-password'};
 assert.doesNotThrow(()=>lib.validateRestoreCredentials(credentials,bundle,tables));
 for(const invalid of [null,{...credentials,backupId:'old-bundle'},{...credentials,id:'unrelated-user'},{...credentials,password:''}])assert.throws(()=>lib.validateRestoreCredentials(invalid,bundle,tables),/credential/);
});
test('archive validation cannot silently return false, and garbage cannot pass by checksum alone',async()=>{
 const fixture=await fixtureBundle();try{
 await assert.rejects(verifyBundle(fixture.dir,{archiveValidator:async()=>false}),/archive/);
 const garbage=Buffer.from('verified');await fs.writeFile(path.join(fixture.dir,'database.dump'),garbage);Object.assign(fixture.manifest.files[0],{size:garbage.length,sha256:sha256(garbage)});await fs.writeFile(path.join(fixture.dir,'manifest.json'),JSON.stringify(fixture.manifest));await assert.rejects(verifyBundle(fixture.dir,{archiveValidator:simulatedArchiveValidator}),/dump header/);
 }finally{await fs.rm(fixture.dir,{recursive:true,force:true});}
});
test('referenced material, receipt and archive objects cannot be omitted from a PASS bundle',async()=>{
 for(const [table,row]of [['material_versions',{id:'v',storage_path:'owner/material.pdf'}],['submissions',{id:'s',receipt_storage_path:'owner/receipt.pdf'}],['import_batches',{id:'i',archive_path:'owner/archive.json'}]]){const fixture=await fixtureBundle();try{fixture.tables[table]=[row];await saveFixture(fixture);await assert.rejects(verifyBundle(fixture.dir,{archiveValidator:simulatedArchiveValidator}),/Referenced storage/);}finally{await fs.rm(fixture.dir,{recursive:true,force:true});}}
});
test('every recorded storage byte file needs a matching object inventory entry',async()=>{
 const fixture=await fixtureBundle();try{const filename='storage/application-documents/owner/orphan.pdf',bytes=Buffer.from('PDF fixture');await fs.mkdir(path.dirname(path.join(fixture.dir,filename)),{recursive:true});await fs.writeFile(path.join(fixture.dir,filename),bytes);fixture.manifest.files.push({filename,size:bytes.length,sha256:sha256(bytes),status:'PASS'});await saveFixture(fixture);await assert.rejects(verifyBundle(fixture.dir,{archiveValidator:simulatedArchiveValidator}),/inventory/);}finally{await fs.rm(fixture.dir,{recursive:true,force:true});}
});
test('empty definitions cannot qualify a claimed PASS bundle for retention',async()=>{
 const fixture=await fixtureBundle();try{fixture.manifest.schemaSecurity={version:2,functions:[],triggers:[],policies:[],tables:[]};await saveFixture(fixture);await assert.rejects(verifyBundle(fixture.dir,{archiveValidator:simulatedArchiveValidator}),/definitions/);}finally{await fs.rm(fixture.dir,{recursive:true,force:true});}
});
test('missing credential file and partial environment credentials never skip auth verification',async()=>{
 const manifest={backupId:'backup-15'},tables={profiles:[{id:'owner-a'}],applications:[{id:'a',owner_id:'owner-a'}]};
 await assert.rejects(lib.loadRestoreCredentials({file:path.join(os.tmpdir(),'atlas-nonexistent-'+Date.now()+'.json'),env:{},manifest,tables}),/credentials/);
 await assert.rejects(lib.loadRestoreCredentials({env:{ATLAS_RESTORE_EMAIL:'fake@example.invalid'},manifest,tables}),/credentials/);
});
test('manifest cannot shrink authoritative tables/functions or conceal extra archive tables',async()=>{
 const fixture=await fixtureBundle();try{fixture.manifest.schemaSecurity.functions=fixture.manifest.schemaSecurity.functions.filter(fn=>fn.name!=='save_essay_version');await saveFixture(fixture);await assert.rejects(verifyBundle(fixture.dir,{archiveValidator:simulatedArchiveValidator}),/definitions/);}finally{await fs.rm(fixture.dir,{recursive:true,force:true});}
 const list=[...lib.coreTables.map((table,i)=>`${i+1}; 0 100 TABLE DATA public ${table} postgres`),'99; 0 101 TABLE DATA auth users postgres','100; 0 102 TABLE DATA auth identities postgres'].join('\n');
 assert.doesNotThrow(()=>lib.validateArchiveList(list,lib.coreTables));assert.throws(()=>lib.validateArchiveList(list+'\n101; 0 103 TABLE DATA public hidden_table postgres',lib.coreTables),/inventory/);
});
test('existing-bundle credential preflight works with no source CLI or database access',async()=>{
 const fixture=await fixtureBundle();try{fixture.tables.profiles=[{id:'owner-a'}];fixture.tables.universities=[{id:'u',owner_id:'owner-a'}];await saveFixture(fixture);const credentialsFile=path.join(fixture.dir,'test-private-credentials.json');await fs.writeFile(credentialsFile,JSON.stringify({backupId:fixture.manifest.backupId,id:'owner-a',email:'fake@example.invalid',password:'fake-private-password'}));
 const code=`import {preflightRestoreBundle} from './scripts/backup-lib.mjs'; await preflightRestoreBundle(${JSON.stringify(fixture.dir)},{file:${JSON.stringify(credentialsFile)},env:{}}); console.log('SOURCE_INDEPENDENT_PREFLIGHT_PASS');`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',code],{cwd:lib.root,env:{...process.env,PATH:''},encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),'SOURCE_INDEPENDENT_PREFLIGHT_PASS');
 }finally{await fs.rm(fixture.dir,{recursive:true,force:true});}
});

test('metadata-only forensic copies cannot masquerade as backed-up file bytes',async()=>{
 const fixture=await fixtureBundle();try{
  const filename='storage/application-documents/owner/fixture.json',bytes=Buffer.from('{"metadata":"not original file bytes"}');
  await fs.mkdir(path.dirname(path.join(fixture.dir,filename)),{recursive:true});await fs.writeFile(path.join(fixture.dir,filename),bytes);
  fixture.manifest.files.push({filename,size:bytes.length,sha256:sha256(bytes),status:'PASS'});
  fixture.manifest.objects.push({bucket:'application-documents',path:'owner/fixture.json',filename,size:bytes.length,sha256:sha256(bytes),status:'PASS',materialIds:[],versionIds:[],bytesPresent:false,checksumKind:'METADATA_ROW_JSON'});
  await saveFixture(fixture);await assert.rejects(verifyBundle(fixture.dir,{archiveValidator:simulatedArchiveValidator}),/original file bytes|metadata-only/);
 }finally{await fs.rm(fixture.dir,{recursive:true,force:true});}
});

test('import archive content must match the import batch checksum',async()=>{
 const fixture=await fixtureBundle();try{
  const objectPath='owner/imports/source.json',filename='storage/application-documents/'+objectPath,bytes=Buffer.from('synthetic changed archive');
  fixture.tables.import_batches=[{id:'batch',owner_id:'owner',archive_path:objectPath,checksum:sha256(Buffer.from('synthetic original archive'))}];
  await fs.mkdir(path.dirname(path.join(fixture.dir,filename)),{recursive:true});await fs.writeFile(path.join(fixture.dir,filename),bytes);
  fixture.manifest.files.push({filename,size:bytes.length,sha256:sha256(bytes),status:'PASS'});
  fixture.manifest.objects.push({bucket:'application-documents',path:objectPath,filename,size:bytes.length,sha256:sha256(bytes),status:'PASS',materialIds:[],versionIds:[]});
  await saveFixture(fixture);await assert.rejects(verifyBundle(fixture.dir,{archiveValidator:simulatedArchiveValidator}),/Import archive checksum/);
 }finally{await fs.rm(fixture.dir,{recursive:true,force:true});}
});
