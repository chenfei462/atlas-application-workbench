import test from 'node:test';
import assert from 'node:assert/strict';
import type {Snapshot} from '../src/repositories.js';
import type {WritingBrief} from '../src/essay-writing.js';
import {renderWritingPanel,renderWritingChecks,type WritingViewContext} from '../src/essay-writing-view.js';
import * as writingView from '../src/essay-writing-view.js';

function fixture(){
 const brief:WritingBrief={kind:'SOP',language:'en',prompt:'Describe <your> reasons & preparation',promptUrl:'https://university.example/requirement',checkedOn:'2026-10-13',wordLimit:350,characterLimit:null,countConvention:'UNKNOWN',sections:[{id:'section-1',title:'Evidence <script>alert(1)</script>',question:'What did "you" do?',notes:'</textarea><img src=x onerror=alert(1)>',budget:100,evidenceIds:['fact-a','fact-secret'],sourceUrl:'https://university.example/course'}],review:{basis:null,checks:[]}};
 const snapshot={
  evidence_items:[{id:'fact-a',owner_id:'owner-a',title:'My <project>',role:'Analyst',description:'Built a model',achievements:['Submitted report'],metrics:['Accuracy 81%'],responsibilities:['Selected features'],verified:true},{id:'fact-secret',owner_id:'owner-b',title:'PRIVATE FACT TITLE',role:'PRIVATE ROLE',achievements:['PRIVATE ACHIEVEMENT'],metrics:[],verified:true}],
  materials:[{id:'material-a',owner_id:'owner-a',title:'Project report',status:'CONFIRMED'},{id:'material-secret',owner_id:'owner-b',title:'PRIVATE MATERIAL',status:'CONFIRMED'}],
  evidence_material_links:[{id:'material-link-a',owner_id:'owner-a',evidence_item_id:'fact-a',material_id:'material-a'},{id:'material-link-b',owner_id:'owner-b',evidence_item_id:'fact-a',material_id:'material-secret'}],
  essay_evidence_items:[{id:'essay-link-a',owner_id:'owner-a',essay_id:'essay-a',evidence_item_id:'fact-a'},{id:'essay-link-b',owner_id:'owner-a',essay_id:'essay-other',evidence_item_id:'fact-secret'}],
  essay_evidence_links:[{id:'version-link-a',owner_id:'owner-a',essay_version_id:'version-2',evidence_item_id:'fact-a',claim_note:'Model output only'},{id:'version-link-old',owner_id:'owner-a',essay_version_id:'version-1',evidence_item_id:'fact-a',claim_note:'OLD VERSION CLAIM'},{id:'version-link-secret',owner_id:'owner-b',essay_version_id:'version-2',evidence_item_id:'fact-secret',claim_note:'PRIVATE VERSION CLAIM'}],
 } as unknown as Snapshot;
 const context:WritingViewContext={ownerId:'owner-a',essayId:'essay-a',title:'Finance & <FinTech>',content:'One two three.',currentVersionId:'version-2',currentVersionNumber:2,isUnsaved:true,snapshot};
 return {brief,context};
}

