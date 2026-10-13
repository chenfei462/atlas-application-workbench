import type {Snapshot} from './repositories.js';

export type WritingKind='PS'|'SOP'|'SHORT_ANSWER';
export type WritingArea='GENERAL'|'FINANCE_FINTECH'|'COMPUTER_SCIENCE'|'SOFTWARE_ENGINEERING'|'DATA_SCIENCE'|'ARTIFICIAL_INTELLIGENCE';
export type WritingLanguage='en'|'zh';
export type CountConvention='INCLUDING_SPACES'|'EXCLUDING_SPACES'|'UNKNOWN';
export type ReviewCheckId='PROMPT'|'CONTRIBUTION'|'FACTS'|'PROGRAM_FIT'|'CV_CONSISTENCY'|'VOICE'|'FORMAT';
export type WritingSection={id:string;title:string;question:string;notes:string;budget:number|null;evidenceIds:string[];sourceUrl:string};
export type WritingBrief={kind:WritingKind;area?:WritingArea;language:WritingLanguage;prompt:string;promptUrl:string;checkedOn:string;wordLimit:number|null;characterLimit:number|null;countConvention:CountConvention;sections:WritingSection[];review:{basis:string|null;checks:ReviewCheckId[]}};
export type EssayWritingBrief=WritingBrief;
export type WritingEvidence={id:string;owner_id:string;title:string;role?:string|null;organization?:string|null;description?:string|null;start_date?:string|null;end_date?:string|null;responsibilities?:string[];achievements?:string[];metrics?:string[];skills?:string[];technologies?:string[];notes?:string|null;verified:boolean};
export type WritingCounts={words:number;characters:number;charactersWithoutWhitespace:number;countedCharacters:number|null};
export type WritingIssue={code:string;status:'warning'|'review'|'info';message:string;sectionId?:string};
export const WRITING_AREAS:readonly {id:WritingArea;label:string}[]=[
 {id:'GENERAL',label:'通用'},
 {id:'FINANCE_FINTECH',label:'金融与金融科技'},
 {id:'COMPUTER_SCIENCE',label:'计算机科学'},
 {id:'SOFTWARE_ENGINEERING',label:'软件工程'},
 {id:'DATA_SCIENCE',label:'数据科学'},
 {id:'ARTIFICIAL_INTELLIGENCE',label:'人工智能'},
];
// Existing briefs predate the selector and retain their original finance context.
export function writingArea(brief:Pick<WritingBrief,'area'>):WritingArea{return brief.area??'FINANCE_FINTECH';}
export const MANUAL_REVIEW_CHECKS:readonly {id:ReviewCheckId;label:string}[]=[
 {id:'PROMPT',label:'逐项回答学校题目'},
 {id:'CONTRIBUTION',label:'个人贡献与团队成果边界准确'},
 {id:'FACTS',label:'数字、职责与成果符合事实依据'},
 {id:'PROGRAM_FIT',label:'项目特色与学习目标有来源支撑'},
 {id:'CV_CONSISTENCY',label:'与简历及其他申请材料一致'},
 {id:'VOICE',label:'语言自然，保留个人声音'},
 {id:'FORMAT',label:'字数、格式及学校使用规则已核对'},
];

export function safeWritingUrl(value:string):string|null{
 if(typeof value!=='string'||Array.from(value).some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127))return null;
 try{const url=new URL(value.trim());return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}
}

