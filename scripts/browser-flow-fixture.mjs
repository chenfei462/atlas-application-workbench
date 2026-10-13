// Synthetic local account/file preparation only. All business records are created in the browser.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

export const LOCAL_API = 'http://127.0.0.1:55421';
const KIND = 'atlas-browser-flow-v1';
const BUCKET = 'application-documents';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const uuidPattern = new RegExp(`^${UUID}$`);
const runPattern = new RegExp(`^[a-z0-9][a-z0-9-]{0,39}-${UUID}$`);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tables = ['profiles','universities','programs','application_rounds','sources','source_assertions','applications','program_material_requirements','program_test_requirements','program_essay_requirements','program_recommendation_requirements','materials','material_versions','application_materials','evidence_items','evidence_material_links','material_application_links','essays','essay_evidence_items','essay_versions','essay_evidence_links','recommenders','recommendation_requests','portal_sections','submissions','tasks','inbox_items','decisions','audit_events','import_batches'];
class FixtureError extends Error { constructor(code) { super(code); this.code = code; } }
function requireValue(value, code) { if (!value) throw new FixtureError(code); }
export const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

export function fixturePaths(workspace, runId) {
  requireValue(typeof runId === 'string' && runPattern.test(runId), 'Invalid unique run ID');
  const directory = path.resolve(workspace, 'work', 'browser-flow', runId);
  return { directory, manifest: path.join(directory, 'fixture.private.json') };
}

export function fixtureEmail(runId) {
  fixturePaths(root, runId);
  return `atlas-browser-flow-${runId.slice(-36)}@example.invalid`;
}

export function validateFixtureIdentity(manifest, user, runId) {
  // Keep already-recorded schema-v1 runs compatible; neither alternative permits
  // a free-form prefix or an email that differs from the exact live identity.
  const expectedEmails = runPattern.test(runId) ? [fixtureEmail(runId), `atlas-browser-flow-${runId}@example.invalid`] : [];
  requireValue(runPattern.test(runId) && manifest?.schemaVersion === 1 &&
    manifest.fixtureKind === KIND && manifest.runId === runId && manifest.apiUrl === LOCAL_API &&
    uuidPattern.test(manifest.ownerId ?? '') && expectedEmails.includes(manifest.email) &&
    user?.id === manifest.ownerId && user.email === manifest.email &&
    user.user_metadata?.atlas_fixture_kind === KIND && user.user_metadata?.atlas_fixture_run_id === runId,
  'Fixture identity rejected');
}

export function validateObjectPaths(manifest, objects) {
  requireValue(uuidPattern.test(manifest?.ownerId ?? '') && Array.isArray(objects), 'Storage path rejected');
  const pattern = new RegExp(`^${manifest.ownerId}/materials/${UUID}/${UUID}/document\\.(pdf|png|jpe?g|docx)$`);
  requireValue(objects.every(object => typeof object === 'string' && pattern.test(object)), 'Storage path rejected');
  requireValue(new Set(objects).size === objects.length, 'Storage duplicate path rejected');
  return objects;
}

