export const SCHEMA_VERSION = 2;

export const STATUS = Object.freeze({
  NOT_OPEN: 'NOT_OPEN', OPEN: 'OPEN', UPCOMING: 'UPCOMING', WARNING: 'WARNING', URGENT: 'URGENT',
  DUE_TODAY: 'DUE_TODAY', ROUND_CLOSED: 'ROUND_CLOSED', NEXT_ROUND_AVAILABLE: 'NEXT_ROUND_AVAILABLE',
  ROLLING: 'ROLLING', FINAL_ROUND: 'FINAL_ROUND', CLOSED: 'CLOSED', UNKNOWN: 'UNKNOWN',
});

const DAY_MS = 86400000;
const validDate = (value) => value && !Number.isNaN(new Date(value).getTime());

function dateInTimezone(value, timezone) {
  if (!validDate(value)) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return value;
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

export function calculateDaysRemaining(deadline, now = new Date().toISOString(), timezone = 'UTC') {
  const dueDate = dateInTimezone(deadline, timezone);
  const nowDate = dateInTimezone(now, timezone);
  if (!dueDate || !nowDate) return null;
  const due = Date.parse(`${dueDate}T00:00:00Z`);
  const current = Date.parse(`${nowDate}T00:00:00Z`);
  return Math.round((due - current) / DAY_MS);
}

const roundClosed = (round, now) => /^\d{4}-\d{2}-\d{2}$/.test(String(round.deadline))
  ? dateInTimezone(now, round.timezone) > round.deadline
  : new Date(round.deadline) < new Date(now);
const roundOpened = (round, now) => !round.openDate || !validDate(round.openDate) || (/^\d{4}-\d{2}-\d{2}$/.test(String(round.openDate))
  ? dateInTimezone(now, round.timezone) >= round.openDate
  : new Date(round.openDate) <= new Date(now));
export function getCurrentRound(rounds = [], now = new Date().toISOString()) {
  const available = rounds.filter((round) => validDate(round.deadline) && !roundClosed(round, now) && roundOpened(round, now));
  return available.sort((a, b) => new Date(a.deadline) - new Date(b.deadline))[0] || null;
}

export function getNextAvailableRound(rounds = [], now = new Date().toISOString()) {
  return getCurrentRound(rounds, now);
}

export function getDeadlineState({ rounds = [], rollingAdmission = false, applicationOpenDate = null, now = new Date().toISOString() } = {}) {
  if (rollingAdmission) return { status: STATUS.ROLLING, currentRound: null, nextAvailableRound: null, nearestDeadline: null, daysRemaining: null, urgency: 'ROLLING', applicationWindowStatus: 'OPEN', message: 'Rolling admission' };
  if (!rounds.length) {
    const notOpen = validDate(applicationOpenDate) && new Date(applicationOpenDate) > new Date(now);
    return { status: notOpen ? STATUS.NOT_OPEN : STATUS.UNKNOWN, currentRound: null, nextAvailableRound: null, nearestDeadline: null, daysRemaining: null, urgency: 'UNKNOWN', applicationWindowStatus: notOpen ? 'NOT_OPEN' : 'UNKNOWN', message: notOpen ? 'Application not open' : 'Deadline needs verification' };
  }
  const next = getNextAvailableRound(rounds, now);
  if (!next && rounds.some(round => !validDate(round.deadline))) return { status: STATUS.UNKNOWN, currentRound: null, nextAvailableRound: null, nearestDeadline: null, daysRemaining: null, urgency: 'UNKNOWN', applicationWindowStatus: 'UNKNOWN', message: 'Deadline needs verification' };
  if (!next) return { status: STATUS.CLOSED, currentRound: null, nextAvailableRound: null, nearestDeadline: null, daysRemaining: null, urgency: 'CLOSED', applicationWindowStatus: 'CLOSED', message: 'All application rounds have closed' };
  const days = calculateDaysRemaining(next.deadline, now, next.timezone);
  let status = STATUS.OPEN;
  if (days === 0) status = STATUS.DUE_TODAY;
  else if (days <= 7) status = STATUS.URGENT;
  else if (days <= 14) status = STATUS.WARNING;
  else if (days <= 30) status = STATUS.UPCOMING;
  const closedRounds = rounds.filter((round) => validDate(round.deadline) && roundClosed(round, now));
  if (closedRounds.length) status = status === STATUS.OPEN || status === STATUS.UPCOMING ? STATUS.NEXT_ROUND_AVAILABLE : status;
  const final = rounds.filter((round) => round.status === 'FINAL' || /final/i.test(round.name || '')).some((round) => round.id === next.id);
  if (final && status === STATUS.OPEN) status = STATUS.FINAL_ROUND;
  return { status, currentRound: next, nextAvailableRound: next, nearestDeadline: next.deadline, daysRemaining: days, urgency: days <= 7 ? 'URGENT' : days <= 14 ? 'WARNING' : 'NORMAL', applicationWindowStatus: 'OPEN', message: closedRounds.length ? `Previous round closed; next: ${next.name}` : `${next.name} is open` };
}

export function calculateApplicationReadiness({ requiredMaterials = [], essays = [], recommendations = { required: 0, submitted: 0 }, portalSections = [], languageRequirementMet = true } = {}) {
  const requiredComplete = requiredMaterials.filter((item) => item.status === 'COMPLETE' || item.status === 'CONFIRMED').length;
  const requiredCount = requiredMaterials.length;
  const materialScore = requiredCount ? requiredComplete / requiredCount : 1;
  const essayScore = essays.length ? essays.reduce((sum, essay) => sum + (essay.status === 'FINAL' || essay.status === 'SUBMITTED' ? 1 : essay.status === 'DRAFT' || essay.status === 'REVISING' || essay.status === 'FACT_CHECK' ? 0.4 : 0), 0) / essays.length : 1;
  const recScore = recommendations.required ? Math.min(1, recommendations.submitted / recommendations.required) : 1;
  const portalScore = portalSections.length ? portalSections.filter((section) => section.status === 'COMPLETE').length / portalSections.length : 1;
  const score = Math.round((materialScore * 30 + essayScore * 20 + recScore * 20 + portalScore * 20 + (languageRequirementMet ? 10 : 0)));
  return { score, requiredMaterials: { complete: requiredComplete, total: requiredCount }, recommendations: { submitted: recommendations.submitted || 0, required: recommendations.required || 0, label: `${recommendations.submitted || 0}/${recommendations.required || 0}` }, languageRequirementMet, breakdown: { materials: materialScore, essays: essayScore, recommendations: recScore, portal: portalScore, language: languageRequirementMet ? 1 : 0 } };
}

export function getApplicationBlockers(application = {}, deadline = {}) {
  const blockers = [];
  (application.requiredMaterials || []).filter((item) => !['COMPLETE', 'CONFIRMED'].includes(item.status)).forEach((item) => blockers.push({ id: `${application.id}-${item.id}`, applicationId: application.id, type: 'MISSING_DOCUMENT', severity: 'HIGH', title: `缺少${item.title || '材料'}`, description: '这是项目要求的必需材料。', action: '打开材料中心', dueDate: deadline.deadline || null, resolved: false }));
  if (application.languageRequirementMet === false) blockers.push({ id: `${application.id}-language`, applicationId: application.id, type: 'LANGUAGE_SCORE', severity: 'HIGH', title: '语言成绩未满足', description: '请上传合格语言成绩或确认项目允许后补。', action: '查看语言要求', dueDate: deadline.deadline || null, resolved: false });
  if ((application.recommendations?.submitted || 0) < (application.recommendations?.required || 0)) blockers.push({ id: `${application.id}-recommendation`, applicationId: application.id, type: 'RECOMMENDATION', severity: 'HIGH', title: `推荐信 ${application.recommendations?.submitted || 0}/${application.recommendations?.required || 0}`, description: '仍有推荐信未提交。', action: '打开推荐信追踪', dueDate: deadline.deadline || null, resolved: false });
  (application.essays || []).filter((essay) => !['FINAL', 'SUBMITTED'].includes(essay.status)).forEach((essay) => blockers.push({ id: `${application.id}-${essay.title || 'essay'}`, applicationId: application.id, type: 'ESSAY', severity: 'MEDIUM', title: `${essay.title || '文书'}尚未完成`, description: '请继续写作并完成事实核验。', action: '打开文书工作台', dueDate: essay.deadline || deadline.deadline || null, resolved: false }));
  return blockers;
}

const urgencyScore = { HIGH: 40, MEDIUM: 22, LOW: 8 };
export function calculateTaskPriority({ dueDate = null, severity = 'LOW', applicationPriority = 'MEDIUM', importance = 'MEDIUM' } = {}, now = new Date().toISOString()) {
  const days = dueDate ? calculateDaysRemaining(dueDate, now, 'UTC') : 40;
  const deadlineScore = days == null ? 0 : days <= 0 ? 60 : days <= 7 ? 50 : days <= 14 ? 35 : days <= 30 ? 20 : 5;
  return Math.min(100, deadlineScore + (urgencyScore[severity] || 0) * 0.45 + (urgencyScore[applicationPriority] || 0) * 0.3 + (urgencyScore[importance] || 0) * 0.25);
}

export function generateTodayTasks(applications = [], now = new Date().toISOString()) {
  const tasks = applications.flatMap((application) => {
    const blockers = application.blockers || getApplicationBlockers(application, { deadline: application.targetRound?.deadline });
    return blockers.filter((blocker) => !blocker.resolved).map((blocker) => ({
      id: `task-${blocker.id}`, source: 'BLOCKER_ENGINE', applicationId: application.id,
      title: blocker.title, description: blocker.description, dueDate: blocker.dueDate,
      priorityScore: calculateTaskPriority({ dueDate: blocker.dueDate, severity: blocker.severity, applicationPriority: application.priority, importance: blocker.type === 'ESSAY' ? 'HIGH' : 'MEDIUM' }, now), status: 'OPEN',
    }));
  });
  return tasks.sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 5);
}