test('writing panel escapes applicant text in attributes, fields and headings',()=>{
 const {brief,context}=fixture();const html=renderWritingPanel(brief,context);
 assert.match(html,/Finance &amp; &lt;FinTech&gt;/);
 assert.match(html,/Evidence &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.match(html,/&lt;\/textarea&gt;&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(html,/<script>|<img src=x|onclick=|onchange=/);
 assert.match(html,/data-writing-field="prompt"/);
 assert.match(html,/data-section-id="section-1" data-section-field="notes"/);
});

test('only current owner facts and their materials are selectable',()=>{
 const {brief,context}=fixture();const html=renderWritingPanel(brief,context);
 assert.match(html,/My &lt;project&gt;/);assert.match(html,/Project report/);
 assert.match(html,/data-section-id="section-1" data-evidence-id="fact-a"/);
 assert.doesNotMatch(html,/PRIVATE FACT|PRIVATE ROLE|PRIVATE ACHIEVEMENT|PRIVATE MATERIAL|data-evidence-id="fact-secret"/);
 assert.match(html,/用户确认/);assert.match(html,/并非外部验证/);
});

test('existing associations show only this essay and current version claims',()=>{
 const {brief,context}=fixture();const html=renderWritingPanel(brief,context);
 assert.match(html,/已关联当前文书/);assert.match(html,/当前版本 v2/);assert.match(html,/Model output only/);
 assert.doesNotMatch(html,/OLD VERSION CLAIM|PRIVATE VERSION CLAIM/);
 assert.match(html,/data-writing-action="associate-evidence"/);
});

test('invalid scheme URLs remain editable text without clickable unsafe links',()=>{
 const {brief,context}=fixture();brief.promptUrl='javascript:alert(1)';brief.sections[0].sourceUrl='data:text/html,<script>alert(1)</script>';
 const html=renderWritingPanel(brief,context);
 assert.doesNotMatch(html,/href="(?:javascript|data):/);
 assert.match(html,/value="javascript:alert\(1\)"/);
 assert.match(html,/target="_blank" rel="noopener noreferrer"/);
 assert.match(html,/尚未填写可访问的官方页面/);
});

test('local persistence and explicit actions explain what is exported or changed',()=>{
 const {brief,context}=fixture();const html=renderWritingPanel(brief,context);
 assert.match(html,/当前浏览器/);assert.match(html,/数据库 JSON/);assert.match(html,/数据库备份/);
 for(const action of ['add-section','remove-section','move-section-up','move-section-down','regenerate-outline','export-full','export-brief','confirm-review','clear-review']) assert.match(html,new RegExp(`data-writing-action="${action}"`));
 assert.match(html,/不会改写正文/);assert.match(html,/正文与简报/);assert.match(html,/仅导出简报/);
 assert.match(html,/id="writingStorageStatus"[^>]*role="status"/);
 assert.equal((html.match(/data-review-key=/g)??[]).length,7);
});

test('checks separate word and character counts and show unconfirmed review honestly',()=>{
 const {brief,context}=fixture();const html=renderWritingChecks(brief,context);
 assert.match(html,/英文词数/);assert.match(html,/>3</);assert.match(html,/Unicode 字符/);
 assert.match(html,/字符计数规则未核验/);assert.match(html,/尚未完成本轮人工确认/);
 assert.match(html,/规则提示/);assert.match(html,/不能验证事实/);
 assert.doesNotMatch(html,/录取概率|质量分|AI 已|招生官评分/);
});

test('source cards disclose source scope, access date and student credibility',()=>{
 const {brief,context}=fixture();const html=renderWritingPanel(brief,context);
 assert.match(html,/官方要求|官方写作指导/);assert.match(html,/适用范围/);assert.match(html,/查阅日期/);
 assert.match(html,/案例/);assert.match(html,/录取原因/);
});

test('finance writing method is optional guidance before the outline and preserves the real prompt',()=>{
 const {brief,context}=fixture();const html=renderWritingPanel(brief,context);
 const start=html.indexOf('<details class="writing-method">');const end=html.indexOf('</details>',start);const method=html.slice(start,end);
 assert.ok(start>=0&&start<html.indexOf('<details class="writing-outline">'));
 assert.doesNotMatch(method,/<details[^>]*\bopen\b|<textarea|<input|data-writing-action/);
 assert.match(method,/真实问题 → 个人行动与判断 → 结果与局限 → 学习缺口 → 本项目资源 → 目标/);
 assert.match(method,/量化/);assert.match(method,/经济与金融理解/);assert.match(method,/编程/);assert.match(method,/业务场景/);assert.match(method,/合规/);
 assert.match(method,/PS.*SOP.*实际题目/);assert.match(method,/不固定段数/);
 assert.match(method,/原创占位框架/);assert.match(method,/非成稿、非用户事实/);assert.match(method,/\[占位项：真实任务\]/);
 assert.match(method,/不推测/);assert.match(method,/不补造/);assert.match(method,/当届官网/);assert.match(method,/AI.*原创性/);
 assert.match(method,/排名/);assert.match(method,/贵校/);assert.match(method,/热爱/);
 assert.equal(brief.prompt,'Describe <your> reasons & preparation');assert.equal(context.content,'One two three.');
});

test('outline rebuild copy matches preservation of an edited outline',()=>{
 const {brief,context}=fixture();const html=renderWritingPanel(brief,context);
 assert.match(html,/仅未修改的起始提纲可重建；已有修改会保留，请逐段编辑/);
 assert.doesNotMatch(html,/重新生成会替换现有提纲/);
});

test('brief offers all application areas with an accessible selected control',()=>{
 const {brief,context}=fixture();const html=renderWritingPanel({...brief,area:'COMPUTER_SCIENCE'} as WritingBrief,context);
 assert.match(html,/<select data-writing-field="area" aria-label="申请方向">/);
 for(const area of ['GENERAL','FINANCE_FINTECH','COMPUTER_SCIENCE','SOFTWARE_ENGINEERING','DATA_SCIENCE','ARTIFICIAL_INTELLIGENCE']) assert.match(html,new RegExp(`<option value="${area}"`));
 assert.match(html,/<option value="COMPUTER_SCIENCE" selected>/);
 assert.match(html,/<summary id="writingBriefSummary">[^<]*计算机科学/);
 assert.match(html,/<div id="writingMethod"><details class="writing-method">/);
});

function method(brief:WritingBrief):string{
 const render=(writingView as typeof writingView&{renderWritingMethod?:(brief:WritingBrief)=>string}).renderWritingMethod;
 assert.equal(typeof render,'function','method is exported for a targeted container refresh');
 return render!(brief);
}

test('legacy brief without an area retains finance guidance and selection',()=>{
 const {brief,context}=fixture();const html=renderWritingPanel(brief,context);
 assert.match(html,/<option value="FINANCE_FINTECH" selected>/);
 assert.match(html,/<summary id="writingBriefSummary">[^<]*金融/);
 assert.match(method(brief),/金融.*FinTech/);
});

test('computer science guidance discusses algorithm, system and theory evidence',()=>{
 const {brief}=fixture();const html=method({...brief,area:'COMPUTER_SCIENCE'} as WritingBrief);
 assert.match(html,/算法/);assert.match(html,/系统/);assert.match(html,/理论/);assert.match(html,/个人技术贡献/);
 assert.doesNotMatch(html,/金融|FinTech|资产定价|收益/);
});

test('software engineering guidance supports architecture tradeoffs and engineering verification',()=>{
 const {brief}=fixture();const html=method({...brief,area:'SOFTWARE_ENGINEERING'} as WritingBrief);
 assert.match(html,/架构/);assert.match(html,/取舍/);assert.match(html,/工程验证/);assert.match(html,/个人技术贡献/);
 assert.doesNotMatch(html,/金融|FinTech|资产定价|收益/);
});

test('data science guidance asks for statistics, data preparation and baselines',()=>{
 const {brief}=fixture();const html=method({...brief,area:'DATA_SCIENCE'} as WritingBrief);
 assert.match(html,/统计/);assert.match(html,/数据处理/);assert.match(html,/baseline/);assert.match(html,/个人技术贡献/);
 assert.doesNotMatch(html,/金融|FinTech|资产定价|收益/);
});

test('AI guidance asks about actual data splits, baseline, evaluation and limitations',()=>{
 const {brief}=fixture();const html=method({...brief,area:'ARTIFICIAL_INTELLIGENCE'} as WritingBrief);
 for(const phrase of ['模型','数据','训练','验证','测试','baseline','评估','局限','个人技术贡献']) assert.ok(html.includes(phrase),phrase);
 assert.doesNotMatch(html,/金融|FinTech|资产定价|收益/);
});

test('general guidance does not require a specialist discipline or invented research',()=>{
 const {brief}=fixture();const html=method({...brief,area:'GENERAL'} as WritingBrief);
 assert.match(html,/真实问题/);assert.match(html,/可迁移能力/);assert.match(html,/授课型硕士/);assert.match(html,/不强制.*研究计划/);
 assert.doesNotMatch(html,/金融|FinTech|模型训练|资产定价/);
});

test('every area preserves synthetic frame, honest evidence and programme fit boundaries',()=>{
 const {brief,context}=fixture();const before=JSON.stringify({brief,context});
 for(const area of ['GENERAL','FINANCE_FINTECH','COMPUTER_SCIENCE','SOFTWARE_ENGINEERING','DATA_SCIENCE','ARTIFICIAL_INTELLIGENCE']){
  const html=method({...brief,area} as WritingBrief);
  assert.match(html,/原创占位框架/);assert.match(html,/非成稿、非用户事实/);assert.match(html,/\[占位项：真实任务\]/);
  assert.match(html,/本人贡献/);assert.match(html,/可核实结果/);assert.match(html,/反思/);assert.match(html,/当届官网/);assert.match(html,/来源/);
  assert.match(html,/不补造/);assert.match(html,/科研/);assert.match(html,/成果数字/);assert.match(html,/授课型硕士/);assert.match(html,/不强制.*研究计划/);
  assert.doesNotMatch(html,/<textarea|<input|data-writing-action|\bopen\b|id="writingMethod"/);
 }
 assert.equal(JSON.stringify({brief,context}),before);
});

test('invalid area text cannot inject a heading or option into the view',()=>{
 const {brief,context}=fixture();const invalid={...brief,area:'<img src=x onerror=alert(1)>'} as unknown as WritingBrief;
 const html=renderWritingPanel(invalid,context);
 assert.doesNotMatch(html,/<img src=x|value="<img|onerror="/);
 assert.match(html,/<option value="FINANCE_FINTECH" selected>/);
});
