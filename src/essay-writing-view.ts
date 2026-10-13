import type {Snapshot} from './repositories.js';
import {escapeHtml as h} from './forms.js';
import {countWritingDraft,inspectWritingDraft,writingReviewState,MANUAL_REVIEW_CHECKS,WRITING_AREAS,safeWritingUrl,type WritingArea,type WritingBrief,type WritingSection,type WritingEvidence} from './essay-writing.js';
import {writingSources} from './essay-writing-sources.js';

export type WritingViewContext={
 ownerId:string;essayId:string;title:string;content:string;
 currentVersionId?:string|null;currentVersionNumber?:number|null;isUnsaved?:boolean;
 snapshot:Snapshot;storageStatus?:string;
};

const kinds=[['PS','Personal Statement'],['SOP','Statement of Purpose'],['SHORT_ANSWER','短题回答']] as const;
const languages=[['en','英文'],['zh','中文']] as const;
const conventions=[['UNKNOWN','尚未核验'],['INCLUDING_SPACES','包含空格与换行'],['EXCLUDING_SPACES','不含空白字符']] as const;
const sourceLevels:Record<string,string>={
 'official-requirement':'官方要求','official-guidance':'官方写作指导',
 'student-experience':'在读学生经验','self-reported-case':'本人自述案例','authorised-example':'授权公开示例',
};

