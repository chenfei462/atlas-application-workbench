import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {AtlasError,mapError} from '../src/errors.ts';

function registrationFixture({profileFailure=false,loadFailure=false}={}){
 const messages:string[]=[];const button={disabled:false};const authStatus={textContent:''};const toggle={textContent:''};let listener!:(event:unknown)=>Promise<void>;
 const inputs:Record<string,string>={displayName:'Synthetic profile',email:'fake@example.invalid',password:'synthetic-password-123',confirmation:'synthetic-password-123'};
 const context:Record<string,unknown>={AtlasError,mapError,registrationActive:true,state:'LOGGED_OUT',session:null,client:{},document:{querySelector:(name:string)=>name==='#registrationForm'?{addEventListener:(_kind:string,callback:typeof listener)=>{listener=callback;}}:name==='#registrationButton'?button:name==='#showRegistration'?toggle:authStatus},FormData:class{get(name:string){return inputs[name];}},auth:{signUp:async()=>({user:{id:'synthetic-owner'}})},repository:()=>({insert:async()=>{if(profileFailure)throw Error('synthetic profile network failure');}}),handleSession:async(created:unknown)=>{context.session=created;},reload:async()=>{context.state=loadFailure?'ERROR':'READY';},message:(value:string)=>messages.push(value)};
 const source=fs.readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');const start=source.indexOf("document.querySelector<HTMLFormElement>('#registrationForm')!.addEventListener");const end=source.indexOf("document.querySelector('#retryLoad')",start);assert.ok(start>=0&&end>start);
 vm.createContext(context);vm.runInContext(ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 return {messages,button,run:()=>listener({preventDefault(){},currentTarget:{}})};
}
test('successful account creation does not report a ready workspace when the first data load fails',async()=>{
 const f=registrationFixture({loadFailure:true});await f.run();assert.match(f.messages.at(-1)??'',/资料加载失败|重新加载/);assert.equal(f.button.disabled,false);
});
test('the completion message preserves the profile recovery instruction when profile insertion fails',async()=>{
 const f=registrationFixture({profileFailure:true});await f.run();assert.match(f.messages.at(-1)??'',/我的画像|补齐/);assert.equal(f.button.disabled,false);
});
test('a ready account and saved profile show the ordinary completion message',async()=>{
 const f=registrationFixture();await f.run();assert.match(f.messages.at(-1)??'',/可以开始管理申请/);assert.equal(f.button.disabled,false);
});
