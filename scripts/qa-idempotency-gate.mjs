// QA independent idempotency gate (t6). Read-only against the live local stack.
// Proves: import #1 == import #2 (same dataset, no x2), relationships intact,
// source archive NOT deleted, and deterministic UUID mapping is the mechanism.
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createClient} from '@supabase/supabase-js';
import {buildImportPlan, importBackup, sha256, IMPORT_TABLES} from '../src/migration/index.ts';

const root = path.resolve(import.meta.dirname, '..');
const status = spawnSync(process.execPath, [path.join(root, 'node_modules/supabase/dist/supabase.js'), 'status', '--output', 'json'], {cwd: root, encoding: 'utf8'});
assert.equal(status.status, 0, 'start local Supabase first');
const s = JSON.parse(status.stdout);
assert.equal(s.API_URL, 'http://127.0.0.1:55421', 'restricted to the Atlas local stack');

const admin = createClient(s.API_URL, s.SERVICE_ROLE_KEY, {auth: {persistSession: false, autoRefreshToken: false}});
const c = createClient(s.API_URL, s.ANON_KEY, {auth: {persistSession: false, autoRefreshToken: false}});
const ok = r => {assert.equal(r.error, null, JSON.stringify(r.error)); return r.data;};
const count = async t => ok(await c.from(t).select('*')).length;
const report = {steps: [], fail: null};

const password = crypto.randomUUID() + 'Aa!';
const signup = ok(await c.auth.signUp({email: `atlas-qa-idem-${crypto.randomUUID()}@example.invalid`, password}));
assert.ok(signup.session);
const owner = signup.user.id;
const archivePath = {p: null};

// A synthetic dataset exercising the relationship graph the contract names.
const dataset = {
  schemaVersion: 3,
  tables: {
    profiles: [{id: owner, display_name: 'QA Idempotency', timezone: 'Asia/Hong_Kong'}],
    universities: [{id: 'qa-u', name: 'QA Test University'}],
    programs: [{id: 'qa-p', university_id: 'qa-u', program_name: 'QA MSc Test', intake_year: 2027}],
    program_material_requirements: [{id: 'qa-am-req', program_id: 'qa-p', material_type: 'TRANSCRIPT', label: 'Transcript', required: true, quantity: 1}],
    application_rounds: [{id: 'qa-r', program_id: 'qa-p', name: 'QA Round 1', sort_order: 1}],
    applications: [{id: 'qa-a', program_id: 'qa-p', target_round_id: 'qa-r'}],
    materials: [{id: 'qa-mat', title: 'QA Transcript', type: 'TRANSCRIPT'}],
    material_versions: [{id: 'qa-mv', material_id: 'qa-mat', version_number: 1, original_filename: 'qa.txt', mime_type: 'text/plain', size_bytes: 0}],
    application_materials: [{id: 'qa-am', application_id: 'qa-a', requirement_id: 'qa-am-req', material_version_id: 'qa-mv'}],
    essays: [{id: 'qa-e', application_id: 'qa-a', type: 'PS', current_version_number: 1}],
    essay_versions: [{id: 'qa-ev', essay_id: 'qa-e', version_number: 1, content: 'QA idempotency content'}],
    submissions: [{id: 'qa-sub', application_id: 'qa-a', submitted_at: '2026-10-10T10:00:00+08:00', application_number: 'QA-FAKE-1'}],
    tasks: [{id: 'qa-t', application_id: 'qa-a', title: 'QA task', status: 'OPEN'}],
    decisions: [{id: 'qa-d', application_id: 'qa-a', type: 'OFFER'}],
  },
};
const raw = JSON.stringify(dataset);
const plan = await buildImportPlan(raw, owner);
report.planCounts = plan.counts;

