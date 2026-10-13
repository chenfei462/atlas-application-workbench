import {parseWritingBrief,type WritingBrief} from './essay-writing.js';

export type WritingRecord={schemaVersion:1;ownerId:string;essayId:string;revision:string;updatedAt:string;brief:WritingBrief};
export type WritingStorageErrorCode='CORRUPT'|'STALE'|'QUOTA'|'INVALID';
export class WritingStorageError extends Error{constructor(readonly code:WritingStorageErrorCode,message:string){super(message);this.name='WritingStorageError';}}
type WritingStorage=Pick<Storage,'getItem'|'setItem'>;
const locks=new Map<string,Promise<void>>();
async function locked<T>(key:string,operation:()=>T):Promise<T>{
 if(typeof window!=='undefined'){
  if(window.navigator?.locks)return window.navigator.locks.request(`atlas-${key}`,operation);
  throw new WritingStorageError('INVALID','当前浏览器不支持安全简报保存（Web Locks）；请复制或导出简报后使用支持的浏览器。');
 }
 const previous=locks.get(key)??Promise.resolve();let release!:()=>void;const next=new Promise<void>(resolve=>{release=resolve;});const queued=previous.then(()=>next);locks.set(key,queued);await previous;
 try{return operation();}finally{release();if(locks.get(key)===queued)locks.delete(key);}
}
function identity(value:string):string{if(typeof value!=='string'||!value.trim()||value.length>200)throw new WritingStorageError('INVALID','账号或文书身份无效');return encodeURIComponent(value);}

export class WritingBriefStorage{
 constructor(private storage:WritingStorage,private ownerId:string){identity(ownerId);}
 private key(essayId:string){return `essay-writing:v1:${identity(this.ownerId)}:${identity(essayId)}`;}
 read(essayId:string):WritingRecord|null{
  let raw:string|null;try{raw=this.storage.getItem(this.key(essayId));}catch(error){if(error instanceof WritingStorageError)throw error;throw new WritingStorageError('INVALID','无法读取当前浏览器简报；请保留编辑内容并导出。');}
  if(raw===null)return null;
  try{
   const record=JSON.parse(raw);if(!record||record.schemaVersion!==1||record.ownerId!==this.ownerId||record.essayId!==essayId||typeof record.revision!=='string'||!record.revision||record.revision.length>200||typeof record.updatedAt!=='string'||Number.isNaN(Date.parse(record.updatedAt)))throw new Error('record scope/schema');
   return {schemaVersion:1,ownerId:this.ownerId,essayId,revision:record.revision,updatedAt:record.updatedAt,brief:parseWritingBrief(record.brief)};
  }catch{throw new WritingStorageError('CORRUPT','本机写作简报格式损坏或身份不符；原值保留，不会以默认简报覆盖。请先导出当前内容。');}
 }
 async write(essayId:string,brief:WritingBrief,expectedRevision:string|null,canCommit:()=>boolean=()=>true):Promise<WritingRecord>{
  const key=this.key(essayId);let checked:WritingBrief;try{checked=parseWritingBrief(brief);}catch(error){throw new WritingStorageError('INVALID',error instanceof Error?error.message:'写作简报格式无效');}
  if(expectedRevision!==null&&(typeof expectedRevision!=='string'||!expectedRevision))throw new WritingStorageError('INVALID','简报保存基准无效');
  return locked(key,()=>{
   if(!canCommit())throw new WritingStorageError('INVALID','登录状态已变化，本次旧会话简报未保存；请在当前会话重新核对。');
   const current=this.read(essayId);if((current?.revision??null)!==expectedRevision)throw new WritingStorageError('STALE','另一个页面已更新写作简报；当前修改未覆盖它，请导出后重新加载并比较。');
   const record:WritingRecord={schemaVersion:1,ownerId:this.ownerId,essayId,revision:crypto.randomUUID(),updatedAt:new Date().toISOString(),brief:checked};
   try{this.storage.setItem(key,JSON.stringify(record));}catch{throw new WritingStorageError('QUOTA','本机简报未保存，浏览器存储空间不足或不可写；旧简报保留，请先复制或导出。');}
   return record;
  });
 }
}
