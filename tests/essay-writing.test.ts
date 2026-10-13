import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';

async function writing(){
 assert.ok(existsSync(new URL('../src/essay-writing.ts',import.meta.url)),'Pure writing module must exist');
 return import('../src/essay-writing.ts');
}
const fact={id:'fact-a',owner_id:'owner-a',title:'Model evaluation',role:'Analyst',description:'Compared model errors',achievements:['Documented limitations'],metrics:['20 observations'],verified:true};
const snapshot={essays:[{id:'essay-a',owner_id:'owner-a',type:'SOP',prompt:'Essay fallback',word_limit:900,program_essay_requirement_id:'req-a',current_version_number:2}],program_essay_requirements:[{id:'req-a',owner_id:'owner-a',essay_type:'SOP',prompt:'Official prompt',word_limit:350,character_limit:2000,source_id:'source-a'}],sources:[{id:'source-a',owner_id:'owner-a',url:'https://example.edu/admissions',verified_at:'2026-10-13T00:00:00Z'}],essay_evidence_items:[{essay_id:'essay-a',owner_id:'owner-a',evidence_item_id:'fact-a'}],evidence_items:[fact]};
async function brief(){return (await writing()).buildWritingBrief(snapshot as never,'essay-a','owner-a');}

test('linked official prompt and independent limits precede essay defaults',async()=>{
 const b=await brief();assert.equal(b.kind,'SOP');assert.equal(b.prompt,'Official prompt');assert.equal(b.wordLimit,350);assert.equal(b.characterLimit,2000);assert.equal(b.promptUrl,'https://example.edu/admissions');assert.equal(b.checkedOn,'2026-10-13');assert.deepEqual(b.sections.find(s=>s.id==='experience')?.evidenceIds,['fact-a']);
});
test('unknown official values retain essay fallback without inventing a limit',async()=>{
 const w=await writing();const data={...snapshot,program_essay_requirements:[{...snapshot.program_essay_requirements[0],prompt:null,word_limit:null,character_limit:null}],essays:[{...snapshot.essays[0],word_limit:null}]};
 const b=w.buildWritingBrief(data as never,'essay-a','owner-a');assert.equal(b.prompt,'Essay fallback');assert.equal(b.wordLimit,null);assert.equal(b.characterLimit,null);assert.equal(b.countConvention,'UNKNOWN');
});
test('defaults do not use foreign owners requirements sources or facts',async()=>{
 const w=await writing();const data={...snapshot,program_essay_requirements:[{...snapshot.program_essay_requirements[0],owner_id:'owner-b'}],evidence_items:[{...fact,owner_id:'owner-b'}]};
 const b=w.buildWritingBrief(data as never,'essay-a','owner-a');assert.equal(b.prompt,'Essay fallback');assert.equal(b.promptUrl,'');assert.deepEqual(b.sections.flatMap(s=>s.evidenceIds),[]);assert.throws(()=>w.buildWritingBrief(snapshot as never,'essay-a','owner-b'),/owner|不可用|not available/i);
});
test('PS SOP and short answers have independent editable finance starting outlines',async()=>{
 const w=await writing();const first=w.createWritingOutline('SOP');assert.ok(first.some(s=>/风险|模型/.test(s.question)));assert.ok(first.some(s=>s.id==='program-fit'));assert.equal(w.createWritingOutline('SHORT_ANSWER')[0].id,'direct-response');first[0].title='Changed';assert.notEqual(w.createWritingOutline('SOP')[0].title,'Changed');assert.notEqual(w.createWritingOutline('PS')[0].question,w.createWritingOutline('SOP')[0].question);
});
test('counts English tokens separately from Unicode characters and whitespace',async()=>{
 const w=await writing();assert.deepEqual(w.countWritingDraft('A B😀\n中','INCLUDING_SPACES'),{words:2,characters:6,charactersWithoutWhitespace:4,countedCharacters:6});assert.equal(w.countWritingDraft('A B😀\n中','EXCLUDING_SPACES').countedCharacters,4);assert.equal(w.countWritingDraft('中文😀').words,0);assert.equal(w.countWritingDraft("I've tested risk-aware models.").words,4);assert.equal(w.countWritingDraft('').countedCharacters,null);
});
test('explainable checks warn about limits and facts without a quality or admission score',async()=>{
 const w=await writing();const b=await brief();b.wordLimit=2;b.characterLimit=null;b.sections.find(s=>s.id==='experience')!.notes='Compared errors';
 const issues=w.inspectWritingDraft('My world-class model improved results by 20 percent.',b,[{...fact,verified:false}],'owner-a');const codes=issues.map(i=>i.code);assert.ok(codes.includes('WORD_LIMIT'));assert.ok(codes.includes('GENERIC_LANGUAGE'));assert.ok(codes.includes('NUMERICAL_CLAIMS'));assert.ok(codes.includes('UNCONFIRMED_EVIDENCE'));assert.ok(codes.includes('PROGRAM_FIT_SOURCE'));assert.ok(issues.every(i=>i.message));assert.ok(!JSON.stringify(issues).match(/录取概率|qualityScore|admissionScore/));
});
test('unavailable selected facts are warned and unknown requirements never pass',async()=>{
 const w=await writing();const b=await brief();b.prompt='';b.wordLimit=null;b.characterLimit=null;b.sections[0].evidenceIds=['foreign'];
 const issues=w.inspectWritingDraft('',b,[{...fact,id:'foreign',owner_id:'owner-b'}],'owner-a');assert.ok(issues.some(i=>i.code==='UNAVAILABLE_EVIDENCE'));assert.ok(issues.some(i=>i.code==='PROMPT_MISSING'));assert.ok(issues.some(i=>i.code==='LIMIT_UNKNOWN'));assert.ok(issues.some(i=>i.code==='BODY_EMPTY'));assert.ok(issues.every(i=>!String(i.status).match(/pass|verified/i)));
});
test('unknown character convention does not silently decide a portal counting rule',async()=>{
 const w=await writing();const b=await brief();b.characterLimit=4;b.wordLimit=null;const issues=w.inspectWritingDraft('A B😀\n中',b,[fact],'owner-a');assert.ok(issues.some(i=>i.code==='COUNT_CONVENTION'));assert.ok(!issues.some(i=>i.code==='CHARACTER_LIMIT'));b.countConvention='INCLUDING_SPACES';assert.ok(w.inspectWritingDraft('A B😀\n中',b,[fact],'owner-a').some(i=>i.code==='CHARACTER_LIMIT'));
});
test('manual checks become stale when exact text brief or selected owner facts change',async()=>{
 const w=await writing();let b=await brief();b=w.setWritingReviewCheck(b,'My draft',[fact],'owner-a','FACTS',true);assert.deepEqual(w.writingReviewState('My draft',b,[fact],'owner-a').checks,['FACTS']);assert.equal(w.writingReviewState('My draft.',b,[fact],'owner-a').current,false);assert.equal(w.writingReviewState('My draft',{...b,prompt:'Different prompt'},[fact],'owner-a').current,false);assert.equal(w.writingReviewState('My draft',b,[{...fact,metrics:['21 observations']}],'owner-a').current,false);assert.equal(w.writingReviewState('My draft',b,[fact,{...fact,id:'unrelated'}],'owner-a').current,true);assert.equal(w.writingReviewState('My draft',b,[fact],'owner-b').current,false);
 b=w.setWritingReviewCheck(b,'New draft',[fact],'owner-a','VOICE',true);assert.deepEqual(b.review.checks,['VOICE']);assert.equal(w.MANUAL_REVIEW_CHECKS.length,7);
});
test('source URLs accept only credential-free HTTP(S) addresses',async()=>{
 const w=await writing();assert.equal(w.safeWritingUrl(' javascript:alert(1) '),null);assert.equal(w.safeWritingUrl('data:text/html,hi'),null);assert.equal(w.safeWritingUrl('https://name:secret@example.edu/'),null);assert.equal(w.safeWritingUrl('/admission'),null);assert.equal(w.safeWritingUrl('https://example.edu/a\n'),null);assert.equal(w.safeWritingUrl(' https://example.edu/a '),'https://example.edu/a');
 const b=await brief();assert.throws(()=>w.parseWritingBrief({...b,promptUrl:'javascript:alert(1)'}),/URL|地址/);assert.throws(()=>w.parseWritingBrief({...b,wordLimit:-1}),/limit|上限/);assert.throws(()=>w.parseWritingBrief({...b,checkedOn:'2026-02-30'}),/date|日期/);
});
test('brief parser rejects malformed sections checks and limits without altering input',async()=>{
 const w=await writing();const b=await brief();assert.throws(()=>w.parseWritingBrief({...b,sections:[b.sections[0],b.sections[0]]}),/section|段落/);assert.throws(()=>w.parseWritingBrief({...b,review:{basis:null,checks:['ADMITTED']}}),/review|核查/);assert.throws(()=>w.parseWritingBrief({...b,characterLimit:2.2}),/limit|上限/);const copy=w.parseWritingBrief(b);copy.sections[0].notes='Changed';assert.equal(b.sections[0].notes,'');
});
test('export modes preserve current unsaved text and keep brief-only free of body and foreign facts',async()=>{
 const w=await writing();const b=await brief();const args={brief:b,body:'CURRENT_UNSAVED_BODY',evidence:[fact,{...fact,id:'other',owner_id:'owner-b',title:'FOREIGN_SECRET'}],ownerId:'owner-a',programLabel:'Finance',versionLabel:'未保存草稿'};
 const draft=w.exportWritingMarkdown({...args,mode:'DRAFT_WITH_BRIEF'});assert.ok(draft.includes('CURRENT_UNSAVED_BODY'));assert.ok(draft.includes('未保存草稿'));assert.ok(draft.includes('Official prompt'));assert.ok(draft.includes('fact-a'));assert.ok(draft.includes('https://example.edu/admissions'));assert.ok(!draft.includes('FOREIGN_SECRET'));const only=w.exportWritingMarkdown({...args,mode:'BRIEF_ONLY'});assert.ok(!only.includes('CURRENT_UNSAVED_BODY'));assert.ok(only.includes('Model evaluation'));assert.ok(!only.includes('FOREIGN_SECRET'));assert.equal(args.body,'CURRENT_UNSAVED_BODY');
});
test('markdown export renders source links safely and does not execute HTML metadata',async()=>{
 const w=await writing();const b=await brief();b.prompt='<script>alert(1)</script>';const out=w.exportWritingMarkdown({brief:b,body:'Original body',evidence:[fact],ownerId:'owner-a',programLabel:'[Title](javascript:evil)',mode:'DRAFT_WITH_BRIEF'});assert.ok(!out.includes('<script>'));assert.ok(out.includes('&lt;script&gt;'));assert.ok(!out.includes('[Title](javascript:evil)'));assert.ok(out.includes('Original body'));
});

