export type Draft={content:string;baseVersion:number|null;updatedAt:string;revision?:string};
type DraftStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export class DraftRecovery {
 constructor(private storage:DraftStorage,private owner:string){}
 private key(id:string){return `essay-draft:${this.owner}:${id}`;}
 write(id:string,content:string,baseVersion:number|null):Draft{const draft={content,baseVersion,updatedAt:new Date().toISOString(),revision:crypto.randomUUID()};this.storage.setItem(this.key(id),JSON.stringify(draft));return draft;}
 read(id:string):Draft|null{const raw=this.storage.getItem(this.key(id));if(!raw)return null;try{return JSON.parse(raw);}catch{return null;}}
 clear(id:string){this.storage.removeItem(this.key(id));}
 acknowledge(id:string,submitted:Draft,versionNumber:number){
  const latest=this.read(id);if(!latest||latest.baseVersion!==submitted.baseVersion)return;
  if(latest.revision===submitted.revision&&latest.content===submitted.content)this.clear(id);
  else this.write(id,latest.content,versionNumber);
 }
}
