// QA independent rollback + network-failure gate (t6 part B).
// Proves: (1) a mid-import failure rolls back atomically (no partial rows),
//         (2) an unreachable/erroring endpoint surfaces an error instead of
//             silently losing or duplicating data.
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createClient} from '@supabase/supabase-js';

const gatePath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(gatePath), '..');

const outIndex = process.argv.indexOf('--out');
const outArg = outIndex >= 0 ? process.argv[outIndex + 1] : null;
if (outIndex >= 0 && (!outArg || outArg.startsWith('--'))) throw new Error('--out requires a unique file path');
const reportPath = outArg ? path.resolve(root, outArg) : null;

// This gate imports TypeScript source. Re-run it once through the project's
// existing local tsx dependency when invoked directly with node.
const runningWithTsx = process.env.ATLAS_QA_TSX_REEXEC === '1' || process.execArgv.some(arg => arg.includes('tsx'));
if (!runningWithTsx) {
  const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const child = spawnSync(process.execPath, [tsxCli, gatePath, ...process.argv.slice(2)], {
    cwd: root,
    env: {...process.env, ATLAS_QA_TSX_REEXEC: '1'},
    stdio: 'inherit',
  });
  process.exit(child.status ?? 1);
}

const {buildImportPlan, importBackup, IMPORT_TABLES, sha256} = await import('../src/migration/index.ts');
const status = spawnSync(process.execPath, [path.join(root, 'node_modules/supabase/dist/supabase.js'), 'status', '--output', 'json'], {cwd: root, encoding: 'utf8'});
assert.equal(status.status, 0, 'start local Supabase first');
const s = JSON.parse(status.stdout);
assert.equal(s.API_URL, 'http://127.0.0.1:55421');

const admin = createClient(s.API_URL, s.SERVICE_ROLE_KEY, {auth: {persistSession: false, autoRefreshToken: false}});
const c = createClient(s.API_URL, s.ANON_KEY, {auth: {persistSession: false, autoRefreshToken: false}});
const ok = r => {assert.equal(r.error, null, JSON.stringify(r.error)); return r.data;};
const count = async t => ok(await c.from(t).select('*')).length;
const report = {rollback: null, network: [], cleanup: null, reportPath};
const password = crypto.randomUUID() + 'Aa!';

const signup = ok(await c.auth.signUp({email: `atlas-qa-rollback-${crypto.randomUUID()}@example.invalid`, password}));
assert.ok(signup.session);
const owner = signup.user.id;
const archives = new Set();
const trackArchive = async raw => archives.add(`${owner}/imports/${await sha256(raw)}/source.json`);
const persistReport = async () => {
  if (!reportPath) return;
  await fs.mkdir(path.dirname(reportPath), {recursive: true});
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {encoding: 'utf8', flag: 'wx'});
};

const base = {
  schemaVersion: 3,
  tables: {
    profiles: [{id: owner, display_name: 'QA Rollback', timezone: 'Asia/Hong_Kong'}],
    universities: [{id: 'qb-u', name: 'QA Rollback University'}],
    programs: [{id: 'qb-p', university_id: 'qb-u', program_name: 'QA Rollback MSc', intake_year: 2027}],
  },
};

