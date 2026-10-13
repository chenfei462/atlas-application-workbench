import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as drafts from '../src/drafts.js';
import {saveEssayDraft} from '../src/essay-save.js';
import {mapError,AtlasError} from '../src/errors.js';
import {labelFor} from '../src/forms.js';

// Run the production input/click/perform handlers with a deferred RPC. No browser
// storage, network, or database is accessed by this fixture.
function editorFixture({deferSnapshot=false}={}){
 const values=new Map<string,string>();
 const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>{values.delete(key);}};
 const recovery=new drafts.DraftRecovery(storage,'owner-a');
 const otherRecovery=new drafts.DraftRecovery(storage,'owner-b');
 const handlers:Record<string,(event:unknown)=>Promise<void>|void>={};
 const textarea={id:'essayContent',dataset:{essay:'essay1',base:'1'},value:'content A'};
 const status={textContent:''};
 const button={id:'saveEssay',dataset:{},disabled:false,setAttribute(){this.disabled=true;},removeAttribute(){this.disabled=false;},closest(){return this;}};
 let resolveRpc!:(value:unknown)=>void;
 let payload:Record<string,unknown>|undefined;
 let reloadCount=0;
 let serverVersion=1;
 let serverContent='initial content';
 const pending=new Promise(resolve=>{resolveRpc=resolve;});
 let snapshotStarted!:()=>void;const awaitingSnapshot=new Promise<void>(resolve=>{snapshotStarted=resolve;});
 let resolveSnapshot!:(value:unknown)=>void;const pendingSnapshot=new Promise(resolve=>{resolveSnapshot=resolve;});
 const serverSnapshot=()=>({essays:[{id:'essay1',application_id:'application1',type:'PS',current_version_number:serverVersion}],essay_versions:[{essay_id:'essay1',version_number:serverVersion,content:serverContent}]});
 const context:Record<string,any>={
  ...drafts,saveEssayDraft,mapError,AtlasError,writing:{render:()=>'',refreshChecks:()=>{}},localStorage:storage,session:{user:{id:'owner-a'}},generation:1,state:'READY',selectedEssay:'essay1',
  document:{addEventListener:(kind:string,handler:typeof handlers[string])=>{handlers[kind]=handler;},querySelector:(selector:string)=>selector==='#essayContent'?textarea:status},
  client:{rpc:(_name:string,input:Record<string,unknown>)=>{payload=input;return pending;}},
  owner:()=>context.session.user.id,message:()=>{},failure:()=>{},setState:(state:string)=>{context.state=state;},
  h:(value:unknown)=>String(value??''),labelFor,programName:()=>'',panel:()=>'',section:(_title:string,body:string)=>body,
  loadSnapshot:async()=>{reloadCount++;snapshotStarted();return deferSnapshot?pendingSnapshot:serverSnapshot();},
  render:()=>{
   const html=context.essays();
   textarea.value=html.match(/<textarea[^>]*>(.*?)<\/textarea>/s)![1];
   textarea.dataset.base=html.match(/data-base="([^"]*)"/)![1];
  },
 };
 context.snapshot={essays:[{id:'essay1',application_id:'application1',type:'PS',current_version_number:1}],essay_versions:[{essay_id:'essay1',version_number:1,content:serverContent}]};
 const lines=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8').split(/\r?\n/);
 const names=['async function reload(','async function perform(','function essays('];
 const actualCode=[...names.map(name=>lines.find(line=>line.startsWith(name))!),lines.find(line=>line.startsWith("document.addEventListener('input'"))!,...lines.slice(lines.findIndex(line=>line.startsWith("document.addEventListener('click'")),lines.findIndex(line=>line.startsWith("document.querySelector<HTMLFormElement>('#loginForm')")))].join('\n');
 vm.createContext(context);
 vm.runInContext(ts.transpileModule(actualCode,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 return {
  recovery,otherRecovery,textarea,button,
  start:()=>handlers.click({target:button}) as Promise<void>,
  rebase:()=>handlers.click({target:{...button,id:'rebaseEssay'}}) as Promise<void>,
  latest(version:number,content:string){serverVersion=version;serverContent=content;context.snapshot=serverSnapshot();context.render();},
  html:()=>context.essays() as string,
  type(content:string){textarea.value=content;handlers.input({target:textarea});},
  switchOwner(){context.session={user:{id:'owner-b'}};context.generation++;},
  resumeOwner(){context.session={user:{id:'owner-a'}};context.generation++;},
  awaitingSnapshot:()=>awaitingSnapshot,releaseSnapshot:()=>resolveSnapshot(serverSnapshot()),
  selectOtherEssay(){context.selectedEssay='essay2';textarea.dataset.essay='essay2';textarea.dataset.base='9';textarea.value='other essay content';},
  acknowledge(data:unknown={versionNumber:2}){if(data&&typeof data==='object'&&'versionNumber' in data){serverVersion=Number(data.versionNumber);serverContent=String(payload?.p_content);}resolveRpc({error:null,data});},
  fail(error:unknown){resolveRpc({error,data:null});},
  payload:()=>payload,reloadCount:()=>reloadCount,
 };
}

test('acknowledging A keeps later content B recoverable after the actual UI reload',async()=>{
 const editor=editorFixture();const save=editor.start();editor.type('content B');editor.acknowledge();await save;
 assert.equal(editor.recovery.read('essay1')?.content,'content B');
 assert.equal(editor.recovery.read('essay1')?.baseVersion,2);
 assert.equal(editor.textarea.value,'content B');assert.equal(editor.textarea.dataset.base,'2');
 assert.equal(editor.payload()?.p_content,'content A','The pending request must retain the submitted content');
});

test('an unchanged acknowledged draft is cleared and the saved content is displayed',async()=>{
 const editor=editorFixture();const save=editor.start();editor.acknowledge();await save;
 assert.equal(editor.recovery.read('essay1'),null);assert.equal(editor.textarea.value,'content A');
});

for(const [name,error] of [['network failure',new TypeError('fetch failed')],['conflict',{code:'40001'}]] as const){
 test(`${name} keeps the latest draft and enables retry`,async()=>{
  const editor=editorFixture();const save=editor.start();editor.type('content B');editor.fail(error);await save;
  assert.equal(editor.recovery.read('essay1')?.content,'content B');assert.equal(editor.recovery.read('essay1')?.baseVersion,1);
  assert.equal(editor.textarea.value,'content B');assert.equal(editor.button.disabled,false);assert.equal(editor.reloadCount(),0);
 });
}

test('completion from an old owner leaves both owners drafts and the new session DOM untouched',async()=>{
 const editor=editorFixture();const save=editor.start();editor.switchOwner();
 editor.recovery.write('essay1','new owner-a draft',1);editor.otherRecovery.write('essay1','owner-b draft',7);editor.textarea.value='owner-b editor';
 editor.acknowledge();await save;
 assert.equal(editor.recovery.read('essay1')?.content,'new owner-a draft');
 assert.equal(editor.otherRecovery.read('essay1')?.content,'owner-b draft');assert.equal(editor.textarea.value,'owner-b editor');assert.equal(editor.reloadCount(),0);
});

test('a response without a confirmed version keeps the draft available for retry',async()=>{
 const editor=editorFixture();const save=editor.start();editor.acknowledge(null);await save;
 assert.equal(editor.recovery.read('essay1')?.content,'content A');assert.equal(editor.button.disabled,false);assert.equal(editor.reloadCount(),0);
});

test('a later write of the same content is retained and rebased after acknowledgement',async()=>{
 const editor=editorFixture();const save=editor.start();editor.type('content A');editor.acknowledge();await save;
 assert.equal(editor.recovery.read('essay1')?.content,'content A');assert.equal(editor.recovery.read('essay1')?.baseVersion,2);
});

test('an old response cannot change a draft already based on another version',async()=>{
 const editor=editorFixture();const save=editor.start();editor.recovery.write('essay1','newer independent draft',7);editor.acknowledge();await save;
 assert.equal(editor.recovery.read('essay1')?.content,'newer independent draft');assert.equal(editor.recovery.read('essay1')?.baseVersion,7);
});

test('returning to the same owner still ignores a completion from the previous session',async()=>{
 const editor=editorFixture();const save=editor.start();editor.switchOwner();editor.resumeOwner();editor.recovery.write('essay1','resumed session draft',1);editor.textarea.value='resumed session editor';editor.acknowledge();await save;
 assert.equal(editor.recovery.read('essay1')?.content,'resumed session draft');assert.equal(editor.textarea.value,'resumed session editor');assert.equal(editor.reloadCount(),0);
});

test('input during snapshot loading keeps the confirmed base and survives the final render',async()=>{
 const editor=editorFixture({deferSnapshot:true});const save=editor.start();editor.type('content B');editor.acknowledge();await editor.awaitingSnapshot();
 assert.equal(editor.recovery.read('essay1')?.baseVersion,2);
 editor.type('content C');editor.releaseSnapshot();await save;
 assert.equal(editor.recovery.read('essay1')?.content,'content C');assert.equal(editor.recovery.read('essay1')?.baseVersion,2);
 assert.equal(editor.textarea.value,'content C');assert.equal(editor.textarea.dataset.base,'2');
});

test('an acknowledged save does not change the base of another selected essay',async()=>{
 const editor=editorFixture({deferSnapshot:true});const save=editor.start();editor.selectOtherEssay();editor.acknowledge();await editor.awaitingSnapshot();
 assert.equal(editor.textarea.dataset.base,'9');assert.equal(editor.textarea.value,'other essay content');editor.releaseSnapshot();await save;
});

test('a stale recovered essay shows the latest text and explicitly rebases without discarding or submitting the draft',async()=>{
 const editor=editorFixture();editor.type('retained applicant draft');editor.latest(2,'newer server text');
 assert.ok(editor.html().includes('newer server text'));assert.ok(editor.html().includes('id="rebaseEssay"'));
 await editor.rebase();
 assert.equal(editor.recovery.read('essay1')?.content,'retained applicant draft');assert.equal(editor.recovery.read('essay1')?.baseVersion,2);
 assert.equal(editor.textarea.value,'retained applicant draft');assert.equal(editor.textarea.dataset.base,'2');assert.equal(editor.payload(),undefined);
});