export function createWritingOutline(kind:WritingKind,area:WritingArea='FINANCE_FINTECH'):WritingSection[]{
 const descriptions=kind==='SHORT_ANSWER'?[
  ['direct-response','直接回应','先用一两句话回答题目，说明你的判断或选择。'],
  ['experience','具体依据','哪些真实行动、结果或反思支持回答？区分你与团队的贡献。'],
  ['implications','意义与下一步','这段经历对你的学习、风险认识或未来行动意味着什么？'],
 ]:[
  ['motivation','动机与问题',kind==='SOP'?'你希望学习或解决什么具体金融问题？为何需要研究生训练？':'哪段真实经历改变了你的兴趣或选择？用具体问题说明动机。'],
  ['preparation','学术与技能准备','哪些课程、量化方法、金融理解或编程技能证明准备？还有什么学习缺口？'],
  ['experience','行动、结果与反思','选一段真实经历：问题是什么、你作出什么决定、结果如何？模型或系统有哪些局限和风险？'],
  ['program-fit','项目契合','本项目的具体课程或训练机会如何补足你的学习缺口？记录该项目官方来源，不编造课程。'],
  ['goals','学习与未来目标','短中期目标是什么？如何运用所学，并考虑风险、责任与实际约束？'],
 ];
 // These are editable revision questions, not a school's mandatory structure.
 if(area!=='FINANCE_FINTECH'){
  const context:Record<Exclude<WritingArea,'FINANCE_FINTECH'>,{motivation:string;personal:string;preparation:string;experience:string;implications:string}>={
   GENERAL:{motivation:'你希望学习或解决什么具体问题？为什么需要这个阶段的研究生训练？',personal:'哪段真实经历影响了你的学习方向或选择？说明具体情境与反思。',preparation:'哪些课程、技能或经历支持你申请这个项目？还有什么学习缺口？',experience:'选择一段真实经历：问题是什么、你作出了什么选择、结果与局限是什么？区分个人贡献与团队成果。',implications:'这些证据如何支持你的回答？它们带来什么认识和下一步学习目标？'},
   COMPUTER_SCIENCE:{motivation:'计算机科学中的哪类算法、系统或理论问题吸引你？什么学习缺口需要研究生训练？',personal:'哪段真实的计算机学习或实践经历改变了你的兴趣？说明遇到的问题与个人反思。',preparation:'算法与数据结构、系统、离散数学或理论基础中的哪些真实学习经历说明准备？哪些方面仍需深入？',experience:'面对算法或系统约束，你比较了哪些设计选择？如何评估复杂度、性能与正确性，结果、失败和局限是什么？只写本人实际完成的工作。',implications:'算法、系统或理论方面的实践告诉你什么？下一步准备深入什么，而不是重复项目清单？'},
   SOFTWARE_ENGINEERING:{motivation:'什么需求、架构或软件可靠性问题让你希望继续学习软件工程？项目训练能补足什么缺口？',personal:'哪段真实的软件开发经历改变了你的工程判断？说明用户需求、团队情境和你的反思。',preparation:'软件设计、架构、测试与工程验证方面有哪些真实准备？如何理解可靠性、协作与维护成本？',experience:'从需求和约束出发，你如何选择架构并权衡方案？用什么测试或工程验证评估可靠性与可维护性，结果和局限是什么？区分个人设计与团队交付。',implications:'这次工程选择暴露了什么需求、测试或维护方面的学习缺口？下一步如何改进判断？'},
   DATA_SCIENCE:{motivation:'哪个数据问题或统计推断问题值得继续学习？研究生训练怎样帮助你作出更可靠的分析？',personal:'哪段真实的数据分析经历改变了你的认识？说明数据背后的问题与个人反思。',preparation:'概率统计、数据处理、建模或编程方面有哪些真实准备？你如何认识数据质量和推断的不确定性？',experience:'数据如何获得、清理与划分？你选择什么统计方法、基线（baseline）和评估指标，如何检查数据泄漏或偏差？结果及不确定性是什么？只陈述实际做过的评估。',implications:'数据质量、统计证据或基线比较改变了什么判断？还需补足哪些分析和验证能力？'},
   ARTIFICIAL_INTELLIGENCE:{motivation:'哪个人工智能问题或模型局限驱动你继续学习？需要补足怎样的数学、建模或评估能力？',personal:'哪段真实的人工智能学习或实践经历改变了你的判断？用具体情境说明兴趣与反思。',preparation:'数学、机器学习、编程或数据处理方面有哪些真实基础？你如何理解模型误差与泛化？',experience:'针对什么数据和任务，你为何选择这一模型？如何与基线（baseline）比较并评估误差、泛化和成本？模型、数据或评估有什么局限，隐私和偏差如何影响使用？不编造指标或实验。',implications:'模型和数据的失败或局限带来什么认识？下一步希望补足哪些训练、评估或负责任使用能力？'},
  };
  const questions=context[area];
  for(const description of descriptions){
   if(description[0]==='motivation')description[2]=kind==='SOP'?questions.motivation:questions.personal;
   if(description[0]==='preparation')description[2]=questions.preparation;
   if(description[0]==='experience')description[2]=questions.experience;
   if(description[0]==='implications')description[2]=questions.implications;
  }
 }
 return descriptions.map(([id,title,question])=>({id,title,question,notes:'',budget:null,evidenceIds:[],sourceUrl:''}));
}

