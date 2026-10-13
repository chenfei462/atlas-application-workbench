import type {Snapshot} from './repositories.js';
import {escapeHtml,labelFor} from './forms.js';
import {buildWritingBrief,createWritingOutline,exportWritingMarkdown,parseWritingBrief,setWritingReviewCheck,WRITING_AREAS,writingArea,type WritingBrief,type ReviewCheckId,type WritingEvidence} from './essay-writing.js';
import {WritingBriefStorage,type WritingRecord} from './essay-writing-storage.js';
import {renderWritingPanel,renderWritingChecks,renderWritingMethod,type WritingViewContext} from './essay-writing-view.js';

type WritingControl=HTMLElement&{value:string;checked:boolean};
type Dependencies={storage:Pick<Storage,'getItem'|'setItem'>;document:Pick<Document,'querySelector'|'activeElement'>;getSnapshot:()=>Snapshot;getOwner:()=>string|null;download:(text:string,name:string)=>void;associate:(essayId:string,evidenceIds:string[])=>Promise<void>;notify:(text:string)=>void};
type WorkingState={ownerId:string;essayId:string;brief:WritingBrief;revision:string|null;status:string;blocked:boolean;tail:Promise<void>;invalid:Map<string,{value:string;message:string}>};

/** Browser-local writing notes. This controller never writes or replaces essay prose. */
export class EssayWritingController{
 private active:WorkingState|null=null;
 private states=new Map<string,WorkingState>();
 constructor(private deps:Dependencies){}
 resetSession(){this.active=null;this.states.clear();}
 private key(ownerId:string,essayId:string){return `${ownerId}:${essayId}`;}
 private isLive(state:WorkingState){return this.states.get(this.key(state.ownerId,state.essayId))===state&&this.deps.getOwner()===state.ownerId;}
 private isCurrent(state:WorkingState){return this.active===state&&this.deps.getOwner()===state.ownerId;}
 private facts(state:WorkingState):WritingEvidence[]{return (this.deps.getSnapshot().evidence_items??[]).filter(f=>f.owner_id===state.ownerId);}
 private body(state:WorkingState){const textarea=this.deps.document.querySelector<HTMLTextAreaElement>('#essayContent');return textarea?.dataset.essay===state.essayId?textarea.value:'';}
 private context(state:WorkingState,content=this.body(state)):WritingViewContext{
  const snapshot=this.deps.getSnapshot();const essay=snapshot.essays?.find(e=>e.id===state.essayId&&e.owner_id===state.ownerId);
  const versions=(snapshot.essay_versions??[]).filter(v=>v.owner_id===state.ownerId&&v.essay_id===state.essayId);
  const current=versions.find(v=>v.version_number===essay?.current_version_number);
  const application=snapshot.applications?.find(item=>item.id===essay?.application_id&&item.owner_id===state.ownerId);
  const program=snapshot.programs?.find(item=>item.id===(essay?.program_id??application?.program_id)&&item.owner_id===state.ownerId);
  return {ownerId:state.ownerId,essayId:state.essayId,title:program?`${program.program_name} · ${essay?.type??'文书'}`:essay?labelFor('essays',essay as unknown as Record<string,unknown>,snapshot):'文书',content,currentVersionId:current?.id??null,currentVersionNumber:essay?.current_version_number??null,isUnsaved:!current||content!==current.content,snapshot,storageStatus:this.stateStatus(state)};
 }
 render(essayId:string,content:string):string{
  const ownerId=this.deps.getOwner();if(!ownerId)return '';const key=this.key(ownerId,essayId);
  let state=this.states.get(key);
  if(!state){
   const brief=buildWritingBrief(this.deps.getSnapshot(),essayId,ownerId);
   state={ownerId,essayId,brief,revision:null,status:'写作简报仅保存在此浏览器；数据库备份不包含它，请单独导出。',blocked:false,tail:Promise.resolve(),invalid:new Map()};
   try{const record=new WritingBriefStorage(this.deps.storage,ownerId).read(essayId);if(record){state.brief=record.brief;state.revision=record.revision;}}
   catch{state.blocked=true;state.status='写作简报读取失败或已损坏；原数据保留。当前工作笔记可单独导出，请先保留副本。';}
   this.states.set(key,state);
  }
  this.active=state;
  return `<div id="essayWritingPanel" data-writing-essay="${escapeHtml(essayId)}">${this.panelContents(state,content)}</div>`;
 }
 private stateStatus(state:WorkingState){return state.invalid.size?`${state.invalid.size} 项输入未保存：${[...state.invalid.values()].map(item=>item.message).join('；')}。导出将保留未通过校验的输入，请核对。${state.blocked?'浏览器简报写入已阻止。':''}`:state.status;}
 private pendingInputs(state:WorkingState){return state.invalid.size?`<details open class="writing-pending"><summary>尚未通过校验的原始输入（${state.invalid.size} 项）</summary><p>字段保留上次有效值。以下输入尚未保存，请修正对应字段；也可以先导出保留。</p><pre class="atlas-essay-history">${escapeHtml(JSON.stringify(Object.fromEntries(state.invalid),null,2))}</pre></details>`:'';}
 private panelContents(state:WorkingState,content=this.body(state)){return renderWritingPanel(state.brief,this.context(state,content))+`<div id="writingUnvalidatedInputs">${this.pendingInputs(state)}</div>`;}
 private status(state:WorkingState){if(this.isCurrent(state)){const target=this.deps.document.querySelector('#writingStorageStatus');if(target)target.textContent=this.stateStatus(state);const pending=this.deps.document.querySelector('#writingUnvalidatedInputs');if(pending)pending.innerHTML=this.pendingInputs(state);}}
 refreshChecks(){
  const state=this.active;if(!state||!this.isCurrent(state))return;const checks=this.deps.document.querySelector('#writingChecks');
  if(checks){const focused=this.deps.document.activeElement as HTMLElement|null;const reviewKey=focused?.dataset.reviewKey&&checks.contains(focused)?focused.dataset.reviewKey:null;
   const closed=[...checks.querySelectorAll<HTMLDetailsElement>('details:not([open])')].map(item=>item.className);
   checks.innerHTML=renderWritingChecks(state.brief,this.context(state));
   for(const item of checks.querySelectorAll<HTMLDetailsElement>('details'))if(closed.includes(item.className))item.open=false;
   if(reviewKey)checks.querySelector<HTMLElement>(`[data-review-key="${reviewKey}"]`)?.focus();
  }
  const available=new Set(this.facts(state).map(f=>f.id));const selected=new Set(state.brief.sections.flatMap(s=>s.evidenceIds).filter(id=>available.has(id)));
  const button=this.deps.document.querySelector<HTMLButtonElement>('[data-writing-action="associate-evidence"]');if(button)button.disabled=!selected.size;
  const summary=this.deps.document.querySelector('.writing-associations > summary');if(summary)summary.textContent=`文书事实关联 · 已选 ${selected.size} 项`;
  for(const section of state.brief.sections){const count=section.evidenceIds.filter(id=>available.has(id)).length;const selectorId=section.id.replace(/[^\w-]/gu,char=>`\\${char.codePointAt(0)!.toString(16)} `);const heading=this.deps.document.querySelector(`.writing-section[data-writing-section="${selectorId}"] .writing-facts > summary`);if(heading)heading.textContent=`选择本节事实（${count} 项）`;}
  const kind=this.deps.document.querySelector('.writing-brief > summary');if(kind)kind.textContent=`写作简报 · ${WRITING_AREAS.find(area=>area.id===writingArea(state.brief))!.label} / ${{PS:'Personal Statement',SOP:'Statement of Purpose',SHORT_ANSWER:'短题回答'}[state.brief.kind]} / ${state.brief.language==='en'?'英文':'中文'}`;
  this.status(state);
 }
 private refreshPanel(state:WorkingState){
  if(!this.isCurrent(state))return;const panel=this.deps.document.querySelector('#essayWritingPanel');if(!panel)return;
  const detailKey=(item:HTMLDetailsElement)=>`${item.className}:${item.closest<HTMLElement>('[data-writing-section]')?.dataset.writingSection??''}`;
  const open=new Set([...panel.querySelectorAll<HTMLDetailsElement>('details[open]')].map(detailKey));
  panel.innerHTML=this.panelContents(state);
  for(const item of panel.querySelectorAll<HTMLDetailsElement>('details'))if(open.has(detailKey(item)))item.open=true;
 }
 private persist(state:WorkingState):Promise<void>{
  const brief=structuredClone(state.brief);
  state.tail=state.tail.then(async()=>{
   if(!this.isLive(state))return;
   if(state.blocked){state.status='写作简报未保存：浏览器存储已阻止写入。工作笔记仍在当前页面，请先导出保留，重新加载页面后核对存储。';this.status(state);return;}
   try{const record:WritingRecord=await new WritingBriefStorage(this.deps.storage,state.ownerId).write(state.essayId,brief,state.revision,()=>this.isLive(state));if(!this.isLive(state))return;state.revision=record.revision;state.status='写作简报已保存在此浏览器；请单独导出备份。';}
   catch(error){state.blocked=true;state.status=`写作简报未保存：${error instanceof Error?error.message:'浏览器存储失败'}。工作笔记仍在当前页面，可导出保留。`;}
   this.status(state);
  });return state.tail;
 }
 async input(target:WritingControl):Promise<boolean>{
  if(!target.dataset.writingField&&!target.dataset.sectionField&&!target.dataset.evidenceId&&!target.dataset.reviewKey)return false;
  const state=this.active;if(!state||!this.isCurrent(state))return true;
  if(target.dataset.reviewKey&&state.invalid.size){target.checked=false;this.deps.notify('请先修正未通过校验的简报输入，再确认审稿项。');return true;}
  const controlKey=target.dataset.writingField??`${target.dataset.sectionId??''}:${target.dataset.sectionField??target.dataset.evidenceId??target.dataset.reviewKey??''}`;
  try{
   const next=structuredClone(state.brief);const field=target.dataset.writingField;
   const numberValue=()=>target.value.trim()===''?null:Number(target.value);
   if(field){if(!['area','kind','language','prompt','promptUrl','checkedOn','wordLimit','characterLimit','countConvention'].includes(field))return true;Object.assign(next,{[field]:['wordLimit','characterLimit'].includes(field)?numberValue():target.value});}
   if(target.dataset.sectionId){const section=next.sections.find(s=>s.id===target.dataset.sectionId);if(!section)return true;
    if(target.dataset.sectionField){const sectionField=target.dataset.sectionField;if(!['title','question','notes','budget','sourceUrl'].includes(sectionField))return true;Object.assign(section,{[sectionField]:sectionField==='budget'?numberValue():target.value});}
    if(target.dataset.evidenceId){const id=target.dataset.evidenceId;if(!this.facts(state).some(f=>f.id===id))throw Error('此经历不属于当前账号。');section.evidenceIds=target.checked?[...new Set([...section.evidenceIds,id])]:section.evidenceIds.filter(value=>value!==id);}
   }
   state.brief=target.dataset.reviewKey?setWritingReviewCheck(next,this.body(state),this.facts(state),state.ownerId,target.dataset.reviewKey as ReviewCheckId,target.checked):parseWritingBrief(next);
   state.invalid.delete(controlKey);state.status='正在保存写作简报…';this.refreshChecks();
   if(field==='area'){const method=this.deps.document.querySelector('#writingMethod');if(method){const open=method.querySelector('details')?.open??false;method.innerHTML=renderWritingMethod(state.brief);const details=method.querySelector('details');if(details)details.open=open;}}
   await this.persist(state);
  }catch(error){const message=error instanceof Error?error.message:'请检查输入';state.invalid.set(controlKey,{value:target.value??'',message});state.status=`此项未保存：${message}。`;this.status(state);}
  return true;
 }
 async action(target:HTMLElement):Promise<boolean>{
  const action=target.dataset.writingAction;if(!action)return false;const state=this.active;if(!state||!this.isCurrent(state))return true;
  await state.tail;if(!this.isCurrent(state))return true;
  try{
   if(action==='export-full'||action==='export-brief'){
    const context=this.context(state);let text=exportWritingMarkdown({brief:state.brief,body:context.content,evidence:this.facts(state),ownerId:state.ownerId,programLabel:context.title,versionLabel:context.isUnsaved?'未保存草稿':`数据库 v${context.currentVersionNumber??0}`,mode:action==='export-full'?'DRAFT_WITH_BRIEF':'BRIEF_ONLY'});
    if(state.blocked)text+='\n保存提醒：本轮简报未成功写入浏览器存储，此文件保留当前页面的工作笔记。\n';
    if(state.invalid.size){const raw=JSON.stringify(Object.fromEntries(state.invalid),null,2);const fence='`'.repeat(Math.max(3,...(raw.match(/`+/g)??[]).map(run=>run.length+1)));text+=`\n## 尚未通过校验的输入\n\n简报字段保留上次有效值。以下原始输入未保存，请核对后重新填写。\n\n${fence}json\n${raw}\n${fence}\n`;}
    this.deps.download(text,`atlas-writing-${state.essayId.slice(0,8)}-${action==='export-full'?'draft':'brief'}.md`);this.deps.notify('写作材料已导出，请保留在自己的备份目录。');return true;
   }
   if(action==='associate-evidence'){const ids=[...new Set(state.brief.sections.flatMap(s=>s.evidenceIds))];if(!ids.length){this.deps.notify('先在提纲中选择真实经历。');return true;}if(ids.some(id=>!this.facts(state).some(f=>f.id===id)))throw Error('所选经历已不可用，请先核对。');await this.deps.associate(state.essayId,ids);return true;}
   if(state.invalid.size){this.deps.notify('有输入尚未通过校验，请先修正或导出原始输入，再调整提纲与审稿项。');return true;}
   const next=structuredClone(state.brief);const index=next.sections.findIndex(s=>s.id===target.dataset.sectionId);
   if(action==='add-section')next.sections.push({id:crypto.randomUUID(),title:'自定义段落',question:'这一段回答题目的哪一部分？哪些事实支撑它？',notes:'',budget:null,evidenceIds:[],sourceUrl:''});
   else if(action==='remove-section'&&index>=0)next.sections.splice(index,1);
   else if((action==='move-section-up'||action==='move-section-down')&&index>=0){const other=index+(action==='move-section-up'?-1:1);if(other>=0&&other<next.sections.length)[next.sections[index],next.sections[other]]=[next.sections[other],next.sections[index]];}
   else if(action==='regenerate-outline'){const pristine=WRITING_AREAS.some(area=>['PS','SOP','SHORT_ANSWER'].some(kind=>JSON.stringify(next.sections)===JSON.stringify(createWritingOutline(kind as WritingBrief['kind'],area.id))));if(!pristine){this.deps.notify('提纲已有修改，请先导出并逐段编辑；自定义标题、问题、预算、顺序和笔记不会被覆盖。');return true;}next.sections=createWritingOutline(next.kind,writingArea(next));}
   else if(action==='clear-review')next.review={basis:null,checks:[]};
   else if(action==='confirm-review'){this.deps.notify('请逐项阅读并勾选审稿清单；确认项绑定当前正文与事实。');return true;}
   else return true;
   state.brief=parseWritingBrief(next);await this.persist(state);this.refreshPanel(state);
  }catch(error){this.deps.notify(error instanceof Error?error.message:'写作操作失败');}
  return true;
 }
}
