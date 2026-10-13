export type RecoveryOperation={id:string;owner:string;kind:'DELETE_ORPHAN'|'RESTORE_FILE';path:string;content?:Blob;createdAt:string};
export interface RecoveryJournal {put(operation:RecoveryOperation):Promise<void>;remove(id:string):Promise<void>;list(owner:string):Promise<RecoveryOperation[]>;}
const processLocks=new Map<string,Promise<void>>();
export async function withStorageLock<T>(owner:string,operation:()=>Promise<T>):Promise<T>{
 const name=`atlas-storage:${owner}`;
 if(typeof navigator!=='undefined'&&navigator.locks)return navigator.locks.request(name,operation);
 if(typeof window!=='undefined')throw new Error('当前浏览器不支持安全文件操作，请使用支持 Web Locks 的浏览器。');
 // Node tests use the same serialization contract across service instances.
 const previous=processLocks.get(name)??Promise.resolve();let release!:()=>void;const next=new Promise<void>(resolve=>{release=resolve;});const queue=previous.then(()=>next);processLocks.set(name,queue);
 await previous;try{return await operation();}finally{release();if(processLocks.get(name)===queue)processLocks.delete(name);}
}
export class IndexedRecoveryJournal implements RecoveryJournal {
 private async database(){return new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('atlas-storage-recovery',1);request.onupgradeneeded=()=>request.result.createObjectStore('operations',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
 private async transact<T>(mode:IDBTransactionMode,callback:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{const db=await this.database();return new Promise((resolve,reject)=>{const tx=db.transaction('operations',mode);const request=callback(tx.objectStore('operations'));let result:T;request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=()=>{db.close();reject(tx.error);};tx.onabort=()=>{db.close();reject(tx.error);};});}
 async put(operation:RecoveryOperation){await this.transact('readwrite',store=>store.put(operation));}
 async remove(id:string){await this.transact('readwrite',store=>store.delete(id));}
 async list(owner:string){return (await this.transact('readonly',store=>store.getAll()) as RecoveryOperation[]).filter(operation=>operation.owner===owner);}
}