function currentEvidence(context:WritingViewContext):WritingEvidence[]{return (context.snapshot.evidence_items??[]).filter(item=>item.owner_id===context.ownerId);}
function safeLink(url:string,label:string):string{
 const safe=safeWritingUrl(url);
 return safe?`<a href="${h(safe)}" target="_blank" rel="noopener noreferrer">${h(label)}</a>`:'<span class="writing-muted">尚未填写可访问的官方页面</span>';
}
function briefInput(field:string,label:string,value:unknown,type='text'):string{
 return `<label class="atlas-field">${h(label)}<input data-writing-field="${h(field)}" aria-label="${h(label)}" type="${h(type)}" value="${h(value)}"${type==='number'?' min="1" step="1" placeholder="尚未核验"':''}></label>`;
}
function briefSelect(field:string,label:string,value:string,options:readonly (readonly [string,string])[]):string{
 return `<label class="atlas-field">${h(label)}<select data-writing-field="${h(field)}" aria-label="${h(label)}">${options.map(([key,text])=>`<option value="${h(key)}"${key===value?' selected':''}>${h(text)}</option>`).join('')}</select></label>`;
}
function sectionField(section:WritingSection,field:'title'|'question'|'notes'|'budget'|'sourceUrl',label:string):string{
 const attrs=`data-section-id="${h(section.id)}" data-section-field="${field}" aria-label="${h(`${section.title||'提纲段落'}：${label}`)}"`;
 const value=section[field]??'';
 const control=field==='question'||field==='notes'?`<textarea ${attrs} rows="${field==='notes'?3:2}">${h(value)}</textarea>`:`<input ${attrs} type="${field==='budget'?'number':field==='sourceUrl'?'url':'text'}" value="${h(value)}"${field==='budget'?' min="1" step="1" placeholder="选填"':''}>`;
 return `<label class="atlas-field">${h(label)}${control}</label>`;
}
function evidenceMaterials(item:WritingEvidence,context:WritingViewContext):string{
 const ids=new Set((context.snapshot.evidence_material_links??[]).filter(link=>link.owner_id===context.ownerId&&link.evidence_item_id===item.id).map(link=>link.material_id));
 const materials=(context.snapshot.materials??[]).filter(material=>material.owner_id===context.ownerId&&ids.has(material.id));
 return materials.length?materials.map(material=>`${material.title}（${material.status}）`).join('、'):'暂无材料关联';
}
function renderEvidenceChoice(section:WritingSection,item:WritingEvidence,context:WritingViewContext):string{
 const selected=section.evidenceIds.includes(item.id);
 const details=[item.role?`角色：${item.role}`:'角色尚未填写',item.achievements?.length?`成果：${item.achievements.join('；')}`:'成果尚未填写',item.metrics?.length?`指标：${item.metrics.join('；')}`:'',`材料：${evidenceMaterials(item,context)}`].filter(Boolean);
 return `<article class="writing-evidence"><label class="writing-checkbox"><input type="checkbox" data-section-id="${h(section.id)}" data-evidence-id="${h(item.id)}" aria-label="${h(`${section.title||'提纲段落'}引用事实：${item.title}`)}"${selected?' checked':''}><span><strong>${h(item.title)}</strong><small>${item.verified?'已由用户确认':'待用户确认'}</small></span></label><p>${details.map(h).join('<br>')}</p></article>`;
}
function areaInfo(brief:WritingBrief):{id:WritingArea;label:string}{
 return WRITING_AREAS.find(area=>area.id===brief.area)??WRITING_AREAS.find(area=>area.id==='FINANCE_FINTECH')!;
}
const methodGuidance:Record<WritingArea,readonly string[]>={
 GENERAL:[
  '从与你申请相关的真实任务出发，说明你面对的问题、个人行动、可核实结果和反思。选择能回答题目的证据，不必套用某个专业的叙事。',
  '跨方向申请时，诚实解释可迁移能力、已有准备和知识缺口。说明你怎样检验兴趣，以及希望用研究生学习补足什么。',
 ],
 FINANCE_FINTECH:[
  '金融方向：用真实课程、练习或工作说明量化准备、经济与金融理解，以及对假设和风险的认识。',
  'FinTech 方向：再说明数据与编程如何作用于具体业务场景，考虑模型、系统和合规风险。没有金融项目时，诚实解释可迁移能力与知识缺口。',
 ],
 COMPUTER_SCIENCE:[
  '选择真实的算法、系统或理论问题：输入、约束和目标是什么？你为什么采用这一方法，又放弃了哪些方案？',
  '说明个人技术贡献及其边界。用实际完成的分析、实现、实验或证明支撑结果；有比较时交代基线（baseline）与评估条件，解释复杂度、正确性或系统限制。',
 ],
 SOFTWARE_ENGINEERING:[
  '从真实需求和工程约束说明架构取舍：为什么选这个接口、模块边界或交付方式？哪些方案被你评估或调整？',
  '用实际的工程验证说明个人技术贡献，如测试、缺陷定位、可维护性或部署验证。区分个人决策与团队实现，说明结果、剩余问题和下一次会怎样改。',
 ],
 DATA_SCIENCE:[
  '说明真实数据处理与统计判断：数据来源、质量、缺失值及样本偏差如何影响问题？你亲自做了哪些清理、探索或分析？',
  '如有预测实验，交代数据划分、泄漏防范、比较基线（baseline）和指标选择的理由。说明个人技术贡献，讨论不确定性、误差与结果适用范围。',
 ],
 ARTIFICIAL_INTELLIGENCE:[
  '从真实任务说明模型与数据选择。若做过训练，交代训练、验证和测试划分、比较基线（baseline），以及为何使用对应评估方式；没有训练经历时，准确说明实际使用或验证范围。',
  '说明个人技术贡献、评估证据和失败局限；按实际任务讨论泛化、误差、成本、隐私或偏差。调用模型、搭建系统与独立研究属于不同贡献，不将它们混写。',
 ],
};
export function renderWritingMethod(brief:WritingBrief):string{
 // Original revision prompts: never fill applicant facts or programme rules.
 const area=areaInfo(brief);const label=area.id==='FINANCE_FINTECH'?'金融 / FinTech':area.label;
 const facts=area.id==='FINANCE_FINTECH'
  ?'只写实际完成的课程和个人任务；不推测非金融背景已经掌握金融分析，不补造科研、成绩、收益或成果数字。'
  :'只写实际完成的课程和个人任务；不推测未做过的研究或尚未掌握的能力，不补造科研、论文、成绩或成果数字。';
 const frame='在[占位项：真实任务]中，我负责[占位项：本人行动与判断]，得到[占位项：可核实结果]，也发现[占位项：局限]。这让我需要补足[占位项：学习缺口]；[占位项：当届官网核验的本项目资源]可支持这一步学习，服务于[占位项：本人认可的目标]。';
 return `<details class="writing-method"><summary>${h(label)} · 怎样把经历写成论据</summary>
  <p>先逐项回应学校实际题目。PS 与 SOP 的名称不能代替实际题目；以下只帮助组织论据，不固定段数或结构。</p>
  <p><strong>真实问题 → 个人行动与判断 → 结果与局限 → 学习缺口 → 本项目资源 → 目标</strong></p>
  <ul>${methodGuidance[area.id].map(item=>`<li>${h(item)}</li>`).join('')}</ul>
  <p>${h(facts)}结果可以是有依据的产出，团队成果要分清本人贡献，并由你解释反思。</p>
  <p>跨方向申请时，把真实可迁移能力接到目标领域，诚实说明你已有的准备与知识缺口。本方法对授课型硕士不强制写研究计划；如学校题目要求，则按其要求准备，不虚构科研经历。</p>
  <p>项目匹配应核对当届官网的课程、前置条件和机会选择规则，记录来源，并解释它补什么能力、用于什么目标；机会不能写成保证。</p>
  <p><strong>原创占位框架 · 非成稿、非用户事实</strong></p><blockquote>${h(frame)}</blockquote>
  <p>删除空泛排名、称赞“贵校”和“热爱”等修饰，改写为具体问题、行动和学习用途。提交前替换或删除所有占位项，自己核对目标学校的 AI 与原创性规定，并确认每项事实、反思和计划。</p>
 </details>`;
}
function renderOutline(brief:WritingBrief,context:WritingViewContext):string{
 const evidence=currentEvidence(context);
 const sections=brief.sections.map((section,index)=>`<article class="atlas-record writing-section" data-writing-section="${h(section.id)}">
  <div class="writing-section-heading"><h4>${index+1}. ${h(section.title||'未命名段落')}</h4><div class="writing-toolbar">
   <button type="button" class="text-button" data-writing-action="move-section-up" data-section-id="${h(section.id)}" aria-label="${h(`上移段落：${section.title}`)}"${index===0?' disabled':''}>上移</button>
   <button type="button" class="text-button" data-writing-action="move-section-down" data-section-id="${h(section.id)}" aria-label="${h(`下移段落：${section.title}`)}"${index===brief.sections.length-1?' disabled':''}>下移</button>
   <button type="button" class="text-button" data-writing-action="remove-section" data-section-id="${h(section.id)}" aria-label="${h(`删除段落：${section.title}`)}">删除段落</button>
  </div></div>
  <div class="atlas-fields">${sectionField(section,'title','段落标题')}${sectionField(section,'budget','本节英文词数预算（选填）')}</div>
  ${sectionField(section,'question','本节回应的问题')}${sectionField(section,'notes','准备写入的要点与反思')}
  ${sectionField(section,'sourceUrl','项目主张的来源链接（选填）')}
  <p class="writing-source-link">${safeLink(section.sourceUrl,'查看本节来源')}</p>
  <details class="writing-facts"><summary>选择本节事实（${section.evidenceIds.filter(id=>evidence.some(item=>item.id===id)).length} 项）</summary><fieldset><legend>从我的画像选择相关经历</legend><p>勾选用于组织提纲；关联到文书需要下方明确操作。确认标记来自用户，并非外部验证。</p>${evidence.map(item=>renderEvidenceChoice(section,item,context)).join('')||'<p class="atlas-empty">当前账号还没有经历证据。先在“我的画像”记录真实经历。</p>'}</fieldset></details>
 </article>`).join('');
 return `<details class="writing-outline"><summary>可编辑提纲 · ${brief.sections.length} 个段落</summary><p>围绕题目组织思路；标题、顺序和段数均可修改。操作不会改写正文。</p>${sections||'<p class="atlas-empty">提纲为空，可添加段落或使用起始结构。</p>'}<div class="writing-toolbar"><button type="button" class="outline-button" data-writing-action="add-section">添加段落</button><button type="button" class="outline-button" data-writing-action="regenerate-outline">按当前文书类型与申请方向重新生成提纲</button></div><p class="writing-muted">仅未修改的起始提纲可重建；已有修改会保留，请逐段编辑。正文保持原样。</p></details>`;
}
function renderAssociations(brief:WritingBrief,context:WritingViewContext):string{
 const evidence=currentEvidence(context);const byId=new Map(evidence.map(item=>[item.id,item]));
 const selected=new Set(brief.sections.flatMap(section=>section.evidenceIds).filter(id=>byId.has(id)));
 const existing=(context.snapshot.essay_evidence_items??[]).filter(link=>link.owner_id===context.ownerId&&link.essay_id===context.essayId&&byId.has(link.evidence_item_id));
 const versionLinks=(context.snapshot.essay_evidence_links??[]).filter(link=>link.owner_id===context.ownerId&&!!context.currentVersionId&&link.essay_version_id===context.currentVersionId&&byId.has(link.evidence_item_id));
 return `<details class="writing-associations"><summary>文书事实关联 · 已选 ${selected.size} 项</summary>
  <p>已关联当前文书：${existing.length?existing.map(link=>h(byId.get(link.evidence_item_id)!.title)).join('、'):'暂无'}</p>
  <button type="button" class="outline-button" data-writing-action="associate-evidence"${selected.size?'':' disabled'}>将所选事实关联到当前文书</button>
  <p>当前版本 ${context.currentVersionNumber?`v${h(context.currentVersionNumber)}`:'尚未保存'} 的事实依据：</p>
  ${versionLinks.length?`<ul>${versionLinks.map(link=>`<li>${h(byId.get(link.evidence_item_id)!.title)}${link.claim_note?` — ${h(link.claim_note)}`:''}</li>`).join('')}</ul>`:'<p class="writing-muted">当前版本尚无事实依据关联。</p>'}
  <p class="writing-muted">新版本不会自动继承事实依据。版本关联仍需通过下方“文书版本事实依据”明确记录；材料关联只表示存在佐证线索，不验证内容真实性。</p>
 </details>`;
}
function renderSources():string{
 const cards=writingSources.map(source=>`<article class="atlas-record writing-source-card"><span class="task-tag">${h(sourceLevels[source.level]??'公开来源')}</span><h4>${safeLink(source.url,source.title)}</h4><p>${h(source.summary)}</p><p><small>适用范围：${h(source.scope)}<br>查阅日期：${h(source.checkedOn)}</small></p></article>`).join('');
 return `<details class="writing-sources"><summary>官方要求与公开案例</summary><p>当前项目题目优先。案例用于观察组织方式与表达，不能证明录取原因；学校、学位类型和入学年度必须分别核对。这里展示不同项目的参考，不会自动带入其他项目的题目或字数限制。</p><div class="atlas-grid">${cards}</div></details>`;
}