function programmeWritingArea(name:string):WritingArea{
 // FinTech remains a finance context even when its name mentions AI or data.
 if(/\bfintech\b|\bfinanc(?:e|ial)\b|金融/iu.test(name))return 'FINANCE_FINTECH';
 if(/software[\s-]+engineering|软件工程/iu.test(name))return 'SOFTWARE_ENGINEERING';
 if(/data[\s-]+science|数据科学/iu.test(name))return 'DATA_SCIENCE';
 if(/artificial[\s-]+intelligence|machine[\s-]+learning|\bAI\b|人工智能|机器学习/iu.test(name))return 'ARTIFICIAL_INTELLIGENCE';
 if(/computer[\s-]+science|\bcomputing\b|计算机科学|计算机技术/iu.test(name))return 'COMPUTER_SCIENCE';
 return 'GENERAL';
}

export function buildWritingBrief(snapshot:Snapshot,essayId:string,ownerId:string):WritingBrief{
 const essay=snapshot.essays?.find(item=>item.id===essayId&&item.owner_id===ownerId);
 if(!essay)throw new Error('当前 owner 的文书不可用');
 const requirement=snapshot.program_essay_requirements?.find(item=>item.id===essay.program_essay_requirement_id&&item.owner_id===ownerId&&(!essay.program_id||item.program_id===essay.program_id));
 const source=snapshot.sources?.find(item=>item.id===requirement?.source_id&&item.owner_id===ownerId);
 const type=(requirement?.essay_type??essay.type).toUpperCase();
 const kind:WritingKind=/SHORT|短答/.test(type)?'SHORT_ANSWER':/SOP|ACADEMIC|PURPOSE/.test(type)?'SOP':'PS';
 const application=snapshot.applications?.find(item=>item.id===essay.application_id&&item.owner_id===ownerId);
 const program=snapshot.programs?.find(item=>item.id===(essay.program_id??application?.program_id)&&item.owner_id===ownerId);
 const area=programmeWritingArea(program?.program_name??'');
 const sections=createWritingOutline(kind,area);
 const available=new Set((snapshot.evidence_items??[]).filter(item=>item.owner_id===ownerId).map(item=>item.id));
 const evidenceIds=[...new Set((snapshot.essay_evidence_items??[]).filter(item=>item.essay_id===essay.id&&item.owner_id===ownerId&&available.has(item.evidence_item_id)).map(item=>item.evidence_item_id))];
 sections.find(section=>section.id==='experience')!.evidenceIds=evidenceIds;
 const date=source?.verified_at?.slice(0,10)??'';
 return {kind,area,language:'en',prompt:requirement?.prompt?.trim()?requirement.prompt:essay.prompt??'',promptUrl:safeWritingUrl(source?.url??'')??'',checkedOn:validDate(date)?date:'',wordLimit:requirement?.word_limit??essay.word_limit??null,characterLimit:requirement?.character_limit??null,countConvention:'UNKNOWN',sections,review:{basis:null,checks:[]}};
}

function object(value:unknown,name:string):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(`${name} 格式无效`);return value as Record<string,unknown>;}
function text(value:unknown,name:string,maximum=30000):string{if(typeof value!=='string'||value.length>maximum)throw new Error(`${name} 文本无效或过长`);return value;}
function limit(value:unknown,name:string):number|null{if(value===null)return null;if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1||value>500000)throw new Error(`${name} 上限必须是正整数或空值`);return value;}
function validDate(value:string):boolean{return value===''||(/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(`${value}T00:00:00Z`))&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value);}
function urlField(value:unknown):string{const raw=text(value,'URL',4000);if(raw!==''&&!safeWritingUrl(raw))throw new Error('来源 URL 地址必须是无账号密码的 HTTP(S) 地址');return raw;}

