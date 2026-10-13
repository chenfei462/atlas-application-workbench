import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database} from '../types/database.types.js';
import {repository} from './repositories.js';
import {AtlasError,mapError} from './errors.js';
import {IndexedRecoveryJournal,type RecoveryJournal,withStorageLock} from './storage-recovery.js';
export const DOCUMENT_BUCKET='application-documents';
const mimeTypes=new Set(['application/pdf','image/jpeg','image/png','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
export function validateFile(file:{name:string;type:string;size:number}){
 if(!mimeTypes.has(file.type)||file.size<=0||file.size>20*1024*1024)throw new AtlasError('VALIDATION_ERROR','请选择 20MB 以内的非空 PDF、PNG、JPEG 或 DOCX 文件。');
  const hasControl=[...file.name].some(character=>character.charCodeAt(0)<32);
  if(!file.name || file.name.length>180 || hasControl || /[\\/<>:"|?*]/.test(file.name) || file.name.includes('..'))throw new AtlasError('VALIDATION_ERROR','文件名包含不安全字符，请重命名后重试。');
 const suffix=file.name.split('.').pop()?.toLowerCase();
 if(!({ 'application/pdf':['pdf'],'image/jpeg':['jpg','jpeg'],'image/png':['png'],'application/vnd.openxmlformats-officedocument.wordprocessingml.document':['docx']}[file.type]?.includes(suffix??'')))throw new AtlasError('VALIDATION_ERROR','文件扩展名与类型不一致。');
}
export async function sha256(blob:Blob){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
export async function verifySignature(file:Blob){const bytes=new Uint8Array(await file.slice(0,8).arrayBuffer());const header=String.fromCharCode(...bytes);const valid=file.type==='application/pdf'?header.startsWith('%PDF-'):file.type==='image/png'?bytes[0]===137&&header.slice(1,4)==='PNG':file.type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:header.startsWith('PK\x03\x04');if(!valid)throw new AtlasError('VALIDATION_ERROR','文件内容与声明类型不符。');}
export class MaterialService {
 constructor(private client:SupabaseClient<Database>,readonly owner:string,private journal:RecoveryJournal=new IndexedRecoveryJournal()){}
 private bucket(){return this.client.storage.from(DOCUMENT_BUCKET);}
 upload(materialId:string,file:File){return withStorageLock(this.owner,()=>this.uploadLocked(materialId,file));}
 private async uploadLocked(materialId:string,file:File){
  validateFile(file);await verifySignature(file);
  await repository(this.client,this.owner,'materials').get(materialId);
  const versions=(await repository(this.client,this.owner,'material_versions').list()).filter(version=>version.material_id===materialId);
  const id=crypto.randomUUID();const extension=file.name.split('.').pop()!.toLowerCase();const path=`${this.owner}/materials/${materialId}/${id}/document.${extension}`;
  const hash=await sha256(file);
  // Persist compensation intent before the first external mutation.
  await this.journal.put({id,owner:this.owner,kind:'DELETE_ORPHAN',path,createdAt:new Date().toISOString()});
  try{
   const upload=await this.bucket().upload(path,file,{upsert:false,contentType:file.type});if(upload.error)throw mapError(upload.error);
   const verification=await this.bucket().download(path);if(verification.error || !verification.data)throw mapError(verification.error);
   if(await sha256(verification.data)!==hash)throw new AtlasError('VALIDATION_ERROR','上传校验失败。');
   const version=await repository(this.client,this.owner,'material_versions').insert({id,owner_id:this.owner,material_id:materialId,version_number:Math.max(0,...versions.map(v=>v.version_number))+1,variant:'GENERAL',storage_path:path,original_filename:file.name,mime_type:file.type,size_bytes:file.size,sha256:hash});
   // Metadata is committed now. A journal cleanup failure must never delete its file.
   try{await this.journal.remove(id);}catch{ /* Recovery will clear the durable intent later. */ }return version;
  }catch(error){
   // Both network responses can be lost after a commit. Reconcile the preallocated
   // version ID before compensation; an unknown read retains the durable intent.
   let confirmed;
   try{confirmed=await repository(this.client,this.owner,'material_versions').get(id);}catch(check){if(mapError(check).kind!=='NOT_FOUND')throw mapError(error);}
   if(confirmed){if(confirmed.storage_path!==path||confirmed.sha256!==hash)throw new AtlasError('CONFLICT');try{await this.journal.remove(id);}catch{ /* Keep intent for recovery. */ }return confirmed;}
   const probe=await this.bucket().download(path);
   if(probe.data){const cleanup=await this.bucket().remove([path]);if(!cleanup.error)try{await this.journal.remove(id);}catch{ /* Keep intent for recovery. */ }}
   else if(probe.error&&(probe.error.status===404||/not found/i.test(probe.error.message)))try{await this.journal.remove(id);}catch{ /* Keep intent for recovery. */ }
   throw mapError(error);
  }
 }
 async download(versionId:string){const version=await repository(this.client,this.owner,'material_versions').get(versionId);if(!version.storage_path)throw new AtlasError('NOT_FOUND','该历史版本没有文件，请从原始迁移备份恢复。');const pending=await this.journal.list(this.owner);if(pending.some(op=>op.path===version.storage_path&&op.kind==='RESTORE_FILE'))throw new AtlasError('CONFLICT','该文件有待恢复操作，请先重试文件恢复。');const result=await this.bucket().download(version.storage_path);if(result.error || !result.data)throw mapError(result.error);if(version.sha256 && await sha256(result.data)!==version.sha256)throw new AtlasError('VALIDATION_ERROR','文件完整性校验失败。');return {blob:result.data,name:version.original_filename??'document'};}
 async signedUrl(versionId:string){const version=await repository(this.client,this.owner,'material_versions').get(versionId);if(!version.storage_path)throw new AtlasError('NOT_FOUND');const result=await this.bucket().createSignedUrl(version.storage_path,120);if(result.error)throw mapError(result.error);return result.data.signedUrl;}
 delete(versionId:string){return withStorageLock(this.owner,()=>this.deleteLocked(versionId));}
 private async deleteLocked(versionId:string){
  const version=await repository(this.client,this.owner,'material_versions').get(versionId);
  const [bindings,receipts]=await Promise.all([repository(this.client,this.owner,'application_materials').list(),repository(this.client,this.owner,'submissions').list()]);
  if(bindings.some(link=>link.material_version_id===versionId)||receipts.some(receipt=>version.storage_path&&receipt.receipt_storage_path===version.storage_path))throw new AtlasError('CONFLICT','该版本已用于申请材料或提交凭证，不能删除。');
  const id=crypto.randomUUID();const path=version.storage_path;
  let backup:Blob|null=null;
  if(path){const result=await this.bucket().download(path);if(result.error || !result.data)throw mapError(result.error);backup=result.data;if(version.sha256&&await sha256(backup)!==version.sha256)throw new AtlasError('VALIDATION_ERROR','文件校验失败，未执行删除。');await this.journal.put({id,owner:this.owner,kind:'RESTORE_FILE',path,content:backup,createdAt:new Date().toISOString()});const removal=await this.bucket().remove([path]);if(removal.error)throw mapError(removal.error);}
   try{const result=await this.client.rpc('delete_material_version',{p_id:versionId});if(result.error)throw mapError(result.error);if(path)try{await this.journal.remove(id);}catch{ /* Keep intent for recovery. */ }}
  catch(error){if(path&&backup){try{const retained=(await repository(this.client,this.owner,'material_versions').list()).some(v=>v.id===versionId);if(retained){const restore=await this.bucket().upload(path,backup,{upsert:false,contentType:version.mime_type??'application/octet-stream'});if(!restore.error)await this.journal.remove(id);}else await this.journal.remove(id);}catch{/* Unknown completion: keep the recovery intent until a confirmed read. */}}throw mapError(error);}
 }
 recover(){return withStorageLock(this.owner,()=>this.recoverLocked());}
 private async recoverLocked(){
  const pending=await this.journal.list(this.owner);
  const versions=await repository(this.client,this.owner,'material_versions').list();
  for(const op of pending){
   if(!op.path.startsWith(`${this.owner}/`))throw new AtlasError('PERMISSION_DENIED');
   // If upload committed but tab crashed before clearing intent, retain the object.
   if(op.kind==='DELETE_ORPHAN'){
    if(versions.some(v=>v.storage_path===op.path)){await this.journal.remove(op.id);continue;}
    const result=await this.bucket().remove([op.path]);if(result.error)throw mapError(result.error);
   }else{
    if(!versions.some(v=>v.storage_path===op.path)){const cleanup=await this.bucket().remove([op.path]);if(cleanup.error)throw mapError(cleanup.error);await this.journal.remove(op.id);continue;}
    if(!op.content)throw new AtlasError('VALIDATION_ERROR');
    const exists=await this.bucket().download(op.path);
    if(!exists.error&&exists.data){if(await sha256(exists.data)!==await sha256(op.content))throw new AtlasError('CONFLICT');}
    else{const result=await this.bucket().upload(op.path,op.content,{upsert:false,contentType:op.content.type||'application/octet-stream'});if(result.error)throw mapError(result.error);}
   }
   await this.journal.remove(op.id);
  }
  return pending.length;
 }
 pending(){return this.journal.list(this.owner);}
}