test('legacy briefs receive the original finance context without changing authored notes or facts',async()=>{
 const w=await writing();const b=await brief();const {area:ignoredArea,...legacy}=b;void ignoredArea;legacy.sections[0].notes='My actual project reflection';legacy.sections[0].budget=80;legacy.sections[0].evidenceIds=['fact-a'];legacy.wordLimit=350;
 const parsed=w.parseWritingBrief(legacy);assert.equal(parsed.area,'FINANCE_FINTECH');assert.deepEqual(parsed.sections,legacy.sections);assert.equal(parsed.wordLimit,350);assert.equal(parsed.characterLimit,2000);assert.equal(w.writingArea(legacy),'FINANCE_FINTECH');assert.ok(!('area' in legacy));
});

test('area schema rejects unrecognised and null values rather than coercing a direction',async()=>{
 const w=await writing();const b=await brief();for(const area of ['CYBER_MAGIC','',null,{}])assert.throws(()=>w.parseWritingBrief({...b,area}),/方向|area/);assert.equal(w.WRITING_AREAS.length,6);assert.equal(new Set(w.WRITING_AREAS.map(a=>a.id)).size,6);assert.ok(w.WRITING_AREAS.every(a=>a.label));
});

test('computer science questions address algorithms systems and theoretical preparation',async()=>{
 const w=await writing();const sections=w.createWritingOutline('SOP','COMPUTER_SCIENCE');const text=sections.map(s=>s.question).join(' ');assert.match(text,/算法/);assert.match(text,/系统/);assert.match(text,/理论|离散数学/);assert.match(text,/复杂度|正确性/);assert.ok(!/金融/.test(text));assert.ok(sections.every(s=>!s.notes&&!s.evidenceIds.length));
});