export function parseWritingBrief(value:unknown):WritingBrief{
 const b=object(value,'写作简报');
 if(!['PS','SOP','SHORT_ANSWER'].includes(String(b.kind)))throw new Error('文书类型无效');
 const area=b.area===undefined?'FINANCE_FINTECH':b.area;if(typeof area!=='string'||!WRITING_AREAS.some(item=>item.id===area))throw new Error('写作 area 方向无效');
 if(!['en','zh'].includes(String(b.language)))throw new Error('写作语言无效');
 if(!['INCLUDING_SPACES','EXCLUDING_SPACES','UNKNOWN'].includes(String(b.countConvention)))throw new Error('字符计数规则无效');
 const checkedOn=text(b.checkedOn,'核验日期',10);if(!validDate(checkedOn))throw new Error('核验日期无效');
 if(!Array.isArray(b.sections)||b.sections.length>40)throw new Error('提纲 section 段落无效或过多');
 const ids=new Set<string>();
 const sections=b.sections.map(value=>{
  const section=object(value,'提纲段落');const id=text(section.id,'section ID',200);if(!id.trim()||ids.has(id))throw new Error('提纲 section 段落 ID 必须唯一');ids.add(id);
  if(!Array.isArray(section.evidenceIds)||section.evidenceIds.length>200)throw new Error('事实 ID 列表无效');
  const evidenceIds=section.evidenceIds.map(value=>text(value,'事实 ID',200));if(evidenceIds.some(id=>!id.trim())||new Set(evidenceIds).size!==evidenceIds.length)throw new Error('事实 ID 不得为空或重复');
  return {id,title:text(section.title,'段落标题',300),question:text(section.question,'段落问题',2000),notes:text(section.notes,'提纲要点'),budget:limit(section.budget,'段落字数'),evidenceIds,sourceUrl:urlField(section.sourceUrl)};
 });
 const review=object(b.review,'review 核查');if(review.basis!==null&&typeof review.basis!=='string')throw new Error('review 核查基准无效');
 if(typeof review.basis==='string'&&review.basis.length>1500000)throw new Error('review 核查基准过长');
 if(!Array.isArray(review.checks)||review.checks.some(id=>!MANUAL_REVIEW_CHECKS.some(check=>check.id===id))||new Set(review.checks).size!==review.checks.length)throw new Error('review 核查项目无效');
 return {kind:b.kind as WritingKind,area:area as WritingArea,language:b.language as WritingLanguage,prompt:text(b.prompt,'学校题目'),promptUrl:urlField(b.promptUrl),checkedOn,wordLimit:limit(b.wordLimit,'字数'),characterLimit:limit(b.characterLimit,'字符'),countConvention:b.countConvention as CountConvention,sections,review:{basis:review.basis as string|null,checks:[...review.checks] as ReviewCheckId[]}};
}