export function renderWritingPanel(brief:WritingBrief,context:WritingViewContext):string{
 return `<div class="writing-workspace">
  <div class="writing-section-heading"><div><span class="eyebrow">WRITING BRIEF</span><h3>为 ${h(context.title)} 准备写作</h3></div><div class="writing-toolbar"><button type="button" class="outline-button" data-writing-action="export-full">导出当前正文与简报</button><button type="button" class="outline-button" data-writing-action="export-brief">仅导出简报</button></div></div>
  <p class="writing-local-note">写作简报保存在当前浏览器，按账号与文书分开；数据库 JSON 和数据库备份不包含这份简报。导出可单独保留它。${context.isUnsaved?'正文导出将包含当前未保存草稿。':'正文导出使用当前编辑器内容。'}</p>
  <span id="writingStorageStatus" role="status" aria-live="polite">${h(context.storageStatus??'编辑后自动保留本地简报')}</span>
  <details class="writing-brief"><summary id="writingBriefSummary">写作简报 · ${h(areaInfo(brief).label)} / ${h(kinds.find(([key])=>key===brief.kind)?.[1]??brief.kind)} / ${brief.language==='en'?'英文':'中文'}</summary>
   <div class="atlas-fields">${briefSelect('area','申请方向',areaInfo(brief).id,WRITING_AREAS.map(area=>[area.id,area.label] as const))}${briefSelect('kind','文书类型',brief.kind,kinds)}${briefSelect('language','正文语言',brief.language,languages)}${briefInput('wordLimit','官方英文词数上限（words）',brief.wordLimit,'number')}${briefInput('characterLimit','官方字符数上限（characters）',brief.characterLimit,'number')}${briefSelect('countConvention','申请系统的字符计数规则',brief.countConvention,conventions)}${briefInput('checkedOn','题目与限制核验日期',brief.checkedOn,'date')}</div>
   <label class="atlas-field">官方题目／需要回应的各小问<textarea data-writing-field="prompt" aria-label="官方题目／需要回应的各小问" rows="4">${h(brief.prompt)}</textarea></label>
   ${briefInput('promptUrl','官方题目或申请要求链接',brief.promptUrl,'url')}<p>${safeLink(brief.promptUrl,'打开题目来源')}</p>
   <p class="writing-muted">填写当前项目的实际要求。未知限制留空；words、characters、页面数和模型 tokens 不可互换。更改类型或方向后，可明确重建未修改的起始提纲；已改提纲逐段编辑。</p>
  </details>
  <div id="writingMethod">${renderWritingMethod(brief)}</div>${renderOutline(brief,context)}${renderAssociations(brief,context)}
  <div id="writingChecks">${renderWritingChecks(brief,context)}</div>
  ${renderSources()}
 </div>`;
}

