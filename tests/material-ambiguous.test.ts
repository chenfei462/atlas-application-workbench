import test from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database} from '../types/database.types.js';
import {MaterialService} from '../src/material-service.js';
function backend({lostInsert=false,lostRemove=false,beforeInsert=undefined as undefined|(()=>void)}={}){
 const owner='00000000-0000-0000-0000-000000000001';const versions:Record<string,unknown>[]=[];const files=new Map<string,Blob>();const intents=new Map<string,unknown>();
 const journal={async put(op:Record<string,unknown>){intents.set(String(op.id),op);},async remove(id:string){intents.delete(id);},async list(){return [...intents.values()];}};
 const bucket={async upload(path:string,blob:Blob){files.set(path,blob);return {error:null};},async download(path:string){return files.has(path)?{data:files.get(path),error:null}:{data:null,error:{status:404}};},async remove(paths:string[]){paths.forEach(path=>files.delete(path));return {error:lostRemove?new TypeError('Response lost after deletion'):null};}};
 const client={storage:{from(){return bucket;}},from(table:string){let id:string|undefined;let input:Record<string,unknown>;const query={select(){return query;},filter(){return query;},eq(_column:string,value:string){id=value;return query;},order(){return query;},async range(){return {data:table==='material_versions'?[...versions]:[],error:null};},async maybeSingle(){return {data:table==='materials'?{id:'material1',owner_id:owner}:versions.find(row=>row.id===id)??null,error:null};},insert(row:Record<string,unknown>){input=row;return query;},async single(){beforeInsert?.();await new Promise(resolve=>setTimeout(resolve,0));versions.push(input);if(lostInsert)throw new TypeError('Response lost after commit');return {data:input,error:null};}};return query;},async rpc(){versions.length=0;return {error:null};}};
 return {service:new MaterialService(client as unknown as SupabaseClient<Database>,owner,journal as never),versions,files,intents};
}
test('committed metadata with a lost response retains the file and reconciles success',async()=>{
 const state=backend({lostInsert:true});const file=new File(['%PDF-1.4\nFake content'],'fake.pdf',{type:'application/pdf'});
 const version=await state.service.upload('material1',file);
 assert.ok(version.id);assert.equal(state.versions.length,1);assert.equal(state.files.size,1);assert.equal(state.intents.size,0);
});
test('recovery cannot delete a live upload waiting for metadata',async()=>{
 let recovery:Promise<number>|undefined;
 const state=backend({beforeInsert:()=>{recovery=state.service.recover();}});
 const file=new File(['%PDF-1.4\nFake race'],'fake.pdf',{type:'application/pdf'});
 await state.service.upload('material1',file);await recovery;
 assert.equal(state.versions.length,1);assert.equal(state.files.size,1);
});
test('lost storage deletion response retains a recoverable file backup',async()=>{
 const state=backend({lostRemove:true});const file=new File(['%PDF-1.4\nFake content'],'fake.pdf',{type:'application/pdf'});
 const version=await state.service.upload('material1',file);await assert.rejects(state.service.delete(version.id));
 assert.equal(state.versions.length,1);
 assert.ok(state.files.size===1||state.intents.size===1,'File or durable recovery must survive ambiguous delete');
});
