import test from 'node:test';
import assert from 'node:assert/strict';
import * as fixture from '../scripts/browser-flow-fixture.mjs';
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const material = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const version = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const runId = '20261013-dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const manifest = {
  schemaVersion: 1, fixtureKind: 'atlas-browser-flow-v1', runId,
  apiUrl: 'http://127.0.0.1:55421', ownerId: owner,
  email: `atlas-browser-flow-${runId.slice(-36)}@example.invalid`,
};
const user = {
  id: owner, email: manifest.email,
  user_metadata: { atlas_fixture_kind: manifest.fixtureKind, atlas_fixture_run_id: runId },
};

test('fixture directories require a unique UUID run ID and remain inside ignored work', () => {
  const paths = fixture.fixturePaths('D:/Atlas', runId);
  assert.match(paths.directory.replaceAll('\\', '/'), /\/work\/browser-flow\/20261013-/);
  assert.match(paths.manifest, /fixture\.private\.json$/);
  for (const bad of ['old', '../20261013-test', `${runId}/../other`, '20261013-DDDDDDDD-DDDD-4DDD-8DDD-DDDDDDDDDDDD']) {
    assert.throws(() => fixture.fixturePaths('D:/Atlas', bad), /run ID/i);
  }
});

test('cleanup identity requires the recorded owner, synthetic email, run metadata and exact local API', () => {
  assert.doesNotThrow(() => fixture.validateFixtureIdentity(manifest, user, runId));
  for (const changed of [
    { ...user, id: material }, { ...user, email: 'real@example.com' },
    { ...user, user_metadata: {} },
    { ...user, user_metadata: { ...user.user_metadata, atlas_fixture_run_id: 'another-run' } },
  ]) assert.throws(() => fixture.validateFixtureIdentity(manifest, changed, runId), /identity/i);
  for (const changed of [
    { ...manifest, apiUrl: 'https://remote.example.invalid' },
    { ...manifest, email: 'real@example.com' }, { ...manifest, runId: 'another-run' },
    { ...manifest, fixtureKind: 'historic-fixture' }, { ...manifest, ownerId: 'not-a-uuid' },
  ]) assert.throws(() => fixture.validateFixtureIdentity(changed, user, runId), /identity/i);
});

test('cleanup accepts only exact UI document paths under the recorded fixture owner', () => {
  const valid = `${owner}/materials/${material}/${version}/document.pdf`;
  assert.deepEqual(fixture.validateObjectPaths(manifest, [valid]), [valid]);
  for (const bad of [
    `${material}/materials/${material}/${version}/document.pdf`,
    `${owner}/materials/${material}/${version}/../document.pdf`,
    `${owner}/materials/${material}/${version}/document.pdf/extra`,
    `${owner}/archive/history.json`, `${owner}/materials/not-a-uuid/${version}/document.pdf`,
    valid.replaceAll('/', '\\'), valid.replace('document.pdf', 'anything.pdf'),
  ]) assert.throws(() => fixture.validateObjectPaths(manifest, [bad]), /Storage path/i);
  assert.throws(() => fixture.validateObjectPaths(manifest, [valid, valid]), /duplicate/i);
});

test('harmless PDF fixtures have different checksums and a valid byte-indexed trailer', () => {
  const a = fixture.fakePdf(runId, 1), b = fixture.fakePdf(runId, 2);
  assert.equal(a.subarray(0, 8).toString(), '%PDF-1.4');
  assert.notEqual(fixture.digest(a), fixture.digest(b));
  const text = a.toString('ascii');
  const offset = Number(text.match(/startxref\n(\d+)\n%%EOF/)[1]);
  assert.equal(a.subarray(offset, offset + 4).toString(), 'xref');
  assert.match(text, /Harmless synthetic browser flow fixture/);
});

function graph() {
  return {
    universities: [{ id: 'u' }], programs: [{ id: 'p', university_id: 'u' }],
    application_rounds: [{ id: 'r', program_id: 'p' }],
    applications: [{ id: 'a', program_id: 'p', target_round_id: 'r', status: 'SUBMITTED' }],
    sources: [{ id: 's' }],
    program_material_requirements: [{ id: 'mr', program_id: 'p', source_id: 's' }],
    program_test_requirements: [{ id: 'tr', program_id: 'p' }],
    program_essay_requirements: [{ id: 'er', program_id: 'p', source_id: 's' }],
    program_recommendation_requirements: [{ id: 'rr', program_id: 'p' }],
    materials: [{ id: 'm' }], material_versions: [
      { id: 'v1', material_id: 'm', version_number: 1, storage_path: 'path-1' },
      { id: 'v2', material_id: 'm', version_number: 2, storage_path: 'path-2' },
    ],
    application_materials: [{ application_id: 'a', requirement_id: 'mr', material_version_id: 'v2', status: 'COMPLETE' }],
    material_application_links: [{ material_id: 'm', application_id: 'a' }],
    evidence_items: [{ id: 'e' }],
    evidence_material_links: [{ evidence_item_id: 'e', material_id: 'm' }],
    essays: [{ id: 'essay', application_id: 'a', program_essay_requirement_id: 'er', current_version_number: 2 }],
    essay_evidence_items: [{ essay_id: 'essay', evidence_item_id: 'e' }],
    essay_versions: [{ id: 'ev1', essay_id: 'essay', version_number: 1 }, { id: 'ev2', essay_id: 'essay', version_number: 2 }],
    essay_evidence_links: [{ essay_version_id: 'ev2', evidence_item_id: 'e' }],
    recommenders: [{ id: 'rec' }],
    recommendation_requests: [{ application_id: 'a', recommender_id: 'rec', status: 'SUBMITTED' }],
    portal_sections: [{ application_id: 'a', status: 'COMPLETE', progress_percent: 100 }],
    tasks: [{ application_id: 'a', status: 'DONE' }],
    submissions: [{ application_id: 'a', application_number: 'FAKE', receipt_storage_path: 'path-2', confirmation_received: true }],
    decisions: [{ application_id: 'a', type: 'OFFER' }],
  };
}