export function countWritingDraft(body:string,convention:CountConvention='UNKNOWN'):WritingCounts{
 // A local estimate of Latin words/numbers; CJK text is measured separately.
 const words=(body.match(/[\p{Script=Latin}\d]+(?:['’-][\p{Script=Latin}\d]+)*/gu)??[]).length;
 const characters=Array.from(body).length;
 const charactersWithoutWhitespace=Array.from(body.replace(/\s/gu,'')).length;
 return {words,characters,charactersWithoutWhitespace,countedCharacters:convention==='INCLUDING_SPACES'?characters:convention==='EXCLUDING_SPACES'?charactersWithoutWhitespace:null};
}

function selectedIds(brief:WritingBrief):string[]{return [...new Set(brief.sections.flatMap(section=>section.evidenceIds))].sort();}
function selectedFacts(brief:WritingBrief,evidence:readonly WritingEvidence[],ownerId:string):WritingEvidence[]{const selected=new Set(selectedIds(brief));return evidence.filter(item=>item.owner_id===ownerId&&selected.has(item.id)).sort((a,b)=>a.id.localeCompare(b.id));}

export function inspectWritingDraft(body:string,brief:WritingBrief,evidence:readonly WritingEvidence[],ownerId:string):WritingIssue[]{
 const issues:WritingIssue[]=[];const add=(code:string,status:WritingIssue['status'],message:string,sectionId?:string)=>issues.push({code,status,message,...(sectionId?{sectionId}:{})});
 const counts=countWritingDraft(body,brief.countConvention);
 if(!brief.prompt.trim())add('PROMPT_MISSING','warning','学校题目未填写；请先核对实际申请题目，再逐项回应。');
 if(!brief.promptUrl||!safeWritingUrl(brief.promptUrl)||!brief.checkedOn)add('PROMPT_SOURCE','review','题目来源或核验日期未完整记录，请按当前项目官方要求核对。');
 if(brief.wordLimit===null&&brief.characterLimit===null)add('LIMIT_UNKNOWN','info','字数和字符上限未知，请在学校申请入口确认；未知不代表无限制。');
 if(brief.wordLimit!==null&&counts.words>brief.wordLimit)add('WORD_LIMIT','warning',`本地英文词数估计 ${counts.words}，超过填写的 ${brief.wordLimit} 词上限；提交入口计数优先。`);
 if(brief.characterLimit!==null){
  if(counts.countedCharacters===null){add('COUNT_CONVENTION','review','字符上限已填写，但是否计空格/换行尚未确认，请核对入口计数规则。');if(counts.charactersWithoutWhitespace>brief.characterLimit)add('CHARACTER_LIMIT','warning',`不含空白仍有 ${counts.charactersWithoutWhitespace} 个 Unicode 字符，超过 ${brief.characterLimit} 字符上限。`);}
  else if(counts.countedCharacters>brief.characterLimit)add('CHARACTER_LIMIT','warning',`本地 Unicode 字符数 ${counts.countedCharacters}，超过 ${brief.characterLimit} 字符上限；提交入口计数优先。`);
 }
 if(!body.trim())add('BODY_EMPTY','info','正文尚为空；先整理题目、真实事实和提纲。');
 if(!brief.sections.length||brief.sections.every(section=>!section.notes.trim()))add('OUTLINE_EMPTY','review','提纲尚未写下具体要点；用真实行动、结果与反思组织内容。');
 const ids=selectedIds(brief);const facts=selectedFacts(brief,evidence,ownerId);
 if(!ids.length)add('EVIDENCE_MISSING','review','尚未选择事实依据；文书中的职责、成果和指标需要你核查。');
 ids.forEach(id=>{const fact=facts.find(item=>item.id===id);if(!fact)add('UNAVAILABLE_EVIDENCE','warning',`选中的事实 ${id} 在当前账号中不可用，请重新选择；不会读取其他账号事实。`);else if(!fact.verified)add('UNCONFIRMED_EVIDENCE','review',`“${fact.title}”尚未由你确认；确认标记也不代表外部核验。`);});
 brief.sections.filter(section=>section.id==='program-fit').forEach(section=>{if(!safeWritingUrl(section.sourceUrl))add('PROGRAM_FIT_SOURCE','review','项目契合段落缺少该项目课程或训练机会的来源，请核对具体主张。',section.id);});
 if(/world[ -]class|prestigious|ever since (?:i|my)|passionate|享誉|贵校|从小|自幼/iu.test(body))add('GENERIC_LANGUAGE','review','检测到可能空泛的表达；考虑用具体问题、行动和反思替换。此提示不判断写作质量。');
 if(/\d|百分之|第一|唯一/iu.test(body))add('NUMERICAL_CLAIMS','review','正文包含数字或排名表达，请核对口径、个人贡献和对应事实；本地规则不能证明其真实性。');
 const cjk=(body.match(/\p{Script=Han}/gu)??[]).length;
 if((brief.language==='en'&&cjk>=5)||(brief.language==='zh'&&counts.words>=5&&cjk===0))add('LANGUAGE_MISMATCH','review','正文可能与选择的写作语言不一致，请核对学校语言要求。');
 return issues;
}

export function writingReviewBasis(body:string,brief:WritingBrief,evidence:readonly WritingEvidence[],ownerId:string):string{
 const {review:ignoredReview,area:ignoredArea,...fields}=brief;void ignoredReview;void ignoredArea;
 // Retain exact canonical input instead of using a collision-prone small hash.
 const facts=selectedIds(brief).map(id=>{const f=selectedFacts(brief,evidence,ownerId).find(item=>item.id===id);return f?{id:f.id,title:f.title,role:f.role??null,organization:f.organization??null,description:f.description??null,start_date:f.start_date??null,end_date:f.end_date??null,responsibilities:f.responsibilities??[],achievements:f.achievements??[],metrics:f.metrics??[],skills:f.skills??[],technologies:f.technologies??[],notes:f.notes??null,verified:f.verified}:{id,unavailable:true};});
 return JSON.stringify({ownerId,body,brief:{...fields,area:writingArea(brief)},facts});
}

export function writingReviewState(body:string,brief:WritingBrief,evidence:readonly WritingEvidence[],ownerId:string):{current:boolean;checks:ReviewCheckId[];total:number}{
 const current=brief.review.basis===writingReviewBasis(body,brief,evidence,ownerId);return {current,checks:current?[...brief.review.checks]:[],total:MANUAL_REVIEW_CHECKS.length};
}

export function setWritingReviewCheck(brief:WritingBrief,body:string,evidence:readonly WritingEvidence[],ownerId:string,checkId:ReviewCheckId,checked:boolean):WritingBrief{
 if(!MANUAL_REVIEW_CHECKS.some(check=>check.id===checkId))throw new Error('人工核查项目无效');
 const copy=parseWritingBrief(brief);const basis=writingReviewBasis(body,copy,evidence,ownerId);const checks=new Set(copy.review.basis===basis?copy.review.checks:[]);if(checked)checks.add(checkId);else checks.delete(checkId);copy.review={basis,checks:MANUAL_REVIEW_CHECKS.map(check=>check.id).filter(id=>checks.has(id))};return copy;
}

function markdown(value:string):string{return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/[\\`*_{}[\]()#+!|]/g,'\\$&');}
function sourceLink(value:string):string{const safe=safeWritingUrl(value);return safe?`[来源](<${safe.replace(/</g,'%3C').replace(/>/g,'%3E')}>)`:'未记录有效来源';}

export function exportWritingMarkdown(input:{brief:WritingBrief;body:string;evidence:readonly WritingEvidence[];ownerId:string;programLabel?:string;versionLabel?:string;mode:'BRIEF_ONLY'|'DRAFT_WITH_BRIEF'}):string{
 const {brief,body,evidence,ownerId}=input;const counts=countWritingDraft(body,brief.countConvention);const review=writingReviewState(body,brief,evidence,ownerId);
 const lines=[`# ${markdown(input.programLabel??'申请文书')} · ${input.mode==='BRIEF_ONLY'?'写作简报':'草稿与写作简报'}`,'','此导出由本地写作工具整理；事实与学校要求须由申请者核对。','','## 写作简报','',`- 文书类型：${brief.kind}`,`- 写作方向：${WRITING_AREAS.find(area=>area.id===writingArea(brief))!.label}`,`- 写作语言：${brief.language==='en'?'English':'中文'}`,`- 题目：${markdown(brief.prompt||'尚未填写')}`,`- 题目来源：${sourceLink(brief.promptUrl)}`,`- 核验日期：${brief.checkedOn||'待核验'}`,`- 字数上限：${brief.wordLimit??'未知'}`,`- 字符上限：${brief.characterLimit??'未知'}`,`- 字符规则：${brief.countConvention==='INCLUDING_SPACES'?'包含空格与换行':brief.countConvention==='EXCLUDING_SPACES'?'不含空白':'待确认'}`,'','## 提纲',''];
 for(const s of brief.sections)lines.push(`### ${markdown(s.title||'未命名段落')}`,'',markdown(s.question),`要点：${markdown(s.notes||'尚未填写')}`,`预算：${s.budget??'未设置'}；事实 ID：${s.evidenceIds.map(markdown).join('、')||'未选择'}`,`项目事实来源：${sourceLink(s.sourceUrl)}`,'');
 lines.push('## 已选择的事实索引','');for(const f of selectedFacts(brief,evidence,ownerId))lines.push(`- ${markdown(f.id)} · ${markdown(f.title)} · ${f.verified?'用户已确认（非外部核验）':'待用户确认'}`,`  角色：${markdown(f.role??'未填写')}；事实：${markdown(f.description??'未填写')}`,`  成果：${markdown((f.achievements??[]).join('；')||'未填写')}；指标：${markdown((f.metrics??[]).join('；')||'未填写')}`);
 const available=new Set(selectedFacts(brief,evidence,ownerId).map(f=>f.id));for(const id of selectedIds(brief).filter(id=>!available.has(id)))lines.push(`- ${markdown(id)}：当前账号事实不可用，待重新核对`);
 lines.push('','## 人工核查','',review.current?'核查绑定当前正文与简报/事实。':'尚未核查当前正文，或旧核查已因正文/简报/事实变化失效。');for(const check of MANUAL_REVIEW_CHECKS)lines.push(`- [${review.checks.includes(check.id)?'x':' '}] ${check.label}`);
 if(input.mode==='DRAFT_WITH_BRIEF'){
  lines.push('','## 当前正文','',`状态：${markdown(input.versionLabel??'当前编辑器内容，保存状态未指定')}`,`本地英文词数估计：${counts.words}；Unicode 字符数（含空白）：${counts.characters}；不含空白：${counts.charactersWithoutWhitespace}。提交入口计数优先。`,'');
  // A code fence preserves exact prose while treating any pasted HTML/Markdown as text.
  const longest=Math.max(2,...(body.match(/`+/g)??[]).map(run=>run.length));const fence='`'.repeat(longest+1);lines.push(`${fence}text`,body,fence);
 }
 return `${lines.join('\n')}\n`;
}
