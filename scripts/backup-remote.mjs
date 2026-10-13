// Explicit source backup engine; no CLI status(), local project discovery, or remote writes.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { root, safePath, assertConfined, references, sha256, writeJSON, verifyBundle } from './backup-lib.mjs';
import { assertSourceConfig, parseRemoteSourceConfig, createRemoteTransport, validateSourceSnapshot } from './remote-source.mjs';

function failure(code) { return new Error(code); }
function stateHash(snapshot) { return sha256(Buffer.from(JSON.stringify(snapshot))); }
function inventoryPaths(dir,snapshot) {
 const keys=new Set(),buckets=new Set();
 for(const bucket of snapshot.buckets){if(!bucket||!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(bucket.id)||buckets.has(bucket.id))throw failure('STORAGE_INVENTORY_INVALID');buckets.add(bucket.id);}
 for(const object of snapshot.objects){const key=JSON.stringify([object.bucket_id,object.name]);try{if(!buckets.has(object.bucket_id)||keys.has(key))throw Error();safePath(dir,`storage/${object.bucket_id}/${object.name}`);}catch{throw failure('STORAGE_INVENTORY_INVALID');}keys.add(key);}
 return references(snapshot.tables).filter(ref=>!keys.has(JSON.stringify([ref.bucket,ref.path])));
}
export async function backupRemote({config,transport,destinationRoot=path.join(root,'backups-remote'),daily=false}={}) {
 assertSourceConfig(config);
 transport??=createRemoteTransport(config);
 if(!['readSnapshot','dumpDatabase','downloadObject','validateArchive'].every(method=>typeof transport[method]==='function'))throw failure('REMOTE_TRANSPORT_INVALID');
 const backupId=new Date().toISOString().replaceAll(':','-')+'-'+crypto.randomUUID().slice(0,8);
 const absoluteRoot=path.resolve(destinationRoot);await fs.mkdir(absoluteRoot,{recursive:true});const realRoot=await fs.realpath(absoluteRoot);
 // Reject a symlinked parent root before creating or writing a bundle.
 if(realRoot!==absoluteRoot)throw failure('BACKUP_PATH_INVALID');
 const dir=safePath(realRoot,backupId);await fs.mkdir(dir);assertConfined(realRoot,await fs.realpath(dir));
 const manifest={formatVersion:1,backupId,createdAt:new Date().toISOString(),environment:'Atlas explicit source backup',kind:daily?'daily':'manual',migrationHead:null,status:'RUNNING',files:[],objects:[]};
 let stage='SOURCE_READ_FAILED';
 async function record(filename,bytes){const target=safePath(dir,filename);await fs.mkdir(path.dirname(target),{recursive:true});assertConfined(await fs.realpath(dir),await fs.realpath(path.dirname(target)));await fs.writeFile(target,bytes,{flag:'wx'});manifest.files.push({filename,size:bytes.length,sha256:sha256(bytes),status:'PASS'});}
 try{
  const before=validateSourceSnapshot(await transport.readSnapshot());
  manifest.migrationHead=before.migrationHead;manifest.schemaSecurity=before.schemaSecurity;manifest.buckets=before.buckets;
  manifest.source={mode:config.mode,projectRef:config.projectRef,publicUrl:config.publicUrl,postgresVersion:before.postgresVersion,postgresMajor:before.postgresMajor,dumpSchemas:['public','auth','storage'],databaseTables:before.databaseTables,authTables:before.authTables,contentFingerprints:before.contentFingerprints,schemaConstraints:before.schemaConstraints,schemaIndexes:before.schemaIndexes};
  stage='STORAGE_INVENTORY_INVALID';const missing=inventoryPaths(dir,before);
  stage='MISSING_STORAGE_REFERENCE';if(missing.length)throw failure(stage);
  stage='DATABASE_DUMP_FAILED';const dump=Buffer.from(await transport.dumpDatabase());
  stage='ARCHIVE_VALIDATION_FAILED';if(dump.length<20||dump.subarray(0,5).toString()!=='PGDMP'||await transport.validateArchive(dump,Object.keys(before.tables))!==true)throw failure(stage);
  stage='BACKUP_WRITE_FAILED';await record('database.dump',dump);await record('atlas-export.json',Buffer.from(JSON.stringify({schemaVersion:3,exportedAt:manifest.createdAt,tables:before.tables},null,2)+'\n'));
  const refs=references(before.tables);
  for(const object of before.objects){
   const filename=`storage/${object.bucket_id}/${object.name}`;const linked=refs.filter(ref=>ref.bucket===object.bucket_id&&ref.path===object.name);
   const entry={bucket:object.bucket_id,path:object.name,owner:object.owner_id,metadata:object.metadata,objectVersion:object.version,materialIds:[...new Set(linked.map(ref=>ref.materialId).filter(Boolean))].sort(),versionIds:[...new Set(linked.map(ref=>ref.versionId).filter(Boolean))].sort(),filename,backedUpAt:new Date().toISOString(),status:'FAIL'};manifest.objects.push(entry);
   stage='STORAGE_READ_FAILED';const bytes=Buffer.from(await transport.downloadObject(object.bucket_id,object.name));
   stage='STORAGE_SIZE_MISMATCH';if(object.metadata?.size!==undefined&&(!Number.isSafeInteger(Number(object.metadata.size))||Number(object.metadata.size)!==bytes.length))throw failure(stage);
   entry.size=bytes.length;entry.sha256=sha256(bytes);
   stage='STORAGE_CHECKSUM_MISMATCH';for(const ref of linked.filter(ref=>ref.table==='material_versions')){const row=before.tables.material_versions.find(row=>row.id===ref.id);if(row.sha256&&row.sha256!==entry.sha256||row.size_bytes!=null&&Number(row.size_bytes)!==entry.size)throw failure(stage);}
   stage='BACKUP_WRITE_FAILED';await record(filename,bytes);entry.status='PASS';
  }
  stage='SOURCE_READ_FAILED';const after=validateSourceSnapshot(await transport.readSnapshot());stage='SOURCE_DRIFT';if(stateHash(before)!==stateHash(after))throw failure(stage);
  // Detect changed bytes even when object metadata/version did not change.
  for(const object of manifest.objects){stage='STORAGE_READ_FAILED';const bytes=Buffer.from(await transport.downloadObject(object.bucket,object.path));stage='STORAGE_DRIFT';if(bytes.length!==object.size||sha256(bytes)!==object.sha256)throw failure(stage);}
  stage='SOURCE_READ_FAILED';const final=validateSourceSnapshot(await transport.readSnapshot());stage='SOURCE_DRIFT';if(stateHash(before)!==stateHash(final))throw failure(stage);
  manifest.source.stability='BEFORE_AFTER_EXACT_MATCH';manifest.missingReferences=[];
  // The validator requires PASS; publish it only in memory until the manifest is fully verified.
  manifest.status='PASS';stage='BACKUP_WRITE_FAILED';await writeJSON(path.join(dir,'manifest.json'),manifest);
  stage='BUNDLE_VALIDATION_FAILED';await verifyBundle(dir,{archiveValidator:(bytes,tables)=>transport.validateArchive(bytes,tables)});
  return dir;
 }catch{
  manifest.status='FAIL';manifest.failure=stage;await writeJSON(path.join(dir,'manifest.json'),manifest);throw failure(stage);
 }
}
function cliOptions(args){
 const allowed=new Set(['--daily','--destination','--check-config']);if(args.some((arg,index)=>arg.startsWith('--')&&!allowed.has(arg)||!arg.startsWith('--')&&args[index-1]!=='--destination'))throw failure('REMOTE_CLI_ARGUMENT_INVALID');
 const destinationIndex=args.indexOf('--destination');if(destinationIndex>=0&&(!args[destinationIndex+1]||args[destinationIndex+1].startsWith('--')))throw failure('REMOTE_CLI_ARGUMENT_INVALID');
 return {daily:args.includes('--daily'),destinationRoot:destinationIndex>=0?path.resolve(args[destinationIndex+1]):undefined,checkConfig:args.includes('--check-config')};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const options=cliOptions(process.argv.slice(2));const config=parseRemoteSourceConfig(process.env);if(options.checkConfig)console.log('REMOTE_CONFIGURATION_VALIDATED_CONNECTION_UNVERIFIED');else backupRemote({...options,config}).then(dir=>console.log(`REMOTE_BACKUP_PASS ${path.basename(dir)}`)).catch(error=>{console.error(`REMOTE_BACKUP_FAIL ${error.message}`);process.exitCode=1;});}catch(error){console.error(`REMOTE_BACKUP_FAIL ${error.message}`);process.exitCode=1;}
}