export function fakePdf(runId, versionNumber) {
  fixturePaths(root, runId);
  requireValue(Number.isInteger(versionNumber) && versionNumber > 0, 'Invalid PDF fixture version');
  const content = `BT /F1 12 Tf 40 750 Td (Harmless synthetic browser flow fixture) Tj 0 -20 Td (Run ${runId}; version ${versionNumber}) Tj ET\n`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`,
  ];
  let text = '%PDF-1.4\n'; const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(text)); text += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(text);
  text += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(text, 'ascii');
}

// These are supplemental read-only checks, never proof that the browser clicked each control.
export function checkFullFlow(snapshot) {
  const rows = table => Array.isArray(snapshot[table]) ? snapshot[table] : [];
  const has = (table, id) => rows(table).some(row => row.id === id);
  const checks = [];
  for (const application of rows('applications')) {
    const program = rows('programs').find(row => row.id === application.program_id);
    const materialRequirements = rows('program_material_requirements').filter(row => row.program_id === program?.id);
    const essayRequirements = rows('program_essay_requirements').filter(row => row.program_id === program?.id);
    const materialLink = rows('application_materials').find(row => row.application_id === application.id && row.status === 'COMPLETE' && materialRequirements.some(requirement => requirement.id === row.requirement_id));
    const materialVersion = rows('material_versions').find(row => row.id === materialLink?.material_version_id && row.storage_path);
    const materialVersions = rows('material_versions').filter(row => row.material_id === materialVersion?.material_id && row.storage_path);
    const essay = rows('essays').find(row => row.application_id === application.id && essayRequirements.some(requirement => requirement.id === row.program_essay_requirement_id));
    const essayVersions = rows('essay_versions').filter(row => row.essay_id === essay?.id);
    const currentEssayVersion = essayVersions.find(row => row.version_number === essay?.current_version_number);
    const connected = {
      universityProgram: Boolean(program && has('universities', program.university_id)),
      roundApplication: rows('application_rounds').some(row => row.id === application.target_round_id && row.program_id === program?.id),
      requirements: Boolean(materialRequirements.length && essayRequirements.length && rows('program_test_requirements').some(row => row.program_id === program?.id) && rows('program_recommendation_requirements').some(row => row.program_id === program?.id)),
      requirementSources: materialRequirements.some(row => row.id === materialLink?.requirement_id && has('sources', row.source_id)) && essayRequirements.some(row => row.id === essay?.program_essay_requirement_id && has('sources', row.source_id)),
      materialVersions: Boolean(materialVersion && has('materials', materialVersion.material_id) && materialVersions.length >= 2 && new Set(materialVersions.map(row => row.version_number)).size >= 2),
      applicationMaterial: Boolean(materialLink && materialVersion),
      materialApplicability: rows('material_application_links').some(row => row.material_id === materialVersion?.material_id && row.application_id === application.id),
      evidenceMaterial: rows('evidence_material_links').some(row => row.material_id === materialVersion?.material_id && has('evidence_items', row.evidence_item_id)),
      essayVersions: Boolean(essay && currentEssayVersion && essayVersions.length >= 2 && new Set(essayVersions.map(row => row.version_number)).size >= 2),
      essayEvidenceItem: rows('essay_evidence_items').some(row => row.essay_id === essay?.id && has('evidence_items', row.evidence_item_id)),
      essayEvidence: rows('essay_evidence_links').some(row => row.essay_version_id === currentEssayVersion?.id && has('evidence_items', row.evidence_item_id)),
      recommendation: rows('recommendation_requests').some(row => row.application_id === application.id && row.status === 'SUBMITTED' && has('recommenders', row.recommender_id)),
      portal: rows('portal_sections').some(row => row.application_id === application.id && row.status === 'COMPLETE' && row.progress_percent === 100),
      task: rows('tasks').some(row => row.application_id === application.id && row.status === 'DONE'),
      submissionReceipt: rows('submissions').some(row => row.application_id === application.id && row.application_number && row.confirmation_received === true && materialVersions.some(version => version.storage_path === row.receipt_storage_path)),
      decision: rows('decisions').some(row => row.application_id === application.id && row.type === 'OFFER'),
    };
    checks.push(connected);
  }
  return { pass: checks.some(check => Object.values(check).every(Boolean)), checks, counts: Object.fromEntries(tables.map(table => [table, rows(table).length])) };
}

export function parseArguments(args) {
  const [command, ...rest] = args;
  requireValue(['setup','verify','cleanup','hash','help'].includes(command), 'Invalid arguments');
  const options = { command };
  const keys = { '--run-id': 'runId', '--expect': 'expect', '--download': 'download', '--source': 'source' };
  for (let index = 0; index < rest.length; index += 2) {
    const key = keys[rest[index]];
    requireValue(key && rest[index + 1] && !rest[index + 1].startsWith('--') && !(key in options), 'Invalid arguments');
    options[key] = rest[index + 1];
  }
  requireValue(!options.expect || (command === 'verify' && ['observe','full-flow','empty'].includes(options.expect)), 'Invalid arguments');
  requireValue(!options.download || command === 'hash', 'Invalid arguments');
  requireValue(!options.source || (command === 'hash' && ['file-v1.pdf','file-v2.pdf'].includes(options.source)), 'Invalid arguments');
  if (!['setup','help'].includes(command)) requireValue(options.runId, 'Invalid arguments');
  if (command === 'hash') requireValue(options.download && options.source, 'Invalid arguments');
  if (options.runId) fixturePaths(root, options.runId);
  return options;
}

function localClients() {
  const status = spawnSync(process.execPath, [path.join(root, 'node_modules/supabase/dist/supabase.js'), 'status', '--output', 'json'], { cwd: root, encoding: 'utf8' });
  requireValue(status.status === 0, 'Local stack unavailable');
  let settings; try { settings = JSON.parse(status.stdout); } catch { throw new FixtureError('Local status unavailable'); }
  requireValue(settings.API_URL === LOCAL_API && settings.ANON_KEY && settings.SERVICE_ROLE_KEY, 'Local target rejected');
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  return { admin: createClient(LOCAL_API, settings.SERVICE_ROLE_KEY, options), own: createClient(LOCAL_API, settings.ANON_KEY, options) };
}
async function saveManifest(filename, manifest) {
  await fs.writeFile(`${filename}.tmp`, JSON.stringify(manifest, null, 2), { mode: 0o600 });
  await fs.rename(`${filename}.tmp`, filename);
}
export function recordedFixtureState(paths, manifest, runId) {
  validateFixtureIdentity(manifest, { id: manifest.ownerId, email: manifest.email, user_metadata: { atlas_fixture_kind: manifest.fixtureKind, atlas_fixture_run_id: manifest.runId } }, runId);
  return { directory: paths.directory, manifestFile: paths.manifest, manifest };
}
export function validateRemovedFixture(manifest, runId, lookup, snapshot, objects) {
  recordedFixtureState(fixturePaths(root, runId), manifest, runId);
  requireValue(lookup?.error?.status === 404 && !lookup.data?.user &&
    tables.every(table => !snapshot[table]?.length) && Array.isArray(objects) && objects.length === 0,
  'Removed fixture verification failed');
}
async function readManifest(runId) {
  const paths = fixturePaths(root, runId);
  let manifest; try { manifest = JSON.parse(await fs.readFile(paths.manifest, 'utf8')); } catch { throw new FixtureError('Recorded fixture unavailable'); }
  // Keep the file path separate from parsed data; live identity is checked later.
  return recordedFixtureState(paths, manifest, runId);
}
async function assertLiveIdentity(admin, manifest) {
  const result = await admin.auth.admin.getUserById(manifest.ownerId);
  requireValue(!result.error && result.data.user, 'Fixture identity unavailable');
  validateFixtureIdentity(manifest, result.data.user, manifest.runId);
}
async function readRows(client, ownerId) {
  const snapshot = {};
  for (const table of tables) {
    const all = [];
    for (let offset = 0; ; offset += 500) {
      const result = await client.from(table).select('*').eq(table === 'profiles' ? 'id' : 'owner_id', ownerId).order('id').range(offset, offset + 499);
      requireValue(!result.error && Array.isArray(result.data), 'Fixture read failed');
      all.push(...result.data); if (result.data.length < 500) break;
    }
    snapshot[table] = all;
  }
  return snapshot;
}
async function objectPaths(client, manifest) {
  const objects = []; const prefixes = [manifest.ownerId];
  while (prefixes.length) {
    const prefix = prefixes.shift();
    requireValue(prefixes.length + objects.length < 10000, 'Fixture Storage inventory too large');
    for (let offset = 0; ; offset += 500) {
      const result = await client.storage.from(BUCKET).list(prefix, { limit: 500, offset, sortBy: { column: 'name', order: 'asc' } });
      requireValue(!result.error && Array.isArray(result.data), 'Fixture Storage inventory failed');
      for (const entry of result.data) {
        requireValue(entry.name && !/[\\/]/.test(entry.name) && !entry.name.includes('..'), 'Storage path rejected');
        const object = `${prefix}/${entry.name}`;
        if (entry.id) objects.push(object);
        else { requireValue(object.split('/').length <= 4, 'Storage path rejected'); prefixes.push(object); }
      }
      if (result.data.length < 500) break;
    }
  }
  return validateObjectPaths(manifest, objects);
}
async function setup(options) {
  const runId = options.runId ?? `${new Date().toISOString().slice(0,10).replaceAll('-','')}-${crypto.randomUUID()}`;
  const paths = fixturePaths(root, runId);
  await fs.mkdir(path.dirname(paths.directory), { recursive: true });
  try { await fs.mkdir(paths.directory); } catch { throw new FixtureError('Run directory already exists'); }
  const manifest = { schemaVersion: 1, fixtureKind: KIND, runId, apiUrl: LOCAL_API, createdAt: new Date().toISOString(), email: fixtureEmail(runId), password: crypto.randomBytes(24).toString('base64url') + 'Aa!', phase: 'pending-signup', files: [] };
  for (const number of [1,2]) {
    const bytes = fakePdf(runId, number); const filename = `file-v${number}.pdf`;
    await fs.writeFile(path.join(paths.directory, filename), bytes);
    manifest.files.push({ filename, sha256: digest(bytes), size: bytes.length });
  }
  await saveManifest(paths.manifest, manifest);
  const { own, admin } = localClients();
  const result = await own.auth.signUp({ email: manifest.email, password: manifest.password, options: { data: { atlas_fixture_kind: KIND, atlas_fixture_run_id: runId } } });
  requireValue(!result.error && result.data.user && result.data.session, 'Synthetic signup failed');
  manifest.ownerId = result.data.user.id; manifest.phase = 'ready';
  validateFixtureIdentity(manifest, result.data.user, runId);
  try { await saveManifest(paths.manifest, manifest); }
  catch { await admin.auth.admin.deleteUser(manifest.ownerId); throw new FixtureError('Fixture private state write failed'); }
  const snapshot = await readRows(own, manifest.ownerId);
  requireValue(tables.filter(table => table !== 'profiles').every(table => !snapshot[table].length), 'Fixture must begin with no business records');
  console.log(JSON.stringify({ status: 'SETUP_PASS', runId, privateState: paths.manifest, uploadFiles: manifest.files.map(file => path.join(paths.directory, file.filename)), businessRecords: 0 }));
}
async function verify(options) {
  const { manifest, directory } = await readManifest(options.runId);
  const { own, admin } = localClients(); await assertLiveIdentity(admin, manifest);
  const login = await own.auth.signInWithPassword({ email: manifest.email, password: manifest.password });
  requireValue(!login.error && login.data.user?.id === manifest.ownerId, 'Fixture login failed');
  const snapshot = await readRows(own, manifest.ownerId);
  const paths = await objectPaths(own, manifest);
  validateObjectPaths(manifest, snapshot.material_versions.filter(row => row.storage_path).map(row => row.storage_path));
  const downloads = [];
  for (const row of snapshot.material_versions.filter(row => row.storage_path)) {
    const result = await own.storage.from(BUCKET).download(row.storage_path);
    requireValue(!result.error && result.data, 'Fixture owner download failed');
    const bytes = Buffer.from(await result.data.arrayBuffer());
    const source = manifest.files.find(file => file.filename === row.original_filename);
    requireValue(source && digest(bytes) === source.sha256 && row.sha256 === source.sha256 && bytes.length === row.size_bytes, 'Fixture file checksum mismatch');
    requireValue(digest(await fs.readFile(path.join(directory, source.filename))) === source.sha256, 'Fixture source checksum mismatch');
    downloads.push({ version: row.version_number, hashMatch: true });
  }
  const graph = checkFullFlow(snapshot);
  requireValue(options.expect !== 'full-flow' || graph.pass, 'Full flow graph incomplete');
  requireValue(options.expect !== 'empty' || tables.filter(table => table !== 'profiles').every(table => !snapshot[table].length), 'Fixture business records not empty');
  console.log(JSON.stringify({ status: 'VERIFY_PASS', runId: options.runId, expectation: options.expect ?? 'observe', graph, storageObjects: paths.length, ownerDownloads: downloads, browserActionsProven: false }));
}
async function cleanup(options) {
  const { manifest, manifestFile } = await readManifest(options.runId);
  const { admin } = localClients();
  const lookup = await admin.auth.admin.getUserById(manifest.ownerId);
  if (lookup.error?.status === 404 && !lookup.data.user) {
    // After a response/state-write failure, absent-account recovery never grants
    // delete permission. It only finalizes the recorded private state after all
    // owner rows and objects are already verified absent.
    const snapshot = await readRows(admin, manifest.ownerId);
    const objects = await objectPaths(admin, manifest);
    validateRemovedFixture(manifest, options.runId, lookup, snapshot, objects);
  } else {
    requireValue(manifest.phase !== 'cleaned', 'Cleaned fixture identity unexpectedly exists');
    await assertLiveIdentity(admin, manifest);
    const objects = await objectPaths(admin, manifest);
    // Validate every metadata reference before any deletion. Unknown layouts stop cleanup.
    const snapshot = await readRows(admin, manifest.ownerId);
    const references = [...snapshot.material_versions.map(row => row.storage_path), ...snapshot.submissions.map(row => row.receipt_storage_path), ...snapshot.import_batches.map(row => row.archive_path)].filter(Boolean);
    validateObjectPaths(manifest, [...new Set(references)]);
    const errors = [];
    for (const object of objects) {
      const result = await admin.storage.from(BUCKET).remove([object]);
      if (result.error) errors.push('Object cleanup failed');
    }
    requireValue(!errors.length && !(await objectPaths(admin, manifest)).length, 'Fixture Storage cleanup incomplete');
    await assertLiveIdentity(admin, manifest);
    manifest.phase = 'deleting-account';
    manifest.cleanupIdentityVerifiedAt = new Date().toISOString();
    await saveManifest(manifestFile, manifest);
    const result = await admin.auth.admin.deleteUser(manifest.ownerId);
    requireValue(!result.error, 'Fixture account cleanup failed');
  }
  const snapshot = await readRows(admin, manifest.ownerId);
  requireValue(tables.every(table => !snapshot[table].length) && !(await objectPaths(admin, manifest)).length, 'Fixture cleanup verification failed');
  delete manifest.password; manifest.phase = 'cleaned'; manifest.cleanedAt = new Date().toISOString();
  await saveManifest(manifestFile, manifest);
  console.log(JSON.stringify({ status: 'CLEANUP_PASS', runId: options.runId, remainingFixtureRows: 0, remainingFixtureObjects: 0, credentialsRemoved: true }));
}
async function compareDownload(options) {
  const { manifest, directory } = await readManifest(options.runId);
  const source = manifest.files.find(file => file.filename === options.source);
  requireValue(source && digest(await fs.readFile(path.join(directory, options.source))) === source.sha256, 'Fixture source checksum mismatch');
  requireValue(digest(await fs.readFile(path.resolve(options.download))) === source.sha256, 'Browser download checksum mismatch');
  console.log(JSON.stringify({ status: 'BROWSER_DOWNLOAD_HASH_PASS', runId: options.runId, source: options.source, hashMatch: true }));
}
export async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  if (options.command === 'help') {
    console.log('node scripts/browser-flow-fixture.mjs setup [--run-id <prefix-uuid>]\nnode scripts/browser-flow-fixture.mjs verify --run-id <prefix-uuid> [--expect observe|empty|full-flow]\nnode scripts/browser-flow-fixture.mjs hash --run-id <prefix-uuid> --source file-v1.pdf|file-v2.pdf --download <browser-download-path>\nnode scripts/browser-flow-fixture.mjs cleanup --run-id <prefix-uuid>'); return;
  }
  if (options.command === 'setup') await setup(options);
  else if (options.command === 'verify') await verify(options);
  else if (options.command === 'hash') await compareDownload(options);
  else await cleanup(options);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`BROWSER_FLOW_FIXTURE_FAILED: ${error instanceof FixtureError ? error.code : 'Local operation failed; private details suppressed'}`); process.exitCode = 1; });
}
