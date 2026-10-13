export type WritingSourceLevel =
  | 'official-requirement'
  | 'official-guidance'
  | 'student-experience'
  | 'self-reported-case'
  | 'authorised-example';

export type WritingSource = {
  id: string;
  title: string;
  url: string;
  level: WritingSourceLevel;
  scope: string;
  checkedOn: string;
  summary: string;
};

// Reading references only: these summaries do not populate an application's
// prompt, word limit, personal facts, or verification status automatically.
export const writingSources: readonly WritingSource[] = [
  {
    id: 'nus-mcomp-specialisations-personal-statement',
    title: 'NUS MComp Specialisations：计算机硕士 PS 要求',
    url: 'https://www.comp.nus.edu.sg/programmes/pg/misc/application/',
    level: 'official-requirement',
    scope: 'NUS MComp with Specialisations：Computer Science / Information Systems / Infocomm Security；2027 August 申请页',
    checkedOn: '2026-10-14',
    summary: 'PS 必交，简洁说明申请原因、领域准备、职业计划和有助判断能力与动机的背景兴趣。材料为英文 PDF；公开页未给数值词数或字符上限，需核对该项目申请入口。',
  },
  {
    id: 'nus-mcomp-ai-personal-statement',
    title: 'NUS MComp AI：人工智能硕士 PS 要求',
    url: 'https://www.comp.nus.edu.sg/programmes/pg/mcomp-ai/application/',
    level: 'official-requirement',
    scope: 'NUS Master of Computing in Artificial Intelligence；2027 August 申请页，独立于 General Track 和博士',
    checkedOn: '2026-10-14',
    summary: 'PS 为必交材料，涵盖动机、该领域准备、未来职业计划与相关背景兴趣。英文 PDF；已读公开页没有数值篇幅，不套用其他 NUS 项目的 350 或 500 words，也不强加博士研究计划。',
  },
  {
    id: 'hku-msccs-2027-28-personal-statement',
    title: 'HKU MSc Computer Science：PS 为可选材料',
    url: 'https://master.cds.hku.hk/msccs/about/msc-in-computer-science-application-procedure-2027-28/',
    level: 'official-requirement',
    scope: 'HKU MSc(CompSc) 2027/28 Fall；具体申请路径与材料入口仍应分别核对',
    checkedOn: '2026-10-14',
    summary: '当季官方 FAQ 第 6 项明确 CV 必交、Personal Statement 可选。已读页面未列 PS 题目、语言或数值篇幅；可选不等于全校免文书，不把它设为其他 CS / AI / 数据项目的要求。',
  },
  {
    id: 'cityu-p04-p15-applicant-statement',
    title: 'CityU Finance / Financial Engineering 原题',
    url: 'https://www.cityu.edu.hk/sgs/files/master_admission/Applicant_Statement.html',
    level: 'official-requirement',
    scope: 'CityU MSc Finance P04 / Financial Engineering P15；官网索引正文，实时页待复核',
    checkedOn: '2026-10-13',
    summary: '官方页索引正文列出全文不超过 500 words：专业兴趣、职业衔接、非金融背景如何获益、为什么能胜任。原站当前要求验证码，提交前核对最新页面与申请入口。',
  },
  {
    id: 'nus-dfintech-personal-statement',
    title: 'NUS DFinTech Personal Statement 要求',
    url: 'https://www.comp.nus.edu.sg/programmes/pg/mdft/application/',
    level: 'official-requirement',
    scope: 'NUS MSc Digital Financial Technology；仅限该项目',
    checkedOn: '2026-10-13',
    summary: '简洁说明申请理由、领域准备、未来职业计划，以及有助评估适合度和动机的背景与兴趣。该公开页未列数字篇幅上限；不要套用其他项目的 500 词。',
  },
  {
    id: 'nus-dfintech-programme-structure',
    title: 'NUS DFinTech 课程与实践匹配',
    url: 'https://www.comp.nus.edu.sg/programmes/pg/mdft/structure/',
    level: 'official-guidance',
    scope: 'NUS DFinTech 项目资源；用于核对 programme fit',
    checkedOn: '2026-10-13',
    summary: '课程结合计算机、金融及 FinTech 基础，并提供选修与 capstone 选择。先确认当届课程和选择条件，再说明资源能补什么能力缺口；不把实习写成保证获得。',
  },
  {
    id: 'lse-graduate-academic-purpose',
    title: 'LSE 官方：兴趣、准备与学习目标',
    url: 'https://www.lse.ac.uk/study-at-lse/Graduate/Prospective-students/Supporting-documents/Statement-of-academic-purpose',
    level: 'official-requirement',
    scope: 'LSE 研究生要求；港新写作方法参考，不是港新统一要求',
    checkedOn: '2026-10-13',
    summary: '用相关学习和经历解释适合度，说明项目如何支持下一步目标。避免泛谈排名与城市地位；遵循具体项目题目，并核对个人原创要求。',
  },
  {
    id: 'lse-careers-finance-example',
    title: 'LSE Careers：金融方向示范段落',
    url: 'https://blogs.lse.ac.uk/careers/2021/05/25/writing-a-personal-statement-for-further-studies/',
    level: 'official-guidance',
    scope: '学校职业服务教学示范；未确认作者或录取结果',
    checkedOn: '2026-10-13',
    summary: '示范把统计学习、分析任务和实践经验接到知识缺口、课程与职业用途。可学习论证顺序；不复制经历，也不把历史课程代码挪到目标项目。',
  },
  {
    id: 'lse-student-lola-writing-process',
    title: 'LSE 在读硕士生：研究与修订过程',
    url: 'https://blogs.lse.ac.uk/studentsatlse/2023/01/21/tips-for-writing-a-statement-of-academic-purpose/',
    level: 'student-experience',
    scope: 'Lola Idowu，Behavioural Science 硕士生；个人经验',
    checkedOn: '2026-10-13',
    summary: '先了解项目，再解释自己的背景、未来计划与学位的连接；给起草和修订留时间。学校发布的学生经验不等于招生委员会规则，也不证明某写法导致录取。',
  },
  {
    id: 'kalamazoo-authorised-masters-example',
    title: '学校授权公开：硕士申请文书样例',
    url: 'https://psychology.kzoo.edu/requesting-recommendation-letters/',
    level: 'authorised-example',
    scope: 'Kalamazoo College Sample #1；实际硕士申请，录取结果未核实',
    checkedOn: '2026-10-13',
    summary: '页面注明 Used by permission。样例从具体工作问题解释跨学科学习需要，再说明项目匹配；仅学习论据组织，不移植医学研究经历或导师信息。',
  },
  {
    id: 'lse-self-reported-masters-statement',
    title: '本人公开的 LSE MSc 文书与录取自述',
    url: 'https://www.reddit.com/r/LSE/comments/1g46lxp/lse_personal_statement_example/',
    level: 'self-reported-case',
    scope: '作者 u/anonboxis；公共政策 MSc，自述录取，低可信权重',
    checkedOn: '2026-10-13',
    summary: '作者公开全文并自述获得 offer，未独立核实。可观察经历、课程与目标如何连接；不当成金融录取规则，不从结果推断文书单独促成录取。',
  },
];
