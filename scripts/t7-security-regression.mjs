// T7 independent adversarial RLS + Storage regression.
// Written by the security member; deliberately does NOT reuse scripts/test-local-supabase.mjs
// so that the existing script's PASS cannot launder into this evidence.
//
// Scope: read-only w.r.t. product code. Creates only random fake users and fake objects in the
// local Atlas stack, then deletes them. Never touches a linked/remote target.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(import.meta.dirname, '..');
const binary = path.join(root, 'node_modules/supabase/dist/supabase.js');
const status = spawnSync(process.execPath, [binary, 'status', '--output', 'json'], { cwd: root, encoding: 'utf8' });
if (status.status !== 0) throw new Error('Run npm run db:start first');
const settings = JSON.parse(status.stdout);
const base = settings.API_URL;

// Hard isolation guard: this suite must only ever run against the Atlas local API.
if (base !== 'http://127.0.0.1:55421') throw new Error(`Refusing to run: unexpected API ${base}`);
if (base.includes('supabase.co')) throw new Error('Refusing to run against a hosted Supabase project');

const anon = settings.ANON_KEY;
const admin = settings.SERVICE_ROLE_KEY;
const bucket = 'application-documents';

const failures = [];
const matrix = [];
const notes = [];
const users = [];
const objects = [];
let checks = 0;

function check(label, condition, detail = '') {
  checks++;
  if (!condition) { failures.push(`${label}${detail ? ` :: ${detail}` : ''}`); return false; }
  return true;
}

async function req(route, { token = anon, method = 'GET', body, headers = {}, raw = false } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : (raw ? body : JSON.stringify(body)),
  });
  return response;
}
async function jsonOrNull(route, options = {}) {
  const response = await req(route, options);
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: response.ok, status: response.status, data };
}
async function mustJson(route, options = {}) {
  const result = await jsonOrNull(route, options);
  if (!result.ok) throw new Error(`Request failed ${result.status} ${route}: ${JSON.stringify(result.data)}`);
  return result.data;
}
async function signup(label) {
  const email = `atlas-t7-${label}-${crypto.randomUUID()}@example.invalid`;
  const password = crypto.randomBytes(24).toString('base64url');
  const data = await mustJson('/auth/v1/signup', { method: 'POST', body: { email, password } });
  if (!data.access_token || !data.user?.id) throw new Error(`signup ${label} returned no session`);
  const user = { label, id: data.user.id, token: data.access_token, email, password };
  users.push(user);
  return user;
}
async function insert(table, row, user) {
  const records = await mustJson(`/rest/v1/${table}`, {
    token: user.token, method: 'POST', body: row, headers: { Prefer: 'return=representation' },
  });
  return Array.isArray(records) ? records[0] : records;
}