test('software engineering questions ask for architecture decisions and engineering validation',async()=>{
 const w=await writing();const text=w.createWritingOutline('SOP','SOFTWARE_ENGINEERING').map(s=>s.question).join(' ');assert.match(text,/架构/);assert.match(text,/测试|验证/);assert.match(text,/需求/);assert.ok(!/金融/.test(text));
});

test('data science questions distinguish statistical evidence data quality and baselines',async()=>{
 const w=await writing();const text=w.createWritingOutline('SOP','DATA_SCIENCE').map(s=>s.question).join(' ');assert.match(text,/统计/);assert.match(text,/数据/);assert.match(text,/baseline|基线/i);assert.match(text,/泄漏|不确定性/);assert.ok(!/金融/.test(text));
});

test('AI questions cover models data evaluation baselines and limits without claiming experience',async()=>{
 const w=await writing();const sections=w.createWritingOutline('SOP','ARTIFICIAL_INTELLIGENCE');const text=sections.map(s=>s.question).join(' ');assert.match(text,/模型/);assert.match(text,/数据/);assert.match(text,/评估/);assert.match(text,/baseline|基线/i);assert.match(text,/局限/);assert.ok(!/金融/.test(text));assert.ok(sections.every(s=>s.notes===''&&s.budget===null&&s.evidenceIds.length===0));
});

