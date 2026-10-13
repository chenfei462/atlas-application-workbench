import test from 'node:test';
test('date-only deadline stays open throughout its official local calendar day',()=>{
 const result=getDeadlineState({rounds:[{id:'date-only',name:'Round',deadline:'2026-11-06',timezone:'Asia/Hong_Kong'}],now:'2026-11-06T14:00:00Z'});
 assert.equal(result.status,'DUE_TODAY');
});
import assert from 'node:assert/strict';
import {
  STATUS,
  getDeadlineState,
  getCurrentRound,
  getNextAvailableRound,
  calculateDaysRemaining,
  calculateApplicationReadiness,
  getApplicationBlockers,
  generateTodayTasks,
  calculateTaskPriority,
  getVerificationState,
  createEmptyStore,
  migrateStore,
  exportStore,
  importStore,
  createDemoStore,
} from '../outputs/domain.js';

const at = '2026-10-11T12:00:00+08:00';
const round = (id, name, deadline, openDate = '2026-09-01T00:00:00+08:00') => ({
  id, name, openDate, deadline, timezone: 'Asia/Hong_Kong', status: 'OPEN', applicantType: 'INTERNATIONAL', sourceUrl: 'https://example.edu/apply',
});

test('selects the active round and next round when round one is closed', () => {
  const rounds = [round('r1', 'Round 1', '2026-10-01T23:59:00+08:00'), round('r2', 'Round 2', '2026-11-06T23:59:00+08:00', '2026-10-02T00:00:00+08:00')];
  assert.equal(getCurrentRound(rounds, at)?.id, 'r2');
  assert.equal(getNextAvailableRound(rounds, at)?.id, 'r2');
  assert.equal(getDeadlineState({ rounds, now: at }).status, STATUS.NEXT_ROUND_AVAILABLE);
});

test('returns closed only after every round has passed', () => {
  const rounds = [round('r1', 'Round 1', '2026-10-01T23:59:00+08:00'), round('r2', 'Round 2', '2026-11-06T23:59:00+08:00')];
  assert.equal(getDeadlineState({ rounds, now: '2026-12-01T00:00:00+08:00' }).status, STATUS.CLOSED);
});

test('supports due today, rolling, and unknown deadlines without guessing', () => {
  assert.equal(getDeadlineState({ rounds: [round('r1', 'Final Round', '2026-10-11T23:59:00+08:00')], now: at }).status, STATUS.DUE_TODAY);
  assert.equal(getDeadlineState({ rounds: [], rollingAdmission: true, now: at }).status, STATUS.ROLLING);
  assert.equal(getDeadlineState({ rounds: [], now: at }).status, STATUS.UNKNOWN);
});

test('calculates days remaining using the source timezone date', () => {
  assert.equal(calculateDaysRemaining('2026-10-18T23:59:00+08:00', at, 'Asia/Hong_Kong'), 7);
});

test('readiness counts required work and ignores missing optional material', () => {
  const result = calculateApplicationReadiness({
    requiredMaterials: [{ id: 'cv', status: 'COMPLETE' }, { id: 'toefl', status: 'MISSING' }],
    optionalMaterials: [{ id: 'award', status: 'MISSING' }],
    essays: [{ status: 'DRAFT' }], recommendations: { required: 2, submitted: 1 },
    portalSections: [{ status: 'COMPLETE' }, { status: 'IN_PROGRESS' }], languageRequirementMet: false,
  });
  assert.equal(result.score, 43);
  assert.equal(result.requiredMaterials.complete, 1);
  assert.equal(result.recommendations.label, '1/2');
});

test('creates explainable blockers for missing language and recommendation', () => {
  const blockers = getApplicationBlockers({ id: 'a1', requiredMaterials: [{ id: 'transcript', title: '成绩单', status: 'MISSING' }], languageRequirementMet: false, recommendations: { required: 2, submitted: 1 }, essays: [{ title: 'PS', status: 'DRAFT' }], portalSections: [] }, { deadline: '2026-10-15T23:59:00+08:00' });
  assert.deepEqual(blockers.map((item) => item.type), ['MISSING_DOCUMENT', 'LANGUAGE_SCORE', 'RECOMMENDATION', 'ESSAY']);
});

test('generates deterministic today tasks and priority scores', () => {
  const tasks = generateTodayTasks([{ id: 'a1', title: '金融工程', priority: 'HIGH', status: 'PREPARING', targetRound: { deadline: '2026-10-15T23:59:00+08:00' }, blockers: [{ type: 'ESSAY', severity: 'HIGH', resolved: false }] }], at);
  assert.equal(tasks[0].source, 'BLOCKER_ENGINE');
  assert.ok(calculateTaskPriority({ dueDate: '2026-10-12T00:00:00+08:00', severity: 'HIGH', applicationPriority: 'HIGH', importance: 'HIGH' }) > 90);
});

test('verification age distinguishes fresh, stale, and unknown', () => {
  assert.equal(getVerificationState('2026-10-10T12:00:00+08:00', at), 'FRESH');
  assert.equal(getVerificationState('2026-08-01T12:00:00+08:00', at), 'STALE');
  assert.equal(getVerificationState(null, at), 'NEEDS_VERIFICATION');
});

test('migrates and round-trips versioned local data', () => {
  const store = createEmptyStore();
  store.applications.push({ id: 'a1', status: 'PLANNING' });
  const imported = importStore(exportStore(store));
  assert.equal(imported.schemaVersion, 2);
  assert.equal(imported.applications[0].id, 'a1');
  assert.throws(() => importStore('{"schemaVersion":99}'), /Unsupported schema/);
});

test('demo store includes multi-round programs and separate applications', () => {
  const store = createDemoStore();
  assert.ok(store.programs[0].applicationRounds.length >= 2);
  assert.ok(store.applications[0].programId);
  assert.notEqual(store.programs[0].id, store.applications[0].id);
});