export function getVerificationState(verifiedAt, now = new Date().toISOString()) {
  if (!validDate(verifiedAt)) return 'NEEDS_VERIFICATION';
  const days = calculateDaysRemaining(now, verifiedAt, 'UTC');
  return days <= 30 ? 'FRESH' : 'STALE';
}

export function createEmptyStore() {
  return { schemaVersion: SCHEMA_VERSION, programs: [], applications: [], materials: [], materialVersions: [], evidence: [], essays: [], essayVersions: [], tasks: [], recommenders: [], recommendationRequests: [], inbox: [], decisions: [], auditLog: [], updatedAt: new Date().toISOString() };
}

export function createDemoStore() {
  const store = createEmptyStore();
  const programs = [
    {
      id: 'program-cuhksz-fintech', universityId: 'cuhksz', universityName: '香港中文大学（深圳）', school: '数据科学学院', programName: '金融工程', degreeName: 'MSc', region: '香港', country: '中国', city: '深圳', intakeYear: 2027, intakeTerm: '秋季', studyMode: '授课型', duration: '2年', tuition: '待核验', applicationFee: '¥600', applicationOpenDate: '2026-09-01T00:00:00+08:00', rollingAdmission: false, applicationStatus: 'OPEN', officialProgramUrl: 'https://mscfe.cuhk.edu.cn/', officialApplicationUrl: 'https://mscfe.cuhk.edu.cn/', lastVerifiedAt: '2026-10-10T09:42:00+08:00', verificationStatus: 'VERIFIED', tags: ['FinTech', 'Finance'], applicationRounds: [
        { id: 'cuhksz-fe-r1', name: 'Round 1', openDate: '2026-09-01T00:00:00+08:00', deadline: '2026-10-01T23:59:00+08:00', timezone: 'Asia/Hong_Kong', applicantType: 'INTERNATIONAL', status: 'CLOSED', sourceUrl: 'https://mscfe.cuhk.edu.cn/', verifiedAt: '2026-10-10T09:42:00+08:00' },
        { id: 'cuhksz-fe-r2', name: 'Round 2', openDate: '2026-10-02T00:00:00+08:00', deadline: '2026-11-06T23:59:00+08:00', timezone: 'Asia/Hong_Kong', applicantType: 'INTERNATIONAL', status: 'OPEN', sourceUrl: 'https://mscfe.cuhk.edu.cn/', verifiedAt: '2026-10-10T09:42:00+08:00' },
        { id: 'cuhksz-fe-r3', name: 'Round 3', openDate: '2026-11-07T00:00:00+08:00', deadline: '2027-01-08T23:59:00+08:00', timezone: 'Asia/Hong_Kong', applicantType: 'INTERNATIONAL', status: 'OPEN', sourceUrl: 'https://mscfe.cuhk.edu.cn/', verifiedAt: '2026-10-10T09:42:00+08:00' },
      ],
      sourceRecords: [{ id: 'source-fe', field: 'applicationRounds', url: 'https://mscfe.cuhk.edu.cn/', sourceType: 'OFFICIAL_PROGRAM', title: 'Official programme page', valueSnapshot: 'Round 1 / Round 2 / Round 3', verifiedAt: '2026-10-10T09:42:00+08:00', verificationStatus: 'VERIFIED' }],
      academicRequirements: '相关本科背景；具体先修课待核验', languageRequirements: '英语要求待核验', requiredDocuments: ['CV', 'TRANSCRIPT', 'DEGREE_CERTIFICATE', 'PS'], recommendationRequirement: { required: 2 }, essayRequirements: [{ type: 'PERSONAL_STATEMENT', wordLimit: null }], notes: 'Demo 数据：提交前再次打开官方页面核验。',
    },
    {
      id: 'program-cuhksz-data', universityId: 'cuhksz', universityName: '香港中文大学（深圳）', school: '数据科学学院', programName: '数据科学', degreeName: 'MSc', region: '香港', country: '中国', city: '深圳', intakeYear: 2027, intakeTerm: '秋季', studyMode: '授课型', duration: '2年', tuition: '待核验', applicationFee: '¥600', applicationOpenDate: '2026-09-01T00:00:00+08:00', rollingAdmission: false, applicationStatus: 'OPEN', officialProgramUrl: 'https://sds.cuhk.edu.cn/article/2467', officialApplicationUrl: 'https://sds.cuhk.edu.cn/article/2467', lastVerifiedAt: '2026-10-10T09:42:00+08:00', verificationStatus: 'VERIFIED', tags: ['Data Science', 'AI'], applicationRounds: [{ id: 'cuhksz-ds-r1', name: 'Round 1', openDate: '2026-09-01T00:00:00+08:00', deadline: '2026-11-30T23:59:00+08:00', timezone: 'Asia/Hong_Kong', applicantType: 'INTERNATIONAL', status: 'OPEN', sourceUrl: 'https://sds.cuhk.edu.cn/article/2467', verifiedAt: '2026-10-10T09:42:00+08:00' }, { id: 'cuhksz-ds-r2', name: 'Round 2', openDate: '2026-12-01T00:00:00+08:00', deadline: '2027-02-28T23:59:00+08:00', timezone: 'Asia/Hong_Kong', applicantType: 'INTERNATIONAL', status: 'OPEN', sourceUrl: 'https://sds.cuhk.edu.cn/article/2467', verifiedAt: '2026-10-10T09:42:00+08:00' }], sourceRecords: [], academicRequirements: '计算机、统计或相关背景', languageRequirements: '英文成绩要求待核验', requiredDocuments: ['CV', 'TRANSCRIPT', 'DEGREE_CERTIFICATE', 'PS'], recommendationRequirement: { required: 2 }, essayRequirements: [{ type: 'PERSONAL_STATEMENT', wordLimit: 600 }], notes: 'Demo 数据：提交前再次打开官方页面核验。',
    },
    {
      id: 'program-nus-fintech', universityId: 'nus', universityName: 'National University of Singapore', school: 'School of Computing', programName: '金融科技', degreeName: 'MSc', region: '新加坡', country: '新加坡', city: 'Singapore', intakeYear: 2027, intakeTerm: '秋季', studyMode: '授课型', duration: '1.5年', tuition: '待核验', applicationFee: 'S$100', applicationOpenDate: null, rollingAdmission: false, applicationStatus: 'UNKNOWN', officialProgramUrl: 'https://www.comp.nus.edu.sg/', officialApplicationUrl: 'https://www.comp.nus.edu.sg/', lastVerifiedAt: null, verificationStatus: 'NEEDS_VERIFICATION', tags: ['FinTech', 'Data'], applicationRounds: [], sourceRecords: [{ id: 'source-nus', field: 'applicationRounds', url: 'https://www.comp.nus.edu.sg/', sourceType: 'OFFICIAL_PROGRAM', title: 'Official programme page', valueSnapshot: 'Deadline not captured', verifiedAt: null, verificationStatus: 'NEEDS_VERIFICATION' }], academicRequirements: '待核验', languageRequirements: '待核验', requiredDocuments: ['CV', 'TRANSCRIPT', 'PS'], recommendationRequirement: { required: 2 }, essayRequirements: [{ type: 'PERSONAL_STATEMENT', wordLimit: null }], notes: 'Demo 数据：截止日期未知，不得猜测。',
    },
  ];
  store.programs = programs;
  store.materials = [
    { id: 'mat-cv', type: 'CV', title: '个人简历 · Example Applicant', status: 'CONFIRMED', version: 3, variant: 'FINTECH', fileReference: null, issuedAt: null, expiresAt: null, verified: true, notes: 'Demo metadata only', linkedApplications: ['app-fe', 'app-ds'] },
    { id: 'mat-transcript', type: 'TRANSCRIPT', title: '最新成绩单', status: 'MISSING', version: 0, variant: 'FINAL', fileReference: null, issuedAt: null, expiresAt: null, verified: false, notes: '', linkedApplications: ['app-fe', 'app-ds'] },
    { id: 'mat-example-project', type: 'PROJECT_PROOF', title: 'Example Project 项目说明', status: 'CONFIRMED', version: 1, variant: 'GENERAL', fileReference: null, issuedAt: null, expiresAt: null, verified: true, notes: 'Demo metadata only', linkedApplications: ['app-fe', 'app-ds'] },
  ];
  store.evidence = [{ id: 'evidence-example-project', type: 'PROJECT', title: 'Example Project 项目', organization: 'Example University', role: '项目经理', startDate: null, endDate: null, description: '合成示例：记录需求与实现过程。', responsibilities: ['需求分析', '前后端开发', '数据库与接口设计', '测试与交付'], achievements: ['合成示例：完成项目说明'], metrics: [], skills: ['系统设计', '项目交付'], technologies: ['Python', 'Web'], proofMaterials: ['mat-example-project'], verified: false, notes: 'Synthetic example only; not applicant data' }];
  store.applications = [{ id: 'app-fe', programId: 'program-cuhksz-fintech', targetRoundId: 'cuhksz-fe-r2', status: 'PREPARING', priority: 'HIGH', readinessScore: 46, blockerIds: [], materialLinks: [], essayLinks: [], recommenderLinks: [], portal: { sections: [], paymentStatus: 'NOT_STARTED', submissionStatus: 'NOT_STARTED' }, submission: null, decision: null, notes: '' }, { id: 'app-ds', programId: 'program-cuhksz-data', targetRoundId: 'cuhksz-ds-r1', status: 'PLANNING', priority: 'MEDIUM', readinessScore: 35, blockerIds: [], materialLinks: [], essayLinks: [], recommenderLinks: [], portal: { sections: [], paymentStatus: 'NOT_STARTED', submissionStatus: 'NOT_STARTED' }, submission: null, decision: null, notes: '' }];
  store.essays = [{ id: 'essay-fe-ps', applicationId: 'app-fe', type: 'PERSONAL_STATEMENT', prompt: 'Personal Statement', wordLimit: null, currentVersionId: 'essay-fe-ps-v2', status: 'REVISING', deadline: '2026-10-16T23:59:00+08:00', evidenceIds: ['evidence-example-project'], notes: '' }];
  store.essayVersions = [{ id: 'essay-fe-ps-v2', essayId: 'essay-fe-ps', version: 2, content: '', wordCount: 1028, evidenceIds: ['evidence-example-project'], createdAt: '2026-10-10T09:00:00+08:00', notes: 'Demo version; content is not stored as a real submitted document.' }];
  store.recommenders = [{ id: 'rec-1', name: '待填写推荐人 1', title: '', organization: '', relationship: '', email: '', notes: '' }, { id: 'rec-2', name: '待填写推荐人 2', title: '', organization: '', relationship: '', email: '', notes: '' }];
  store.recommendationRequests = [{ id: 'rr-1', applicationId: 'app-fe', recommenderId: 'rec-1', required: true, invitedAt: null, dueDate: '2026-10-24T23:59:00+08:00', status: 'NOT_REQUESTED', reminderAt: null, submittedAt: null }, { id: 'rr-2', applicationId: 'app-fe', recommenderId: 'rec-2', required: true, invitedAt: null, dueDate: '2026-10-24T23:59:00+08:00', status: 'REQUESTED', reminderAt: '2026-10-18T00:00:00+08:00', submittedAt: null }];
  return store;
}

export function migrateStore(input) {
  if (!input || typeof input !== 'object') throw new Error('Invalid store');
  if (input.schemaVersion === SCHEMA_VERSION) return { ...createEmptyStore(), ...input };
  if (input.schemaVersion === 1) return { ...createEmptyStore(), ...input, schemaVersion: SCHEMA_VERSION };
  throw new Error(`Unsupported schema: ${input.schemaVersion}`);
}

export function exportStore(store) { return JSON.stringify(migrateStore(store), null, 2); }

export function importStore(raw) {
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error('Invalid JSON'); }
  return migrateStore(parsed);
}