test('general writing and area short answers avoid finance assumptions and doctoral proposals',async()=>{
 const w=await writing();assert.ok(!/金融/.test(w.createWritingOutline('SOP','GENERAL').map(s=>s.question).join(' ')));
 for(const area of w.WRITING_AREAS){const short=w.createWritingOutline('SHORT_ANSWER',area.id);assert.equal(short.length,3);assert.equal(short[0].id,'direct-response');assert.ok(!/博士|导师|研究计划书|PhD|dissertation/i.test(short.map(s=>s.question).join(' ')));assert.ok(short[1].question.includes('?')||short[1].question.includes('？'));}
 const original=w.createWritingOutline('SOP');assert.deepEqual(original,w.createWritingOutline('SOP','FINANCE_FINTECH'));original[0].notes='Edited';assert.equal(w.createWritingOutline('SOP','FINANCE_FINTECH')[0].notes,'');
});

test('new briefs infer direction only from this owners explicitly named target programme',async()=>{
 const w=await writing();const owner='owner-a';const make=(name:string,owner_id=owner)=>w.buildWritingBrief({...snapshot,essays:[{...snapshot.essays[0],program_id:'p',application_id:'a'}],programs:[{id:'p',owner_id,program_name:name}],applications:[{id:'a',owner_id:owner,program_id:'p'}]} as never,'essay-a',owner);
 const cases=[['MSc Computer Science','COMPUTER_SCIENCE'],['软件工程','SOFTWARE_ENGINEERING'],['MSc Data Science and Machine Learning','DATA_SCIENCE'],['人工智能','ARTIFICIAL_INTELLIGENCE'],['AI for Finance and FinTech','FINANCE_FINTECH'],['MSc Interdisciplinary Studies','GENERAL'],['MSc Design','GENERAL']] as const;
 for(const [name,area]of cases){const b=make(name);assert.equal(b.area,area,name);assert.deepEqual(b.sections.flatMap(s=>s.evidenceIds),['fact-a']);assert.equal(b.wordLimit,900,'foreign/unlinked requirement values are not invented');assert.equal(b.sections[0].notes,'');}
 assert.equal(make('MSc Artificial Intelligence','owner-b').area,'GENERAL');const noProgramme=await brief();assert.equal(noProgramme.area,'GENERAL');
});

test('application linkage supplies a programme name without deriving direction from personal facts',async()=>{
 const w=await writing();const data={...snapshot,essays:[{...snapshot.essays[0],application_id:'a'}],applications:[{id:'a',owner_id:'owner-a',program_id:'p'}],programs:[{id:'p',owner_id:'owner-a',program_name:'Computer Science'}]};assert.equal(w.buildWritingBrief(data as never,'essay-a','owner-a').area,'COMPUTER_SCIENCE');
 const factsOnly={...snapshot,evidence_items:[{...fact,title:'Artificial intelligence thesis and financial project'}]};assert.equal(w.buildWritingBrief(factsOnly as never,'essay-a','owner-a').area,'GENERAL');
});

test('changing the area invalidates review while retaining outline text and exported body',async()=>{
 const w=await writing();let b=await brief();b.area='COMPUTER_SCIENCE';b.sections[0].notes='Preserve this customised paragraph plan';b=w.setWritingReviewCheck(b,'Exact body',[fact],'owner-a','PROMPT',true);assert.equal(w.writingReviewState('Exact body',b,[fact],'owner-a').current,true);
 const changed=w.parseWritingBrief({...b,area:'ARTIFICIAL_INTELLIGENCE'});assert.equal(w.writingReviewState('Exact body',changed,[fact],'owner-a').current,false);assert.deepEqual(changed.sections,b.sections);assert.equal(changed.prompt,b.prompt);const out=w.exportWritingMarkdown({brief:changed,body:'Exact body',evidence:[fact],ownerId:'owner-a',mode:'DRAFT_WITH_BRIEF'});assert.match(out,/写作方向：人工智能/);assert.match(out,/Exact body/);assert.match(out,/Preserve this customised paragraph plan/);
});
