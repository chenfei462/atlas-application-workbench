import test from 'node:test';
import assert from 'node:assert/strict';
import {EssayWritingController} from '../src/essay-writing-controller.js';

function fixture(){
 const values=new Map<string,string>();const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};
 let owner='owner-a';const essay={id:'essay-a',owner_id:owner,type:'PS',prompt:'Explain your preparation',current_version_number:1};
 const snapshot:any={essays:[essay],essay_versions:[{id:'v1',essay_id:'essay-a',owner_id:owner,version_number:1,content:'Saved text'}],evidence_items:[]};
 const textarea={value:'Current unsaved text',dataset:{essay:'essay-a'}};
 const checks={innerHTML:'',querySelectorAll:()=>[]};const status={textContent:''};let bodyWrites=0;
 const element={get value(){return textarea.value;},set value(v:string){bodyWrites++;textarea.value=v;},dataset:textarea.dataset};
 const doc:any={querySelector:(s:string)=>s==='#essayContent'?element:s==='#writingChecks'?checks:s==='#writingStorageStatus'?status:null};
 const downloads:{text:string,name:string}[]=[];const messages:string[]=[];
 const controller=new EssayWritingController({storage,document:doc,getSnapshot:()=>snapshot,getOwner:()=>owner,download:(text,name)=>downloads.push({text,name}),associate:async()=>{},notify:(text)=>messages.push(text)});
 return {controller,values,textarea,status,checks,downloads,messages,doc,bodyWrites:()=>bodyWrites,switchOwner(){owner='owner-b';},snapshot};
}

test('writing updates persist the brief without replacing current essay textarea',async()=>{
 const f=fixture();f.controller.render('essay-a',f.textarea.value);
 await f.controller.input({dataset:{writingField:'prompt'},value:'Finance question'} as any);
 assert.equal(f.bodyWrites(),0);assert.equal(f.textarea.value,'Current unsaved text');
 const stored=JSON.parse([...f.values.values()][0]);assert.equal(stored.brief.prompt,'Finance question');
 assert.match(f.status.textContent,/保存在此浏览器/);
});

test('full export includes current unsaved body while brief-only export omits it',async()=>{
 const f=fixture();f.controller.render('essay-a',f.textarea.value);
 await f.controller.action({dataset:{writingAction:'export-full'}} as any);
 await f.controller.action({dataset:{writingAction:'export-brief'}} as any);
 assert.match(f.downloads[0].text,/Current unsaved text/);assert.match(f.downloads[0].text,/未保存/);
 assert.ok(!f.downloads[1].text.includes('Current unsaved text'));
});

test('an old rendered control cannot write to a switched owner',async()=>{
 const f=fixture();f.controller.render('essay-a',f.textarea.value);f.switchOwner();
 await f.controller.input({dataset:{writingField:'prompt'},value:'Old owner event'} as any);
 assert.equal(f.values.size,0);assert.equal(f.bodyWrites(),0);
});

test('corrupt storage remains intact and the user can export a local working brief',async()=>{
 const f=fixture();f.values.set('essay-writing:v1:owner-a:essay-a','broken');
 const html=f.controller.render('essay-a',f.textarea.value);assert.match(html,/损坏|读取/);
 await f.controller.input({dataset:{writingField:'prompt'},value:'Retain working notes'} as any);
 assert.equal(f.values.get('essay-writing:v1:owner-a:essay-a'),'broken');
 await f.controller.action({dataset:{writingAction:'export-brief'}} as any);
 assert.match(f.downloads[0].text,/Retain working notes/);
});