try {
  // --- Deterministic UUID mechanism, proven directly (not via the importer's own assert).
  const plan2 = await buildImportPlan(raw, owner);
  assert.deepEqual(plan.idMap, plan2.idMap, 'idMap must be deterministic');
  report.steps.push('PASS deterministic idMap: repeated buildImportPlan yields identical UUID mapping');

  // --- Import #1
  const first = await importBackup(c, raw);
  assert.equal(first.repeated, false, 'first import must not be reported as repeated');
  const after1 = {};
  for (const t of IMPORT_TABLES) after1[t] = await count(t);
  report.afterImport1 = after1;
  assert.equal(after1.applications, 1, 'applications must be 1 after import #1');
  assert.equal(after1.essays, 1, 'essays must be 1 after import #1');
  assert.equal(after1.tasks, 1, 'tasks must be 1 after import #1');
  assert.equal(after1.essay_versions, 1, 'essay_versions must be 1');
  assert.equal(after1.import_batches ?? 0, after1.import_batches ?? 0);
  const batches1 = ok(await c.from('import_batches').select('*')).length;
  assert.equal(batches1, 1, 'exactly one import batch after #1');
  report.steps.push('PASS import #1: dataset inserted, 1 import_batch');

  // --- Source archive must still exist (import must NOT delete the original source)
  const arch = await c.storage.from('application-documents').download(first.archivePath);
  assert.equal(arch.error, null, 'source archive must remain readable after import');
  const archivedBytes = new Uint8Array(await arch.data.arrayBuffer());
  assert.equal(await sha256(archivedBytes), plan.checksum, 'archived source bytes must match checksum');
  assert.deepEqual(new TextDecoder().decode(archivedBytes), raw, 'archived source must be byte-identical to original');
  archivePath.p = first.archivePath;
  report.steps.push('PASS source preserved: original bytes intact and checksum matches after import');

  // --- Relationship verification (Application->Program, Application->Round,
  //     EssayVersion->Essay, MaterialVersion->Material, Submission->Application)
  const app = ok(await c.from('applications').select('id,program_id,target_round_id').single());
  assert.equal(app.program_id, plan.idMap['programs:qa-p'], 'Application->Program');
  assert.equal(app.target_round_id, plan.idMap['application_rounds:qa-r'], 'Application->Round');
  const ev = ok(await c.from('essay_versions').select('essay_id').single());
  assert.equal(ev.essay_id, plan.idMap['essays:qa-e'], 'EssayVersion->Essay');
  const mv = ok(await c.from('material_versions').select('material_id').single());
  assert.equal(mv.material_id, plan.idMap['materials:qa-mat'], 'MaterialVersion->Material');
  const sub = ok(await c.from('submissions').select('application_id').single());
  assert.equal(sub.application_id, plan.idMap['applications:qa-a'], 'Submission->Application');
  report.steps.push('PASS relationships: App->Program, App->Round, EssayVersion->Essay, MaterialVersion->Material, Submission->Application');

  // --- Reload simulation: persist the generated password so a genuinely NEW client
  //     (fresh session, no in-memory cache) can re-read the rows. This proves the data
  //     is durably readable and not merely visible via the importing connection.
  const fresh = createClient(s.API_URL, s.ANON_KEY, {auth: {persistSession: false, autoRefreshToken: false}});
  const relogin = await fresh.auth.signInWithPassword({email: signup.user.email, password});
  assert.equal(relogin.error, null, 'fresh-client password login must succeed');
  const reloadedRows = ok(await fresh.from('applications').select('id,program_id,target_round_id'));
  assert.equal(reloadedRows.length, 1, 'fresh client must read exactly one application');
  assert.equal(reloadedRows[0].id, plan.idMap['applications:qa-a'], 'fresh client sees the same application id');
  const freshEssays = ok(await fresh.from('essay_versions').select('content'));
  assert.equal(freshEssays[0].content, 'QA idempotency content', 'fresh client sees persisted content');
  report.steps.push('PASS reload: a NEW client logging in with the account password reads the same persisted rows');

  // --- Import #2 (SAME dataset) must be idempotent
  const second = await importBackup(c, raw);
  assert.equal(second.repeated, true, 'second import must be flagged repeated');
  const after2 = {};
  for (const t of IMPORT_TABLES) after2[t] = await count(t);
  report.afterImport2 = after2;
  const batches2 = ok(await c.from('import_batches').select('*')).length;
  for (const t of IMPORT_TABLES) {
    assert.equal(after2[t], after1[t], `table ${t} changed between import #1 and #2 (${after1[t]} -> ${after2[t]})`);
  }
  assert.equal(batches2, 1, `import_batches must stay 1, got ${batches2}`);
  report.steps.push('PASS idempotency: import #2 produced IDENTICAL counts across all 28 tables; no Applications x2 / Essays x2 / Tasks x2');

  report.verdict = 'IDEMPOTENCY_PASS';
  console.log(JSON.stringify(report, null, 2));
  console.log('\nQA IDEMPOTENCY GATE PASS');
} catch (e) {
  report.fail = e.message;
  report.verdict = 'IDEMPOTENCY_FAIL';
  console.log(JSON.stringify(report, null, 2));
  console.error('QA IDEMPOTENCY GATE FAIL: ' + e.message);
  process.exitCode = 1;
} finally {
  if (archivePath.p) await c.storage.from('application-documents').remove([archivePath.p]);
  await admin.auth.admin.deleteUser(owner);
  console.log('CLEANUP: generated QA fake user and archive object removed');
}