// ---------------------------------------------------------------------------
// Build a fixture graph owned by A. Column names verified against the live schema.
// ---------------------------------------------------------------------------
try {
  const a = await signup('a');
  const b = await signup('b');
  const owner = a.id;

  await insert('profiles', { id: a.id, display_name: 'T7 Fake Applicant A' }, a);
  await insert('profiles', { id: b.id, display_name: 'T7 Fake Applicant B' }, b);

  const uni = await insert('universities', { owner_id: owner, name: 'T7 Example University' }, a);
  const program = await insert('programs', { owner_id: owner, university_id: uni.id, program_name: 'T7 Example MSc', intake_year: 2027 }, a);
  const round = await insert('application_rounds', { owner_id: owner, program_id: program.id, name: 'T7 Round 1', sort_order: 1, deadline_date: '2027-03-01', deadline_precision: 'DATE_ONLY', timezone: 'Asia/Hong_Kong' }, a);
  const source = await insert('sources', { owner_id: owner, url: 'https://example.edu/t7', source_type: 'USER_INPUT' }, a);
  await insert('source_assertions', { owner_id: owner, source_id: source.id, program_id: program.id, application_round_id: round.id, field_path: 'deadline_date', observed_value: '2027-03-01' }, a);
  const app = await insert('applications', { owner_id: owner, program_id: program.id, target_round_id: round.id, status: 'PREPARING' }, a);

  const mr = await insert('program_material_requirements', { owner_id: owner, program_id: program.id, material_type: 'CV', label: 'CV', source_id: source.id }, a);
  const tr = await insert('program_test_requirements', { owner_id: owner, program_id: program.id, test_type: 'IELTS', source_id: source.id }, a);
  const er = await insert('program_essay_requirements', { owner_id: owner, program_id: program.id, essay_type: 'PS', source_id: source.id }, a);
  const rr = await insert('program_recommendation_requirements', { owner_id: owner, program_id: program.id, required_count: 1, maximum_count: 2 }, a);

  const material = await insert('materials', { owner_id: owner, type: 'CV', title: 'T7 Fake CV' }, a);
  const versionId = crypto.randomUUID();
  const objectPath = `${owner}/materials/${material.id}/${versionId}/t7-fake.pdf`;
  const content = Buffer.from('%PDF-1.4\nAtlas T7 fake security test only\n%%EOF');
  const checksum = crypto.createHash('sha256').update(content).digest('hex');

  const up = await fetch(`${base}/storage/v1/object/${bucket}/${objectPath}`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/pdf', 'x-upsert': 'false' },
    body: content,
  });
  check('A upload own-prefix object', up.ok, `status ${up.status}`);
  objects.push({ object: objectPath, user: a });

  const materialVersion = await insert('material_versions', {
    id: versionId, owner_id: owner, material_id: material.id, version_number: 1,
    storage_path: objectPath, original_filename: 't7-fake.pdf', mime_type: 'application/pdf',
    size_bytes: content.length, sha256: checksum,
  }, a);
  await insert('application_materials', { owner_id: owner, application_id: app.id, requirement_id: mr.id, material_version_id: materialVersion.id, status: 'COMPLETE' }, a);

  const evidence = await insert('evidence_items', { owner_id: owner, type: 'PROJECT', title: 'T7 Fake Project' }, a);
  const essay = await insert('essays', { owner_id: owner, application_id: app.id, program_essay_requirement_id: er.id, type: 'PS' }, a);
  const essayVersion = await insert('essay_versions', { owner_id: owner, essay_id: essay.id, version_number: 1, content: 'T7 fake essay body', word_count: 4 }, a);
  await insert('essay_evidence_links', { owner_id: owner, essay_version_id: essayVersion.id, evidence_item_id: evidence.id }, a);

  const recommender = await insert('recommenders', { owner_id: owner, name: 'T7 Fake Recommender', email: 't7-fake@example.invalid' }, a);
  await insert('recommendation_requests', { owner_id: owner, application_id: app.id, recommender_id: recommender.id }, a);
  await insert('portal_sections', { owner_id: owner, application_id: app.id, section_key: 'education', status: 'COMPLETE', progress_percent: 100 }, a);
  await insert('submissions', { owner_id: owner, application_id: app.id, submitted_at: new Date().toISOString(), application_number: 'T7-FAKE-ONLY', receipt_storage_path: objectPath }, a);
  await insert('decisions', { owner_id: owner, application_id: app.id, type: 'OFFER' }, a);
  await insert('tasks', { owner_id: owner, application_id: app.id, title: 'T7 Fake task' }, a);
  await insert('inbox_items', { owner_id: owner, application_id: app.id, type: 'GENERAL' }, a);
  await insert('import_batches', { owner_id: owner, source_schema_version: 2, checksum }, a);

  // -------------------------------------------------------------------------
  // A) Per-table cross-user isolation matrix.
  // Every table required by the task contract, plus the full owner_id table set.
  // -------------------------------------------------------------------------
  const requiredTables = [
    'profiles', 'universities', 'programs', 'application_rounds', 'source_assertions', 'applications',
    'program_material_requirements', 'program_test_requirements', 'program_essay_requirements',
    'program_recommendation_requirements', 'materials', 'material_versions', 'application_materials',
    'evidence_items', 'essays', 'essay_versions', 'essay_evidence_links', 'recommenders',
    'recommendation_requests', 'portal_sections', 'submissions', 'tasks', 'inbox_items', 'decisions',
    'audit_events',
  ];

  for (const table of requiredTables) {
    const filter = `${table === 'profiles' ? 'id' : 'owner_id'}=eq.${owner}`;
    const row = { ownSelect: false, bSelect: null, bUpdate: null, bDelete: null, anonSelect: null };

    const own = await jsonOrNull(`/rest/v1/${table}?${filter}`, { token: a.token });
    row.ownSelect = Array.isArray(own.data) && own.data.length > 0;
    check(`${table}: A sees own row (fixture present)`, row.ownSelect, JSON.stringify(own.data).slice(0, 160));
    const ownId = Array.isArray(own.data) && own.data[0] ? own.data[0].id : null;

    // B SELECT
    const bSel = await jsonOrNull(`/rest/v1/${table}?${filter}`, { token: b.token });
    row.bSelect = Array.isArray(bSel.data) ? bSel.data.length : `status:${bSel.status}`;
    check(`${table}: B SELECT denied`, Array.isArray(bSel.data) && bSel.data.length === 0, JSON.stringify(bSel.data).slice(0, 160));

    // B UPDATE (attempt to mutate A's row by id — the strongest form of the probe)
    const bUpd = await jsonOrNull(`/rest/v1/${table}?id=eq.${ownId}`, {
      token: b.token, method: 'PATCH', body: { id: ownId }, headers: { Prefer: 'return=representation' },
    });
    row.bUpdate = bUpd.ok ? (Array.isArray(bUpd.data) ? bUpd.data.length : 'ok-nonarray') : `denied:${bUpd.status}`;
    check(`${table}: B UPDATE affects no rows`, !bUpd.ok || (Array.isArray(bUpd.data) && bUpd.data.length === 0), JSON.stringify(bUpd.data).slice(0, 160));

    // B DELETE
    const bDel = await jsonOrNull(`/rest/v1/${table}?id=eq.${ownId}`, {
      token: b.token, method: 'DELETE', headers: { Prefer: 'return=representation' },
    });
    row.bDelete = bDel.ok ? (Array.isArray(bDel.data) ? bDel.data.length : 'ok-nonarray') : `denied:${bDel.status}`;
    check(`${table}: B DELETE affects no rows`, !bDel.ok || (Array.isArray(bDel.data) && bDel.data.length === 0), JSON.stringify(bDel.data).slice(0, 160));

    // A's row still intact after B's attempts
    const after = await jsonOrNull(`/rest/v1/${table}?${filter}`, { token: a.token });
    check(`${table}: A row survives B update+delete`, Array.isArray(after.data) && after.data.length > 0);

    // Anonymous SELECT
    const anonSel = await jsonOrNull(`/rest/v1/${table}?${filter}`);
    row.anonSelect = Array.isArray(anonSel.data) ? anonSel.data.length : `status:${anonSel.status}`;
    check(`${table}: anonymous SELECT denied`, Array.isArray(anonSel.data) && anonSel.data.length === 0, JSON.stringify(anonSel.data).slice(0, 160));

    matrix.push({ table, ...row });
  }

  // -------------------------------------------------------------------------
  // A2) Forged-owner INSERT must be rejected.
  // -------------------------------------------------------------------------
  const spoofInserts = [
    ['universities', { owner_id: owner, name: 'T7 Spoof' }],
    ['programs', { owner_id: owner, university_id: uni.id, program_name: 'T7 Spoof', intake_year: 2027 }],
    ['applications', { owner_id: owner, program_id: program.id, status: 'PREPARING' }],
    ['recommenders', { owner_id: owner, name: 'T7 Spoof Recommender' }],
    ['essays', { owner_id: owner, application_id: app.id, type: 'PS' }],
    ['tasks', { owner_id: owner, application_id: app.id, title: 'T7 Spoof task' }],
    ['materials', { owner_id: owner, type: 'CV', title: 'T7 Spoof material' }],
    ['decisions', { owner_id: owner, application_id: app.id, type: 'OFFER' }],
  ];
  for (const [table, body] of spoofInserts) {
    const attempt = await req(`/rest/v1/${table}`, { token: b.token, method: 'POST', body });
    check(`forged-owner INSERT rejected: ${table}`, !attempt.ok, `status ${attempt.status} (B was allowed to write owner_id=A)`);
  }

  // -------------------------------------------------------------------------
  // A3) Version-row semantics.
  //
  // CORRECTED AFTER INVESTIGATION (see docs/production/09-rls-storage-regression.md):
  // - UPDATE is blocked by the `reject_history_update()` trigger on BOTH version tables
  //   (migration 009, errcode 23514). That is the immutability guarantee.
  // - DELETE is deliberately ALLOWED for the owner (`*_delete_own` policy from migration 006)
  //   and is paired with a SECURITY DEFINER audit trigger that records MATERIAL_VERSION_DELETED.
  //   Version rows are therefore append-history, not delete-proof. Testing "DELETE blocked"
  //   would assert a property the design never claimed.
  // The real invariants: UPDATE blocked, cross-user DELETE affects nothing, DELETE is audited.
  // -------------------------------------------------------------------------
  const essayPatch = await req(`/rest/v1/essay_versions?id=eq.${essayVersion.id}`, { token: a.token, method: 'PATCH', body: { content: 'T7 tampered' } });
  check('essay_versions UPDATE blocked (history immutable, even for owner)', !essayPatch.ok, `status ${essayPatch.status}`);
  const mvPatch = await req(`/rest/v1/material_versions?id=eq.${materialVersion.id}`, { token: a.token, method: 'PATCH', body: { original_filename: 't7-tampered.pdf' } });
  check('material_versions UPDATE blocked (history immutable, even for owner)', !mvPatch.ok, `status ${mvPatch.status}`);

  // Cross-user DELETE on a version row must be a no-op (B is not the owner).
  const mvDelByB = await jsonOrNull(`/rest/v1/material_versions?id=eq.${materialVersion.id}`, {
    token: b.token, method: 'DELETE', headers: { Prefer: 'return=representation' },
  });
  check('material_versions: cross-user DELETE affects no rows', !mvDelByB.ok || (Array.isArray(mvDelByB.data) && mvDelByB.data.length === 0), JSON.stringify(mvDelByB.data).slice(0, 160));
  const mvStillThere = await jsonOrNull(`/rest/v1/material_versions?id=eq.${materialVersion.id}`, { token: a.token });
  check('material_versions: row survives cross-user DELETE', Array.isArray(mvStillThere.data) && mvStillThere.data.length === 1);

  const evDelByB = await jsonOrNull(`/rest/v1/essay_versions?id=eq.${essayVersion.id}`, {
    token: b.token, method: 'DELETE', headers: { Prefer: 'return=representation' },
  });
  check('essay_versions: cross-user DELETE affects no rows', !evDelByB.ok || (Array.isArray(evDelByB.data) && evDelByB.data.length === 0), JSON.stringify(evDelByB.data).slice(0, 160));
  const evStillThere = await jsonOrNull(`/rest/v1/essay_versions?id=eq.${essayVersion.id}`, { token: a.token });
  check('essay_versions: row survives cross-user DELETE', Array.isArray(evStillThere.data) && evStillThere.data.length === 1);

  // -------------------------------------------------------------------------
  // A4) audit_events: trigger-generated, not client-writable.
  //
  // CORRECTED AFTER INVESTIGATION: PostgREST returns 204 for PATCH/DELETE that match ZERO
  // rows (RLS filters them out) — a 204 is NOT proof of a successful write. Asserting
  // "!response.ok" was wrong. The authoritative checks are:
  //   (a) the rows are unchanged afterwards, and
  //   (b) a direct DB-level probe raises a real RLS violation (recorded separately).
  // -------------------------------------------------------------------------
  const auditRead = await jsonOrNull(`/rest/v1/audit_events?owner_id=eq.${owner}`, { token: a.token });
  const auditCount = Array.isArray(auditRead.data) ? auditRead.data.length : 0;
  check('audit_events are trigger-generated for A', auditCount > 0, `rows=${auditCount}`);

  // Client INSERT must not create a row.
  await req('/rest/v1/audit_events', { token: a.token, method: 'POST', body: { owner_id: owner, entity_type: 't7', entity_id: crypto.randomUUID(), action: 'T7_FORGED' } });
  const afterInsert = await jsonOrNull(`/rest/v1/audit_events?action=eq.T7_FORGED`, { token: a.token });
  check('audit_events client INSERT creates no row', Array.isArray(afterInsert.data) && afterInsert.data.length === 0, JSON.stringify(afterInsert.data).slice(0, 160));

  // Client UPDATE must not change any row.
  await req(`/rest/v1/audit_events?owner_id=eq.${owner}`, { token: a.token, method: 'PATCH', body: { action: 'T7_TAMPER' } });
  const afterUpdate = await jsonOrNull(`/rest/v1/audit_events?action=eq.T7_TAMPER`, { token: a.token });
  check('audit_events client UPDATE changes no row', Array.isArray(afterUpdate.data) && afterUpdate.data.length === 0, JSON.stringify(afterUpdate.data).slice(0, 160));

  // Client DELETE must not remove any row.
  const beforeDeleteCount = (await jsonOrNull(`/rest/v1/audit_events?owner_id=eq.${owner}`, { token: a.token })).data?.length ?? 0;
  await req(`/rest/v1/audit_events?owner_id=eq.${owner}`, { token: a.token, method: 'DELETE' });
  const afterDeleteCount = (await jsonOrNull(`/rest/v1/audit_events?owner_id=eq.${owner}`, { token: a.token })).data?.length ?? 0;
  check('audit_events client DELETE removes no row', afterDeleteCount === beforeDeleteCount && beforeDeleteCount > 0, `${beforeDeleteCount} -> ${afterDeleteCount}`);

  const auditB = await jsonOrNull(`/rest/v1/audit_events?owner_id=eq.${owner}`, { token: b.token });
  check('audit_events cross-user SELECT denied', Array.isArray(auditB.data) && auditB.data.length === 0);
  const auditAnon = await jsonOrNull(`/rest/v1/audit_events?owner_id=eq.${owner}`);
  check('audit_events anonymous SELECT denied', Array.isArray(auditAnon.data) && auditAnon.data.length === 0);

  // -------------------------------------------------------------------------
  // B) Storage regression.
  //
  // ORDERING NOTE: the metadata-survival check must run BEFORE the version-row deletion
  // tests, because the owner legitimately CAN delete a version row (delete-own policy).
  // Running it later measured my own earlier delete, not a missing-object defect.
  // -------------------------------------------------------------------------
  const dlA = await req(`/storage/v1/object/authenticated/${bucket}/${objectPath}`, { token: a.token });
  check('storage: A downloads own object', dlA.ok, `status ${dlA.status}`);
  const dlBytes = Buffer.from(await dlA.arrayBuffer());
  check('storage: A download checksum matches', crypto.createHash('sha256').update(dlBytes).digest('hex') === checksum);

  const dlB = await req(`/storage/v1/object/authenticated/${bucket}/${objectPath}`, { token: b.token });
  check('storage: B download of A object DENIED', !dlB.ok, `status ${dlB.status}`);
  const dlAnon = await req(`/storage/v1/object/authenticated/${bucket}/${objectPath}`, { token: anon });
  check('storage: anonymous download DENIED', !dlAnon.ok, `status ${dlAnon.status}`);

  const listB = await jsonOrNull(`/storage/v1/object/list/${bucket}`, { token: b.token, method: 'POST', body: { prefix: `${owner}/materials/${material.id}`, limit: 100 } });
  check('storage: B list cannot see A objects', Array.isArray(listB.data) && listB.data.length === 0, JSON.stringify(listB.data).slice(0, 160));

  const upB = await fetch(`${base}/storage/v1/object/${bucket}/${owner}/t7-spoof.pdf`, {
    method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${b.token}`, 'Content-Type': 'application/pdf', 'x-upsert': 'false' }, body: content,
  });
  check('storage: B upload into A prefix DENIED', !upB.ok, `status ${upB.status}`);

  const putB = await fetch(`${base}/storage/v1/object/${bucket}/${objectPath}`, {
    method: 'PUT', headers: { apikey: anon, Authorization: `Bearer ${b.token}`, 'Content-Type': 'application/pdf' }, body: Buffer.from('T7 tampered'),
  });
  check('storage: B update of A object DENIED', !putB.ok, `status ${putB.status}`);

  const delB = await jsonOrNull(`/storage/v1/object/${bucket}`, { token: b.token, method: 'DELETE', body: { prefixes: [objectPath] } });
  const stillThere = await req(`/storage/v1/object/authenticated/${bucket}/${objectPath}`, { token: a.token });
  check('storage: B delete of A object no-op (file survives)', stillThere.ok, `B delete status ${delB.status}`);
  if (stillThere.ok) {
    check('storage: A file unchanged after B delete attempt', crypto.createHash('sha256').update(Buffer.from(await stillThere.arrayBuffer())).digest('hex') === checksum);
  }

  // Signed URL current -> PASS, expired -> DENIED
  const sign = await mustJson(`/storage/v1/object/sign/${bucket}/${objectPath}`, { token: a.token, method: 'POST', body: { expiresIn: 2 } });
  const signed = sign.signedURL ?? sign.signedUrl;
  check('storage: signed URL issued', Boolean(signed));
  if (signed) {
    const signedUrl = signed.startsWith('http') ? signed : `${base}/storage/v1${signed}`;
    const fresh = await fetch(signedUrl);
    check('storage: current signed URL works', fresh.ok, `status ${fresh.status}`);
    await new Promise((resolve) => setTimeout(resolve, 4000));
    const expired = await fetch(signedUrl, { headers: { 'Cache-Control': 'no-cache' } });
    check('storage: EXPIRED signed URL denied', !expired.ok, `status ${expired.status}`);
    const expiredAnon = await fetch(`${signedUrl}`, { headers: { apikey: anon, 'Cache-Control': 'no-cache' } });
    check('storage: expired signed URL denied even with apikey', !expiredAnon.ok, `status ${expiredAnon.status}`);
  }

  // Delete/recovery compensation: deleting the OBJECT (not the metadata row) must leave
  // metadata intact so a MISSING_STORAGE_OBJECT is detectable by the integrity checker.
  await jsonOrNull(`/storage/v1/object/${bucket}`, { token: a.token, method: 'DELETE', body: { prefixes: [objectPath] } });
  const gone = await req(`/storage/v1/object/authenticated/${bucket}/${objectPath}`, { token: a.token });
  check('storage: owner delete removes object bytes', !gone.ok, `status ${gone.status}`);
  const metaSurvives = await jsonOrNull(`/rest/v1/material_versions?id=eq.${versionId}`, { token: a.token });
  check('storage: metadata row survives OBJECT deletion (missing-object detectable)', Array.isArray(metaSurvives.data) && metaSurvives.data.length === 1, JSON.stringify(metaSurvives.data).slice(0, 160));

  // Restore the bytes and confirm checksum round-trips.
  const reUp = await fetch(`${base}/storage/v1/object/${bucket}/${objectPath}`, {
    method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/pdf', 'x-upsert': 'true' }, body: dlBytes,
  });
  check('storage: recovery re-upload succeeds', reUp.ok, `status ${reUp.status}`);
  const recovered = await req(`/storage/v1/object/authenticated/${bucket}/${objectPath}`, { token: a.token });
  if (recovered.ok) {
    check('storage: recovered checksum matches original', crypto.createHash('sha256').update(Buffer.from(await recovered.arrayBuffer())).digest('hex') === checksum);
  }

  // -------------------------------------------------------------------------
  // A5) Account deletion cascade (uses the admin API; cleans B up as part of the test).
  // -------------------------------------------------------------------------
  const beforeDelete = await jsonOrNull(`/rest/v1/universities?owner_id=eq.${b.id}`, { token: b.token });
  notes.push(`B owned ${Array.isArray(beforeDelete.data) ? beforeDelete.data.length : 'n/a'} universities before deletion`);
  const delResp = await fetch(`${base}/auth/v1/admin/users/${b.id}`, { method: 'DELETE', headers: { apikey: admin, Authorization: `Bearer ${admin}` } });
  check('account deletion cascade succeeds', delResp.ok, `status ${delResp.status}`);
  const bAfter = await jsonOrNull(`/rest/v1/profiles?id=eq.${b.id}`, { token: a.token });
  check('deleted account leaves no readable profile', Array.isArray(bAfter.data) && bAfter.data.length === 0);
  const bTokenAfter = await jsonOrNull('/rest/v1/applications', { token: b.token });
  check('deleted account token no longer resolves rows', !bTokenAfter.ok || (Array.isArray(bTokenAfter.data) && bTokenAfter.data.length === 0), `status ${bTokenAfter.status}`);

  // -------------------------------------------------------------------------
  // A6) DB-level RLS probe: authoritative proof that RLS (not merely a 204) rejects writes.
  //     PostgREST can return 204 for zero-row matches, so this bypasses REST entirely.
  // -------------------------------------------------------------------------
  const probeSql = `
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"${owner}","role":"authenticated"}';
insert into public.audit_events (owner_id, entity_type, entity_id, action)
values ('${owner}', 't7', '${crypto.randomUUID()}', 'T7_DB_PROBE');
rollback;
`;
  const dbName = 'supabase_db_atlas-local-01a12938';
  fs.writeFileSync(path.join(root, 'work/t7-db-probe.sql'), probeSql);
  const cp = spawnSync('docker', ['cp', path.join(root, 'work/t7-db-probe.sql'), `${dbName}:/tmp/t7-db-probe.sql`], { encoding: 'utf8' });
  const probe = spawnSync('docker', ['exec', dbName, 'psql', '-U', 'postgres', '-d', 'postgres', '-f', '/tmp/t7-db-probe.sql'], { encoding: 'utf8' });
  const probeOut = `${probe.stdout ?? ''}${probe.stderr ?? ''}`;
  check('DB-level probe: authenticated INSERT into audit_events raises RLS violation',
    /violates row-level security policy/.test(probeOut), `copy=${cp.status} probe=${probe.status} out=${probeOut.slice(0, 200)}`);

  const report = {
    generatedAt: new Date().toISOString(),
    suite: 'T7 independent adversarial RLS + Storage regression',
    api: base,
    isolationGuard: 'refuses to run unless API === http://127.0.0.1:55421',
    checksRun: checks,
    failures,
    status: failures.length === 0 ? 'T7_SECURITY_PASS' : 'T7_SECURITY_FAIL',
    notes,
    perTableMatrix: matrix,
  };
  fs.writeFileSync(path.join(root, 'work/t7-security-matrix.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, checksRun: checks, failures: failures.length }, null, 2));
  if (failures.length) {
    console.error('\nFAILURES:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log(`T7 SECURITY PASS: ${checks} assertions across ${matrix.length} tables; see work/t7-security-matrix.json`);
  }
} finally {
  // Cleanup: remove fake objects then fake users (B may already be gone via the cascade test).
  for (const { object, user } of objects) {
    try {
      await fetch(`${base}/storage/v1/object/${bucket}`, {
        method: 'DELETE',
        headers: { apikey: anon, Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: [object] }),
      });
    } catch {}
  }
  for (const user of users) {
    try {
      await fetch(`${base}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: { apikey: admin, Authorization: `Bearer ${admin}` } });
    } catch {}
  }
  try {
    const remaining = await fetch(`${base}/auth/v1/admin/users`, { headers: { apikey: admin, Authorization: `Bearer ${admin}` } });
    const list = await remaining.json();
    const strays = (list.users ?? []).filter((u) => u.email?.startsWith('atlas-t7-'));
    console.log(`CLEANUP: ${strays.length} stray atlas-t7 users remain`);
    if (strays.length) process.exitCode = 1;
  } catch (error) {
    console.log(`CLEANUP: could not verify (${error.message})`);
  }
}