try {
  // ---------- A) Atomic rollback on a mid-import failure ----------
  // A valid dataset first, so we have a known good baseline.
  const goodRaw = JSON.stringify(base);
  await trackArchive(goodRaw);
  const good = await importBackup(c, goodRaw);
  archives.add(good.archivePath);
  const before = {};
  for (const t of IMPORT_TABLES) before[t] = await count(t);
  const batchesBefore = ok(await c.from('import_batches').select('*')).length;
  assert.equal(before.programs, 1);
  assert.equal(batchesBefore, 1);

  // Now a dataset that is valid through the planner but fails INSIDE the transaction:
  // a late task with an invalid CHECK value. Earlier rows (universities/programs)
  // must not survive the failure.
  const lateRaw = JSON.stringify({
    schemaVersion: 3,
    tables: {
      universities: [{id: 'qb-late-u', name: 'QA Late University'}],
      programs: [{id: 'qb-late-p', university_id: 'qb-late-u', program_name: 'QA Late MSc', intake_year: 2027}],
      tasks: [{id: 'qb-late-t', title: 'Late failure', status: 'INVALID_STATUS'}],
    },
  });
  const latePlan = await buildImportPlan(lateRaw, owner);
  assert.ok(latePlan.counts.universities === 1, 'planner should accept the shape');

  let rollbackError = null;
  try {
    await trackArchive(lateRaw);
    await importBackup(c, lateRaw);
  } catch (e) {
    rollbackError = e;
  }
  assert.ok(rollbackError, 'a mid-import CHECK violation must surface as an error');
  assert.match(rollbackError.message, /Transactional import failed/i, 'error must be the transactional failure');

  const after = {};
  for (const t of IMPORT_TABLES) after[t] = await count(t);
  const batchesAfter = ok(await c.from('import_batches').select('*')).length;

  const drift = IMPORT_TABLES.filter(t => before[t] !== after[t]);
  assert.deepEqual(drift, [], `rollback left partial rows in: ${drift.join(', ')}`);
  assert.equal(batchesAfter, 1, 'failed import must NOT create an import_batch');
  report.rollback = {
    verdict: 'ROLLBACK_PASS',
    error: rollbackError.message,
    rowsAddedDespiteFailure: drift.length,
    importBatchesBefore: batchesBefore,
    importBatchesAfter: batchesAfter,
    evidence: 'no table changed and no import_batch was created, though the payload contained valid universities/programs preceding the failing task',
  };
  console.log('ROLLBACK PASS: mid-import CHECK failure left zero partial rows and no import_batch');

  // ---------- B) Network-failure behaviour ----------
  // B1: unreachable endpoint (dead port). Nothing should be written or duplicated.
  const dead = createClient('http://127.0.0.1:59999', s.ANON_KEY, {auth: {persistSession: false, autoRefreshToken: false}});
  const beforeDead = {};
  for (const t of IMPORT_TABLES) beforeDead[t] = await count(t);

  const deadResult = await dead.from('applications').select('*');
  assert.ok(deadResult.error, 'unreachable endpoint must return an error, not silent empty data');
  report.network.push({
    case: 'unreachable endpoint (port 59999) select',
    surfacedError: true,
    message: String(deadResult.error.message).slice(0, 200),
    data: deadResult.data === null ? 'null' : JSON.stringify(deadResult.data),
  });
  console.log('NETWORK B1 PASS: unreachable endpoint surfaced an error (no silent success)');

  // B2: import against an unreachable endpoint must throw, not silently no-op.
  let deadImportError = null;
  try {
    await trackArchive(goodRaw);
    await importBackup(dead, goodRaw);
  } catch (e) {
    deadImportError = e;
  }
  assert.ok(deadImportError, 'import against a dead endpoint must throw');
  report.network.push({
    case: 'import against unreachable endpoint',
    surfacedError: true,
    message: String(deadImportError.message).slice(0, 200),
  });

  const afterDead = {};
  for (const t of IMPORT_TABLES) afterDead[t] = await count(t);
  const deadDrift = IMPORT_TABLES.filter(t => beforeDead[t] !== afterDead[t]);
  assert.deepEqual(deadDrift, [], `dead-endpoint attempt mutated: ${deadDrift.join(', ')}`);
  report.network.push({
    case: 'no mutation from failed network attempts',
    tablesChanged: deadDrift.length,
  });
  console.log('NETWORK B2 PASS: dead-endpoint import threw and mutated nothing');

  // B3: a failed re-import must not corrupt the good dataset, and a later
  // successful re-import must still be idempotent.
  await trackArchive(goodRaw);
  const again = await importBackup(c, goodRaw);
  assert.equal(again.repeated, true, 're-import after failures must still be recognised as a repeat');
  const afterRecover = {};
  for (const t of IMPORT_TABLES) afterRecover[t] = await count(t);
  const recoverDrift = IMPORT_TABLES.filter(t => before[t] !== afterRecover[t]);
  assert.deepEqual(recoverDrift, [], `recovery re-import changed: ${recoverDrift.join(', ')}`);
  report.network.push({
    case: 'recovery: successful re-import after failures remains idempotent',
    repeated: again.repeated,
    tablesChanged: recoverDrift.length,
  });
  console.log('NETWORK B3 PASS: dataset intact and still idempotent after failures');

  report.verdict = 'ROLLBACK_AND_NETWORK_PASS';
  console.log(JSON.stringify(report, null, 2));
  console.log('\nQA ROLLBACK + NETWORK GATE PASS');
} catch (e) {
  report.fail = e.message;
  report.verdict = 'ROLLBACK_OR_NETWORK_FAIL';
  console.log(JSON.stringify(report, null, 2));
  console.error('QA GATE FAIL: ' + e.message);
  process.exitCode = 1;
} finally {
  const cleanupErrors = [];
  for (const archive of archives) {
    try {
      const result = await c.storage.from('application-documents').remove([archive]);
      if (result.error) cleanupErrors.push(`${archive}: ${result.error.message}`);
    } catch (error) {
      cleanupErrors.push(`${archive}: ${error.message}`);
    }
  }
  try {
    const deleted = await admin.auth.admin.deleteUser(owner);
    if (deleted.error) cleanupErrors.push(`user ${owner}: ${deleted.error.message}`);
  } catch (error) {
    cleanupErrors.push(`user ${owner}: ${error.message}`);
  }
  report.cleanup = cleanupErrors.length
    ? {status: 'FAIL', archivePaths: [...archives], errors: cleanupErrors}
    : {status: 'PASS', archivePaths: [...archives], message: 'generated QA fake user and archive objects removed'};
  if (cleanupErrors.length) process.exitCode = 1;
  try {
    await persistReport();
  } catch (error) {
    process.exitCode = 1;
    console.error('QA REPORT WRITE FAIL: ' + error.message);
  }
  console.log('CLEANUP: ' + JSON.stringify(report.cleanup));
}