export function renderWritingChecks(brief:WritingBrief,context:WritingViewContext):string{
 const evidence=currentEvidence(context);const counts=countWritingDraft(context.content,brief.countConvention);
 const issues=inspectWritingDraft(context.content,brief,evidence,context.ownerId);
 const review=writingReviewState(context.content,brief,evidence,context.ownerId);
 const reviewMessage=brief.review.basis===null?'尚未完成本轮人工确认':!review.current?'正文、简报或事实已变化，审阅需重新确认':`本轮已人工确认 ${review.checks.length}/${review.total} 项`;
 const labels:Record<string,string>={warning:'需处理',review:'请复核',info:'提示'};
 return `<section class="writing-checks" aria-label="当前正文计数与人工检查">
  <h3>当前正文 · 计数与复核</h3>
  <div class="atlas-grid writing-counts"><article class="writing-stat"><small>英文词数（本地估算）</small><strong>${counts.words}</strong><span>${brief.wordLimit===null?'词数上限尚未核验':` / ${h(brief.wordLimit)} words`}</span></article><article class="writing-stat"><small>Unicode 字符（含空格与换行）</small><strong>${counts.characters}</strong><span>不含空白：${counts.charactersWithoutWhitespace}</span></article><article class="writing-stat"><small>按已核验规则计数</small><strong>${counts.countedCharacters===null?'—':counts.countedCharacters}</strong><span>${counts.countedCharacters===null?'字符计数规则未核验':brief.characterLimit===null?'字符上限尚未核验':` / ${h(brief.characterLimit)} characters`}</span></article></div>
  <p class="writing-muted">本地计数用于修订，提交前以申请系统为准。词数与字符数分开计算。</p>
  <details class="writing-issues" open><summary>本地规则提示 · ${issues.length} 项</summary><p>这里只提示复核位置，不能验证事实或判断文书是否足以录取。</p>${issues.length?`<ul class="writing-issue-list">${issues.map(issue=>`<li class="writing-issue" data-issue-code="${h(issue.code)}"${issue.sectionId?` data-section-id="${h(issue.sectionId)}"`:''}><span class="task-tag">${h(labels[issue.status]??'提示')}</span> ${h(issue.message)}</li>`).join('')}</ul>`:'<p>未发现这些规则涉及的待处理项，仍需人工审阅。</p>'}</details>
  <details class="writing-review" open><summary>人工审阅 · ${review.current?review.checks.length:0}/${review.total} 项</summary><p role="status">${h(reviewMessage)}</p><fieldset><legend>本人针对当前正文逐项确认</legend>${MANUAL_REVIEW_CHECKS.map(check=>`<label class="writing-checkbox"><input type="checkbox" data-review-key="${h(check.id)}" aria-label="${h(check.label)}"${review.current&&review.checks.includes(check.id)?' checked':''}><span>${h(check.label)}</span></label>`).join('')}</fieldset><p class="writing-muted">勾选表示本人已检查这一项，不代表自动审核通过。正文、简报或相关事实变化后需要重新确认。</p><div class="writing-toolbar"><button type="button" class="outline-button" data-writing-action="confirm-review">查看审稿确认说明</button><button type="button" class="text-button" data-writing-action="clear-review">清除人工确认</button></div></details>
 </section>`;
}
