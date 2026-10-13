// M23 Full-Flow Harness
// Features: program -> round -> application -> material/version -> evidence -> essay/version -> recommender/request -> portal -> task -> submission -> decision
// Also tests: refresh read, re-login read, cross-user denial, cleanup.

import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const binary = path.join(root, 'node_modules/supabase/dist/supabase.js');
const status = spawnSync(process.execPath, [binary, 'status', '--output', 'json'], { cwd: root, encoding: 'utf8' });
if (status.status !== 0) throw new Error('Run npm run db:start first');
const settings = JSON.parse(status.stdout);
const base = settings.API_URL;
assert.equal(base, 'http://127.0.0.1:55421', 'Integration tests are restricted to Atlas local API');
const anon = settings.ANON_KEY;
const admin = settings.SERVICE_ROLE_KEY;
const bucket = 'application-documents';
const users = [];
const objects = [];

function sanitize(str) {
  return crypto.scryptSync(str, 'salt', 32).toString('hex');
}

async function request(route, { token = anon, method = 'GET', body, headers = {} } = {}) {
  return fetch(`${base}${route}`, {
    method,
    headers: {
     apikey: anon,
      Authorization: `Bearer ${token}`,
      ... (body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ... headers
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function json(route, options = {}) {
  const response = await request(route, options);
  const raw = await response.text();
  const data = raw ? JSON.parse(raw) : null;
  assert.ok(response.ok, `Request failed ${response.status}: ${route}: ${JSON.stringify(data)}`);
  return data;
}

async function signup() {
  const email = `m23-${crypto.randomUUID()}@example.invalid`;
  const password = crypto.randomBytes(24).toString('base64url');
  const data = await json('/auth/v1/signup', { method: 'POST', body: { email, password } });
  assert.ok(data.access_token && data.user.id, 'Local signup must return a session');
  const user = { id: data.user.id, token: data.access_token, email, password };
  users.push(user);
  return user;
}

async function insert(table, row, user) {
  const records = await json(`/rest/v1/${table}`, {
    token: user.token,
    method: 'POST',
    body: row,
    headers: { Prefer: 'return=representation' }
  });
  assert.equal(records.length, 1);
  return records[0];
}

async function upload(object, user, content) {
  const response = await fetch(`${base}/storage/v1/object/${bucket}/${object}`, {
    method: 'POST',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${user.token}`,
      'Content-Type': 'application/pdf',
      'x-upsert': 'false'
    },
    body: content
  });
  assert.ok(response.ok, `Upload failed: ${response.status}`);
}

async function remove(object, user) {
  await json(`/storage/v1/object/${bucket}`, {
    token: user.token,
    method: 'DELETE',
    body: { prefixes: [object] }
  });
}

try {
  const a = await signup();
  const b = await signup();
  const owner_id = a.id;

  // 1. Create university (required foreign key)
  const university = await insert('universities', {
    owner_id,
    name: 'M23 Example University'
  }, a);

  // 2. Create program
  const program = await insert('programs', {
    owner_id,
    university_id: university.id,
    program_name: 'M23 Full-Flow MSc',
    intake_year: 2027
  }, a);

  // 2. Create round
  const round = await insert('application_rounds', {
    owner_id,
    program_id: program.id,
    name: 'Round 1',
    sort_order: 1,
    deadline_date: '2027-01-20',
    deadline_precision: 'DATE_ONLY',
    timezone: 'Asia/Hong_Kong'
  }, a);

  // 3. Create application
  const application = await insert('applications', {
    owner_id,
    program_id: program.id,
    target_round_id: round.id,
    status: 'PREPARING'
  }, a);

  // 5. Create source and program material requirement
  const source = await insert('sources', {
    owner_id,
    url: 'https://example.edu/program',
    source_type: 'USER_INPUT'
  }, a);

  const materialRequirement = await insert('program_material_requirements', {
    owner_id,
    program_id: program.id,
    material_type: 'PS',
    label: 'Personal Statement',
    source_id: source.id
  }, a);

  // 6. Create material and version
  const material = await insert('materials', {
    owner_id,
    type: 'PS',
    title: 'Personal Statement'
  }, a);

  const versionId = crypto.randomUUID();
  const object = `${a.id}/materials/${material.id}/${versionId}/ps.pdf`;
  const content = Buffer.from('%PDF-1.4\nM23 Full-Flow Draft\n%%EOF');
  const checksum = crypto.createHash('sha256').update(content).digest('hex');
  await upload(object, a, content);
  objects.push({ object, user: a });

  const version = await insert('material_versions', {
    id: versionId,
    owner_id,
    material_id: material.id,
    version_number: 1,
    storage_path: object,
    original_filename: 'ps.pdf',
    mime_type: 'application/pdf',
    size_bytes: content.length,
    sha256: checksum
  }, a);

  // 7. Create link to application material using correct requirement_id
  await insert('application_materials', {
    owner_id,
    application_id: application.id,
    requirement_id: materialRequirement.id,
    material_version_id: version.id,
    status: 'COMPLETE'
  }, a);

  // 6. Create evidence item
  const evidence = await insert('evidence_items', {
    owner_id,
    type: 'PROJECT',
    title: 'M23 Research Project'
  }, a);

  // 7. Create essay and version
  const er = await insert('program_essay_requirements', {
    owner_id,
    program_id: program.id,
    essay_type: 'PS',
    source_id: null
  }, a);

  const essay = await insert('essays', {
    owner_id,
    application_id: application.id,
    program_essay_requirement_id: er.id,
    type: 'PS'
  }, a);

  const essayVersionId = crypto.randomUUID();
  const essayVersion = await insert('essay_versions', {
    id: essayVersionId,
    owner_id,
    essay_id: essay.id,
    version_number: 1,
    content: 'Full-flow essay content here...',
    word_count: 150
  }, a);

  // Link evidence to essay version
  await insert('essay_evidence_links', {
    owner_id,
    essay_version_id: essayVersionId,
    evidence_item_id: evidence.id
  }, a);

  // 8. Create recommender and request
  const recommender = await insert('recommenders', {
    owner_id,
    name: 'Dr. Jane Smith',
    email: 'jane.smith@example.edu'
  }, a);

  const rr = await insert('recommendation_requests', {
    owner_id,
    application_id: application.id,
    recommender_id: recommender.id
  }, a);

  // 9. Create portal section
  await insert('portal_sections', {
    owner_id,
    application_id: application.id,
    section_key: 'education',
    status: 'COMPLETE',
    progress_percent: 100
  }, a);

  // 10. Create task
  await insert('tasks', {
    owner_id,
    application_id: application.id,
    title: 'Submit final documents'
  }, a);

  // 11. Create submission
  await insert('submissions', {
    owner_id,
    application_id: application.id,
    submitted_at: new Date().toISOString(),
    application_number: 'M23-FULL-FLOW',
    receipt_storage_path: object
  }, a);

  // 12. Create decision
  await insert('decisions', {
    owner_id,
    application_id: application.id,
    type: 'OFFER'
  }, a);

    // Verify complete chain exists with initial user
  assert.equal((await json('/rest/v1/programs', { token: a.token, method: 'GET' }))
    .filter(p => p.id === program.id).length, 1, 'program exists');
  assert.equal((await json('/rest/v1/application_rounds', { token: a.token, method: 'GET' }))
    .filter(r => r.id === round.id).length, 1, 'round exists');
  assert.equal((await json('/rest/v1/applications', { token: a.token, method: 'GET' }))
    .filter(a => a.id === application.id).length, 1, 'application exists');
  assert.equal((await json('/rest/v1/materials', { token: a.token, method: 'GET' }))
    .filter(m => m.id === material.id).length, 1, 'material exists');
  assert.equal((await json('/rest/v1/material_versions', { token: a.token, method: 'GET' }))
    .filter(v => v.id === version.id).length, 1, 'material_version exists');
  assert.equal((await json('/rest/v1/application_materials', { token: a.token, method: 'GET' }))
    .filter(am => am.material_version_id === version.id).length, 1, 'application_material exists');
  assert.equal((await json('/rest/v1/evidence_items', { token: a.token, method: 'GET' }))
    .filter(e => e.id === evidence.id).length, 1, 'evidence exists');
  assert.equal((await json('/rest/v1/program_essay_requirements', { token: a.token, method: 'GET' }))
    .filter(erCheck => erCheck.id === er.id).length, 1, 'program_essay_requirement exists');
  assert.equal((await json('/rest/v1/essays', { token: a.token, method: 'GET' }))
    .filter(e => e.id === essay.id).length, 1, 'essay exists');
  assert.equal((await json('/rest/v1/essay_versions', { token: a.token, method: 'GET' }))
    .filter(ev => ev.id === essayVersionId).length, 1, 'essay_version exists');
  assert.equal((await json('/rest/v1/essay_evidence_links', { token: a.token, method: 'GET' }))
    .filter(el => el.essay_version_id === essayVersionId).length, 1, 'essay_evidence_link exists');
  assert.equal((await json('/rest/v1/recommenders', { token: a.token, method: 'GET' }))
    .filter(r => r.id === recommender.id).length, 1, 'recommender exists');
  assert.equal((await json('/rest/v1/recommendation_requests', { token: a.token, method: 'GET' }))
    .filter(rrCheck => rrCheck.id === rr.id).length, 1, 'recommendation_request exists');
  assert.equal((await json('/rest/v1/portal_sections', { token: a.token, method: 'GET' }))
    .filter(ps => ps.application_id === application.id).length, 1, 'portal_section exists');
  assert.equal((await json('/rest/v1/tasks', { token: a.token, method: 'GET' }))
    .filter(t => t.application_id === application.id).length, 1, 'task exists');
  assert.equal((await json('/rest/v1/submissions', { token: a.token, method: 'GET' }))
    .filter(s => s.application_id === application.id).length, 1, 'submission exists');
  assert.equal((await json('/rest/v1/decisions', { token: a.token, method: 'GET' }))
    .filter(d => d.application_id === application.id).length, 1, 'decision exists');

  console.log('M23 LOCAL API SCENARIO: ALL ENTITIES CREATED');

  // Repeat the API read with the same token; this is not a browser refresh.
  const refreshed = await json('/rest/v1/applications', {
    token: a.token,
    method: 'GET',
    body: undefined
  });
  assert.equal(refreshed.length, 1, 'Repeated API read must return application');
  console.log('M23 REPEATED API READ PASS');

  const logout = await request('/auth/v1/logout', {token: a.token, method: 'POST'});
  assert.ok(logout.ok, 'Local API logout must succeed before password re-login');
  console.log('M23 API LOGOUT PASS');

  // Re-login read (authentication with different client state)
  const relogin = await json('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email: a.email, password: a.password }
  });
  assert.ok(relogin.access_token, 'Re-login must return access token');
  const reloginned = await json('/rest/v1/applications', {
    token: relogin.access_token,
    method: 'GET'
  });
  assert.equal(reloginned.length, 1, 'Re-login read must return application');
  console.log('M23 RE-LOGIN READ PASS');

  // B user read denied
  for (const table of ['applications', 'materials', 'material_versions', 'essays', 'recommenders', 'submissions', 'decisions', 'tasks']) {
    const filter = table === 'applications' ? `id=eq.${application.id}` : `owner_id=eq.${a.id}`;
    const bRead = await json(`/rest/v1/${table}?${filter}`, { token: b.token });
    assert.equal(bRead.length, 0, `B user must not read ${table}`);
  }
  console.log('M23 CROSS-USER DENIAL PASS');

  // Storage permission checks
  const aDownload = await request(`/storage/v1/object/authenticated/${bucket}/${object}`, { token: a.token });
  assert.ok(aDownload.ok, 'Owner must download own file');
  const bDownload = await request(`/storage/v1/object/authenticated/${bucket}/${object}`, { token: b.token });
  assert.ok(!bDownload.ok, 'B must not download A file');
  console.log('M23 STORAGE PERMISSION PASS');

  console.log('M23 LOCAL_API_SCENARIO_PASS: synthetic REST graph, repeated read, logout/re-login, owner isolation and file download; browser E2E not exercised');

} finally {
  // Cleanup: delete fake users and objects
  const cleanupErrors = [];
  for (const { object, user } of objects) {
    try { await remove(object, user); } catch { cleanupErrors.push('Synthetic Storage object cleanup failed'); }
  }
  for (const user of users) {
    try {
      const response = await fetch(`${base}/auth/v1/admin/users/${user.id}`, {
        method: 'DELETE',
        headers: { apikey: admin, Authorization: `Bearer ${admin}` }
      });
      if (!response.ok) cleanupErrors.push('Synthetic user cleanup failed');
    } catch { cleanupErrors.push('Synthetic user cleanup request failed'); }
  }
  assert.equal(cleanupErrors.length, 0, cleanupErrors.join('; '));
  console.log('M23 CLEANUP PASS: fake users and objects removed');
}
