import { createDemoStore, createEmptyStore, exportStore, importStore, migrateStore, getDeadlineState, calculateApplicationReadiness, getApplicationBlockers, generateTodayTasks } from './domain.js';

const STORAGE_KEY = 'atlas-store-v2';
let store = loadStore();
const views = [...document.querySelectorAll('.view')];
const navItems = [...document.querySelectorAll('.nav-item')];
const breadcrumb = document.querySelector('#breadcrumb-current');
const viewNames = {overview:'总览', programs:'项目探索', materials:'材料中心', essays:'文书工作台', timeline:'申请进度', execution:'申请执行', profile:'我的画像', sharing:'授权与协作'};
const toast = document.querySelector('#toast');
let toastTimer;

function loadStore() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return createDemoStore();
  try { return migrateStore(JSON.parse(raw)); } catch { showImportError('本地数据格式错误，已保留默认 Demo 数据'); return createDemoStore(); }
}

function persist() {
  store.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function showImportError(message) {
  window.setTimeout(() => showToast(message), 0);
}

function programById(programId) { return store.programs.find((program) => program.id === programId); }
function applicationByProgram(programId) { return store.applications.find((application) => application.programId === programId); }
function refreshDerivedData() {
  store.applications.forEach((application) => {
    const program = programById(application.programId);
    const round = program?.applicationRounds?.find((item) => item.id === application.targetRoundId);
    const linkedMaterials = (store.materials || []).filter((item) => item.linkedApplications?.includes(application.id)).map((item) => ({ id: item.id, type: item.type, title: item.title, status: item.status }));
    const requiredMaterialTypes = (program?.requiredDocuments || []).filter((type) => type !== 'PS' && type !== 'PERSONAL_STATEMENT');
    const materials = requiredMaterialTypes.map((type) => linkedMaterials.find((item) => item.type === type) || { id: `${application.id}-${type}`, type, title: type, status: 'MISSING' });
    const essays = (store.essays || []).filter((item) => item.applicationId === application.id);
    if (program?.essayRequirements?.length && !essays.length) essays.push(...program.essayRequirements.map((item, index) => ({ id: `${application.id}-essay-${index}`, title: item.type || 'Personal Statement', status: 'NOT_STARTED', deadline: round?.deadline })));
    const recs = (store.recommendationRequests || []).filter((item) => item.applicationId === application.id);
    const readiness = calculateApplicationReadiness({ requiredMaterials: materials.filter((item) => program?.requiredDocuments?.includes(item.type) || ['CV', 'TRANSCRIPT', 'DEGREE_CERTIFICATE', 'PS'].some((type) => item.title.includes(type))), essays, recommendations: { required: recs.filter((item) => item.required).length, submitted: recs.filter((item) => item.status === 'SUBMITTED').length }, portalSections: application.portal?.sections || [], languageRequirementMet: false });
    application.readinessScore = readiness.score;
    application.blockers = getApplicationBlockers({ ...application, requiredMaterials: materials, essays, languageRequirementMet: false, recommendations: { required: recs.filter((item) => item.required).length, submitted: recs.filter((item) => item.status === 'SUBMITTED').length } }, { deadline: round?.deadline });
    application.blockerIds = application.blockers.map((blocker) => blocker.id);
  });
  persist();
}

function renderProgramCards() {
  const container = document.querySelector('#programCards');
  if (!container) return;
  container.innerHTML = store.programs.map((program) => {
    const deadline = getDeadlineState({ rounds: program.applicationRounds, rollingAdmission: program.rollingAdmission, applicationOpenDate: program.applicationOpenDate, now: new Date().toISOString() });
    const application = applicationByProgram(program.id);
    const statusLabel = program.verificationStatus === 'VERIFIED' ? '✓ 已核验' : program.verificationStatus === 'CONFLICT' ? '⚠ 来源冲突' : '◷ 待核验';
    const countryClass = program.region === '新加坡' ? 'sg' : 'hk';
    const badgeClass = program.region === '新加坡' ? 'gold' : program.programName.includes('数据') ? 'teal' : 'navy';
    const roundLabel = deadline.currentRound ? `${deadline.currentRound.name} · ${deadline.currentRound.deadline.slice(0, 10)}` : deadline.status === 'ROLLING' ? 'Rolling admission' : '截止日期待核验';
    const actionLabel = application ? '打开申请 →' : '加入申请计划 →';
    return `<article class="program-card ${application ? 'featured' : ''}" data-program-id="${program.id}"><div class="card-top"><span class="country-pill ${countryClass}">${program.region || '未知地区'}</span><span class="verified ${program.verificationStatus === 'VERIFIED' ? '' : 'warning'}">${statusLabel}</span></div><div class="school-line"><span class="school-badge ${badgeClass} large">${(program.universityName || '??').slice(0, 2)}</span><div><h3>${program.programName}</h3><p>${program.universityName} · ${program.school || '学院待填写'}</p></div><span class="score-ring ${application ? '' : 'medium-ring'}">${application?.readinessScore || '—'}<small>${application ? '准备度' : '匹配待算'}</small></span></div><div class="program-meta"><span>${roundLabel}</span><span>${program.applicationFee || '申请费未知'}</span><span>${program.languageRequirements || '语言要求待核验'}</span></div><div class="match-note"><strong>${deadline.status === 'UNKNOWN' ? '需要核验' : deadline.status === 'NEXT_ROUND_AVAILABLE' ? '下一轮可申请' : application ? '申请状态' : '加入后开始评估'}</strong><span>${deadline.message}. ${program.notes || '项目要求和来源将在核验后显示。'}</span></div><div class="card-actions"><button class="text-button program-action">${actionLabel}</button><button class="save-button ${application ? 'saved' : ''}">${application ? '♥' : '♡'}</button></div></article>`;
  }).join('');
}

function showToast(message) {
  document.querySelector('#toastText').textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function showView(view) {
  views.forEach((item) => item.classList.toggle('active', item.id === `view-${view}`));
  navItems.forEach((item) => item.classList.toggle('active', item.dataset.view === view));
  breadcrumb.textContent = viewNames[view] || '总览';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

navItems.forEach((item) => item.addEventListener('click', () => showView(item.dataset.view)));
document.querySelectorAll('[data-view-target]').forEach((item) => item.addEventListener('click', () => showView(item.dataset.viewTarget)));

document.querySelectorAll('.task-card').forEach((task) => task.addEventListener('click', () => {
  task.classList.toggle('done');
  const label = task.querySelector('strong').textContent;
  const taskRecord = store.tasks.find((item) => item.title === label);
  if (taskRecord) taskRecord.status = task.classList.contains('done') ? 'DONE' : 'OPEN';
  persist();
  showToast(task.classList.contains('done') ? `已完成：${label}` : `已恢复：${label}`);
}));

document.querySelectorAll('.program-row').forEach((item) => item.addEventListener('click', () => showToast('已打开项目详情，来源核验信息已准备好')));
document.querySelector('#programCards')?.addEventListener('click', (event) => {
  const action = event.target.closest('.program-action');
  const save = event.target.closest('.save-button');
  const card = event.target.closest('[data-program-id]');
  if (!card) return;
  const program = programById(card.dataset.programId);
  if (action) {
    const existing = applicationByProgram(program.id);
    if (existing) { showToast(`已打开申请：${program.programName}`); return; }
    const round = getDeadlineState({ rounds: program.applicationRounds, rollingAdmission: program.rollingAdmission }).currentRound;
    store.applications.push({ id: `app-${Date.now()}`, programId: program.id, targetRoundId: round?.id || null, status: 'PLANNING', priority: 'MEDIUM', readinessScore: 0, blockerIds: [], materialLinks: [], essayLinks: [], recommenderLinks: [], portal: { sections: [], paymentStatus: 'NOT_STARTED', submissionStatus: 'NOT_STARTED' }, submission: null, decision: null, notes: '' });
    refreshDerivedData(); renderProgramCards(); showToast(`已加入申请计划：${program.programName}`); return;
  }
  if (save) { event.stopPropagation(); showToast('项目收藏状态已保存'); }
});
document.querySelectorAll('.save-button').forEach((item) => item.addEventListener('click', (event) => {
  event.stopPropagation();
  item.classList.toggle('saved');
  item.textContent = item.classList.contains('saved') ? '♥' : '♡';
  showToast(item.classList.contains('saved') ? '已加入我的项目清单' : '已从清单移除');
}));

document.querySelector('#programSearch')?.addEventListener('input', (event) => {
  const query = event.target.value.trim().toLowerCase();
  document.querySelectorAll('.program-card').forEach((card) => {
    card.style.display = card.textContent.toLowerCase().includes(query) ? '' : 'none';
  });
});

document.querySelector('#exportButton')?.addEventListener('click', () => {
  const blob = new Blob([exportStore(store)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = `atlas-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click();
  URL.revokeObjectURL(url); showToast('备份已导出');
});
document.querySelector('#importButton')?.addEventListener('click', () => document.querySelector('#importFile')?.click());
document.querySelector('#importFile')?.addEventListener('change', async (event) => {
  const file = event.target.files?.[0]; if (!file) return;
  try { store = importStore(await file.text()); persist(); showToast('备份已导入，刷新页面查看完整数据'); }
  catch (error) { showToast(error.message === 'Invalid JSON' ? '文件格式错误：不是有效 JSON' : error.message); }
  event.target.value = '';
});

document.querySelectorAll('.filter-chip').forEach((chip) => chip.addEventListener('click', () => {
  document.querySelectorAll('.filter-chip').forEach((item) => item.classList.remove('active'));
  chip.classList.add('active');
  showToast(`筛选：${chip.textContent}`);
}));

document.querySelector('#uploadButton')?.addEventListener('click', () => showToast('当前为本地 metadata 模式：不会上传文件到第三方服务'));
document.querySelector('#newEssayButton')?.addEventListener('click', () => showToast('请选择项目后创建文书'));
document.querySelectorAll('.essay-item').forEach((item) => item.addEventListener('click', () => {
  document.querySelectorAll('.essay-item').forEach((other) => other.classList.remove('active'));
  item.classList.add('active');
  showToast(`已打开：${item.querySelector('strong').textContent}`);
}));

const modalBackdrop = document.querySelector('#modalBackdrop');
const modalFields = { school: document.querySelector('#modalSchoolField'), program: document.querySelector('#modalProgramField'), direction: document.querySelector('#modalDirectionField'), email: document.querySelector('#modalEmailField'), submissionId: document.querySelector('#modalSubmissionIdField'), submissionDate: document.querySelector('#modalSubmissionDateField'), submissionConfirmation: document.querySelector('#modalSubmissionConfirmationField') };
function openModal(title = '邀请一个申请者', body = '生成一个带有方向模板的专属邀请链接，对方注册后即可开始申请画像。') {
  document.querySelector('#modalTitle').textContent = title;
  document.querySelector('#modalBody').textContent = body;
  Object.values(modalFields).forEach((field) => field?.classList.add('hidden'));
  if (title === '添加自定义项目') { modalFields.school?.classList.remove('hidden'); modalFields.program?.classList.remove('hidden'); }
  else if (title === '记录一次提交') { modalFields.submissionId?.classList.remove('hidden'); modalFields.submissionDate?.classList.remove('hidden'); modalFields.submissionConfirmation?.classList.remove('hidden'); }
  else { modalFields.direction?.classList.remove('hidden'); modalFields.email?.classList.remove('hidden'); }
  modalBackdrop.classList.add('open');
}
function closeModal() { modalBackdrop.classList.remove('open'); }
document.querySelector('#shareButton')?.addEventListener('click', () => openModal('邀请一个协作者', '设置对方可以查看的范围和有效期。申请者的完整档案默认保持私密。'));
document.querySelector('#inviteButton')?.addEventListener('click', () => openModal());
document.querySelector('#modalClose')?.addEventListener('click', closeModal);
modalBackdrop?.addEventListener('click', (event) => { if (event.target === modalBackdrop) closeModal(); });
document.querySelector('#generateLink')?.addEventListener('click', () => showToast('邀请链接已生成，可复制发送'));
document.querySelector('#addProgramButton')?.addEventListener('click', () => openModal('添加自定义项目', '先记录项目和来源，再决定是否加入申请计划。'));

document.querySelector('#modalConfirm')?.addEventListener('click', () => {
  const modalTitle = document.querySelector('#modalTitle')?.textContent;
  if (modalTitle === '记录一次提交') {
    const application = store.applications[0];
    if (!application) { closeModal(); showToast('没有可记录的申请'); return; }
    const applicationNumber = document.querySelector('#modalSubmissionId')?.value.trim();
    const submittedAt = document.querySelector('#modalSubmissionDate')?.value;
    if (!applicationNumber || !submittedAt) { showToast('请填写 Application ID 和提交时间'); return; }
    application.status = 'SUBMITTED'; application.submission = { applicationId: application.id, submittedAt: new Date(submittedAt).toISOString(), applicationNumber, confirmationReceived: document.querySelector('#modalSubmissionConfirmation')?.value === 'true', confirmationEmailReference: null, paymentAmount: null, paymentCurrency: null, paymentReceiptReference: null, proofFiles: [], notes: '由申请者手工记录' };
    persist(); closeModal(); showToast('提交凭证已保存，申请状态已更新为已提交'); return;
  }
  if (modalTitle !== '添加自定义项目') { closeModal(); showToast('邀请链接已生成，可复制发送'); return; }
  const universityName = document.querySelector('#modalSchool')?.value.trim();
  const programName = document.querySelector('#modalProgram')?.value.trim();
  if (!universityName || !programName) { showToast('请填写学校和项目名称'); return; }
  const id = `custom-${Date.now()}`;
  store.programs.push({ id, universityId: id, universityName, school: '', programName, degreeName: '待填写', region: '待填写', country: '待填写', city: '待填写', intakeYear: 2027, intakeTerm: '秋季', studyMode: '授课型', duration: '待核验', tuition: 'Unknown', applicationFee: 'Unknown', applicationOpenDate: null, applicationRounds: [], rollingAdmission: false, applicationStatus: 'UNKNOWN', officialProgramUrl: '', officialApplicationUrl: '', sourceRecords: [], lastVerifiedAt: null, verificationStatus: 'NEEDS_VERIFICATION', requiredDocuments: [], recommendationRequirement: { required: 0 }, essayRequirements: [], tags: [], notes: 'User-created project; source verification required.' });
  persist(); renderProgramCards(); closeModal(); showToast('项目已加入：来源待核验');
});

document.querySelectorAll('.material-row').forEach((row) => row.addEventListener('click', () => showToast('材料详情已打开，可调整权限和保存期限')));
document.querySelectorAll('.outline-button, .ghost-button').forEach((button) => button.addEventListener('click', () => showToast('已打开编辑视图')));

document.querySelector('#recordSubmission, #addSubmissionButton')?.addEventListener('click', () => openModal('记录一次提交', '只记录你已经在学校官网完成的动作。Atlas 不会替你提交、绕过验证码或支付。'));
document.querySelector('#remindRecommendation')?.addEventListener('click', () => { store.tasks.push({ id: `manual-${Date.now()}`, source: 'MANUAL', title: '提醒推荐人提交推荐信', status: 'OPEN', dueDate: '2026-10-18T00:00:00+08:00' }); persist(); showToast('提醒任务已加入今天的申请任务'); });
document.querySelector('#manualInbox, #addInboxEvent')?.addEventListener('click', () => showToast('邮件事件暂存为手工记录，未来可接 Gmail'));

refreshDerivedData();
renderProgramCards();