test('invalid inputs remain explicit and are preserved separately in export',async()=>{
 const f=fixture();f.controller.render('essay-a',f.textarea.value);
 await f.controller.input({dataset:{writingField:'promptUrl'},value:'https://'} as any);
 await f.controller.input({dataset:{writingField:'prompt'},value:'Another valid edit'} as any);
 assert.match(f.status.textContent,/输入未保存/);
 await f.controller.action({dataset:{writingAction:'export-brief'}} as any);
 assert.match(f.downloads[0].text,/尚未通过校验的输入/);assert.match(f.downloads[0].text,/https:\/\//);
 assert.ok(!f.downloads[0].text.includes(f.textarea.value));
});

test('a new empty essay is exported as unsaved rather than nonexistent database v0',async()=>{
 const f=fixture();f.snapshot.essay_versions=[];f.snapshot.essays[0].current_version_number=null;f.textarea.value='';f.controller.render('essay-a','');
 await f.controller.action({dataset:{writingAction:'export-full'}} as any);
 assert.match(f.downloads[0].text,/未保存草稿/);assert.doesNotMatch(f.downloads[0].text,/数据库 v0/);
});

test('regeneration protects edits to section titles, questions and budgets',async()=>{
 const f=fixture();f.controller.render('essay-a',f.textarea.value);
 await f.controller.input({dataset:{sectionId:'motivation',sectionField:'title'},value:'My edited title'} as any);
 await f.controller.action({dataset:{writingAction:'regenerate-outline'}} as any);
 await f.controller.action({dataset:{writingAction:'export-brief'}} as any);
 assert.match(f.downloads[0].text,/My edited title/);assert.match(f.messages.join(' '),/提纲已有/);
});

test('review checkbox refresh restores keyboard focus to its replacement',()=>{
 const f=fixture();f.controller.render('essay-a',f.textarea.value);let focused='';
 f.doc.activeElement={dataset:{reviewKey:'PROMPT'}};
 Object.assign(f.checks,{contains:()=>true,querySelectorAll:()=>[],querySelector:()=>({focus:()=>{focused='PROMPT';}})});
 f.controller.refreshChecks();assert.equal(focused,'PROMPT');
});

test('selecting evidence immediately enables the explicit association button',async()=>{
 const f=fixture();f.snapshot.evidence_items=[{id:'fact-a',owner_id:'owner-a',title:'Synthetic evidence',verified:false}];
 const button={disabled:true};const summary={textContent:''};const base=f.doc.querySelector;
 f.doc.querySelector=(s:string)=>s==='[data-writing-action="associate-evidence"]'?button:s==='.writing-associations > summary'?summary:base(s);
 f.controller.render('essay-a',f.textarea.value);
 await f.controller.input({dataset:{sectionId:'experience',evidenceId:'fact-a'},value:'on',checked:true} as any);
 assert.equal(button.disabled,false);assert.match(summary.textContent,/已选 1 项/);
});

test('session reset cancels a queued old edit even when the same owner returns',async()=>{
 const f=fixture();f.controller.render('essay-a',f.textarea.value);
 const pending=f.controller.input({dataset:{writingField:'prompt'},value:'Old session edit'} as any);
 f.controller.resetSession();f.controller.render('essay-a',f.textarea.value);await pending;
 assert.equal(f.values.size,0);
});

test('rerender keeps invalid raw input and its unsaved warning visible',async()=>{
 const f=fixture();f.controller.render('essay-a',f.textarea.value);
 await f.controller.input({dataset:{writingField:'promptUrl'},value:'javascript:INVALID_RAW_MARKER'} as any);
 await f.controller.input({dataset:{writingField:'prompt'},value:'Valid next edit'} as any);
 const html=f.controller.render('essay-a',f.textarea.value);
 assert.match(html,/输入未保存/);assert.match(html,/INVALID_RAW_MARKER/);
 assert.doesNotMatch(html,/href="javascript:/);
});

test('switching to computing preserves customised outline and prose while exporting the selected direction',async()=>{
 const f=fixture();f.controller.render('essay-a',f.textarea.value);
 await f.controller.input({dataset:{sectionId:'experience',sectionField:'notes'},value:'My existing project reasoning'} as any);
 await f.controller.input({dataset:{writingField:'area'},value:'COMPUTER_SCIENCE'} as any);
 const record=JSON.parse([...f.values.values()][0]);assert.equal(record.brief.area,'COMPUTER_SCIENCE');
 assert.equal(record.brief.sections.find((s:any)=>s.id==='experience').notes,'My existing project reasoning');
 assert.equal(f.bodyWrites(),0);assert.equal(f.textarea.value,'Current unsaved text');
 await f.controller.action({dataset:{writingAction:'regenerate-outline'}} as any);
 await f.controller.action({dataset:{writingAction:'export-brief'}} as any);
 assert.match(f.downloads[0].text,/计算机科学/);assert.match(f.downloads[0].text,/My existing project reasoning/);
});

test('explicit regeneration changes an untouched starting outline to the chosen computing direction',async()=>{
 const f=fixture();f.controller.render('essay-a',f.textarea.value);
 await f.controller.input({dataset:{writingField:'kind'},value:'SOP'} as any);
 await f.controller.input({dataset:{writingField:'area'},value:'ARTIFICIAL_INTELLIGENCE'} as any);
 await f.controller.action({dataset:{writingAction:'regenerate-outline'}} as any);
 const record=JSON.parse([...f.values.values()][0]);assert.equal(record.brief.area,'ARTIFICIAL_INTELLIGENCE');
 const questions=record.brief.sections.map((s:any)=>s.question).join(' ');assert.match(questions,/基线|数据划分|模型评估/);assert.doesNotMatch(questions,/具体金融问题/);
 assert.equal(f.bodyWrites(),0);
});