test('read-only verification requires one connected complete graph, versions and evidence links', () => {
  assert.equal(fixture.checkFullFlow(graph()).pass, true);
  for (const [table, field, value] of [
    ['programs', 'university_id', 'other'], ['applications', 'target_round_id', 'other'],
    ['application_materials', 'requirement_id', 'other'], ['essays', 'program_essay_requirement_id', 'other'],
    ['essay_evidence_links', 'essay_version_id', 'other'], ['recommendation_requests', 'recommender_id', 'other'],
    ['submissions', 'receipt_storage_path', 'missing'], ['decisions', 'application_id', 'other'],
  ]) {
    const broken = graph(); broken[table][0][field] = value;
    assert.equal(fixture.checkFullFlow(broken).pass, false, `${table}.${field} must be checked`);
  }
  const singleVersion = graph(); singleVersion.material_versions.pop();
  assert.equal(fixture.checkFullFlow(singleVersion).pass, false);
  const staleCurrent = graph(); staleCurrent.essays[0].current_version_number = 99;
  assert.equal(fixture.checkFullFlow(staleCurrent).pass, false);
});

test('CLI options cannot target arbitrary private manifests or unknown modes', () => {
  assert.deepEqual(fixture.parseArguments(['verify', '--run-id', runId, '--expect', 'full-flow']), { command: 'verify', runId, expect: 'full-flow' });
  for (const args of [['delete'], ['cleanup', '--manifest', 'history.json'], ['verify', '--expect', 'anything'], ['verify', '--run-id'], ['verify', '--run-id', runId, '--run-id', runId]]) {
    assert.throws(() => fixture.parseArguments(args), /arguments/i);
  }
});

test('source verification belongs to the exact requirements bound to the material and essay', () => {
  for (const table of ['program_material_requirements', 'program_essay_requirements']) {
    const disconnected = graph();
    disconnected[table][0].source_id = null;
    disconnected[table].push({ ...disconnected[table][0], id: 'unbound-requirement', source_id: 's' });
    assert.equal(fixture.checkFullFlow(disconnected).pass, false, `${table} must verify the bound requirement source`);
  }
});

test('complete UI flow includes material applicability, evidence material and essay-level evidence relations', () => {
  for (const table of ['material_application_links', 'evidence_material_links', 'essay_evidence_items']) {
    const incomplete = graph(); incomplete[table] = [];
    assert.equal(fixture.checkFullFlow(incomplete).pass, false, `${table} must be present and connected`);
  }
});

test('synthetic email remains short for a valid long run prefix while retaining its unique UUID', () => {
  assert.equal(typeof fixture.fixtureEmail, 'function');
  const longRun = `browser-flow-complete-local-test-run-${runId.slice(-36)}`;
  const email = fixture.fixtureEmail(longRun);
  assert.equal(email, manifest.email);
  assert.ok(email.split('@')[0].length <= 64);
});

test('recorded schema v1 full-run email remains valid without broadening identity checks', () => {
  const legacy = { ...manifest, email: `atlas-browser-flow-${runId}@example.invalid` };
  const legacyUser = { ...user, email: legacy.email };
  assert.doesNotThrow(() => fixture.validateFixtureIdentity(legacy, legacyUser, runId));
  assert.throws(() => fixture.validateFixtureIdentity(legacy, user, runId), /identity/i);
  const unrelated = { ...legacy, email: `atlas-browser-flow-other-${runId.slice(-36)}@example.invalid` };
  assert.throws(() => fixture.validateFixtureIdentity(unrelated, { ...legacyUser, email: unrelated.email }, runId), /identity/i);
});

test('recorded fixture state retains the private file path separately from the manifest object', () => {
  assert.equal(typeof fixture.recordedFixtureState, 'function');
  const paths = fixture.fixturePaths('D:/Atlas', runId);
  const state = fixture.recordedFixtureState(paths, manifest, runId);
  assert.equal(state.manifestFile, paths.manifest);
  assert.equal(state.manifest, manifest);
  assert.equal(state.directory, paths.directory);
});

test('removed-account recovery only finalizes private state after exact 404 and zero owner data', () => {
  assert.equal(typeof fixture.validateRemovedFixture, 'function');
  const missing = { error: { status: 404 }, data: { user: null } };
  assert.doesNotThrow(() => fixture.validateRemovedFixture(manifest, runId, missing, {}, []));
  for (const [lookup, snapshot, objects] of [
    [{ error: { status: 500 }, data: { user: null } }, {}, []],
    [{ error: null, data: { user } }, {}, []],
    [missing, { programs: [{ owner_id: owner }] }, []],
    [missing, {}, [`${owner}/materials/${material}/${version}/document.pdf`]],
  ]) assert.throws(() => fixture.validateRemovedFixture(manifest, runId, lookup, snapshot, objects), /removed fixture/i);
});
