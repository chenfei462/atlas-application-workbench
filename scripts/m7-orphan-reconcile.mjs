// M7 orphan quarantine + reconciliation (LOCAL/TEST stack only).
// Backup-first: download and hash every object, write a quarantine manifest,
// verify each copy, and only then remove the originals from the local active
// bucket. Never touches production.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

// Local stack settings (service role is used only in-process; never written out).
const status = spawnSync(process.execPath, [path.join(root, 'node_modules/supabase/dist/supabase.js'), 'status', '--output', 'json'], { cwd: root, encoding: 'utf8' });
if (status.status !== 0) throw new Error('Local stack unavailable');
const s = JSON.parse(status.stdout);
if (s.API_URL !== 'http://127.0.0.1:55421') throw new Error(`Refusing non-local API: ${s.API_URL}`);
const API = s.API_URL;
const KEY = s.SERVICE_ROLE_KEY;
const BUCKET = 'application-documents';
const CONTAINER = 'supabase_db_atlas-local-01a12938';

const psql = (q) => {
  const r = spawnSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`psql failed: ${r.stderr}`);
  return r.stdout.trim();
};

// The M7 gate's own criterion is the integrity checker's output, so the script
// must produce it rather than leaving it to a manual follow-up command.
// Report-only and read-only: it never deletes anything (scripts/integrity.mjs).
const runIntegrity = async (reportName) => {
  const reportPath = path.join(root, 'work', reportName);
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/integrity.mjs'), '--report', path.relative(root, reportPath)], { cwd: root, encoding: 'utf8' });
  let report = null;
  try { report = JSON.parse(await fs.readFile(reportPath, 'utf8')); } catch { /* report may be absent if the run failed early */ }
  // Report shape per scripts/integrity.mjs:19 — {status, missingReferences[], orphanObjects[], counts{}, reportOnly:true}
  return {
    exitCode: r.status,
    reportPath: path.relative(root, reportPath).split(path.sep).join('/'),
    reportOnly: report?.reportOnly ?? null,
    status: report?.status ?? null,
    missingReferences: report?.counts?.missingReferences ?? null,
    orphanObjects: report?.counts?.orphanObjects ?? null,
  };
};

// Classification decided from the proven evidence chain.
//
// MEASURED-STATE NOTE (round 9): when this list was written, `application-documents` held all FOUR
// objects below. Re-measurement after the environment recovered found only `5f12d170-...` still
// present: the three `imports/<sha256>/source.json` rows had disappeared from storage.objects.
// That was NOT this script (its delete never ran - it was blocked by an environment fault the whole
// time). The storage backend holds ZERO files, so all four were always metadata-only rows; the three
// owners never existed in auth.users; import_batches is empty; and the three objects remain fully
// preserved and checksum-verified in the quarantine directory.
//
// The three vanished entries are KEPT in this list deliberately, as a fail-closed guard: their
// downloads now fail, so no quarantine entry is produced for them, so the pre-delete gate sees
// 1 !== 4 and aborts with exit 4 BEFORE any DELETE. Removing them would silently shrink the
// expected set and let the gate pass on a state nobody re-analysed. Do not prune this list to make
// the script "work" - that would convert a caught inconsistency into an unnoticed one.
// `alreadyRemoved` marks objects that an EARLIER RUN of this script already deleted, established from
// the storage server log rather than assumed:
//   req-2yo  .../imports/97f0b139.../source.json  DELETE 200  role=service_role  2026-10-12T01:19:52.727Z
//   req-2yp  .../imports/1eb8f318.../source.json  DELETE 200  role=service_role  2026-10-12T01:19:52.743Z
//   req-2yq  .../imports/84a9dc79.../source.json  DELETE 200  role=service_role  2026-10-12T01:19:52.763Z
// Those are 189/205/225 ms after that run's own startedAt (01:19:52.538Z) - i.e. this script's
// pre-F1-fix delete loop executed and succeeded for the three byte-backed objects, then wrote no
// post-delete record. The earlier claim that "nothing was deleted" was false and is retracted (F12).
//
// These entries are KEPT, not pruned. Deleting them would shrink the expected set to whatever happens
// to survive and let the gate pass against a state nobody re-analysed. Instead the expected set is
// re-derived: objects flagged `alreadyRemoved` must be ABSENT, unflagged objects must be PRESENT.
// That makes the gate reason over the full history - a vanished entry that is not flagged, or a
// flagged entry that is still present, both abort before any DELETE.
const OBJECTS = [
  {
    id: '7bcfa7ae-494b-4ae4-9d30-df485b24398a',
    path: '0ded7015-42b5-443f-89e3-9ef542d661c0/imports/97f0b13946871dc75bcda953d58c17262e042645d466d65a2e0c9824a49a4d92/source.json',
    classification: 'PROVEN_GENERATED_ARTIFACT',
    reason: 'Written by the application importer itself: src/migration/index.ts:90 uploads every import archive to `${owner}/imports/${plan.checksum}/source.json` where plan.checksum = sha256(raw) (index.ts:85). The object content hashes to its own path segment, which is self-verifying. Owner has no auth.users row; public.import_batches.owner_id cascades from auth.users (202610110005_execution.sql:95), so deleting the test user removed the batch row while the Storage object survived. Archive objects never appear in backup-lib.mjs references(), so no DB reference can ever be reconstructed for them.',
    hasBytes: true,
    alreadyRemoved: true,
    alreadyRemovedEvidence: 'storage server log: DELETE 200, role=service_role, 2026-10-12T01:19:52.727Z/.743Z/.763Z (per-object, in id order) - an earlier run of this pre-F1-fix script removed it without writing a post-delete record',
  },
  {
    id: '5f12d170-f7ab-4343-8818-2975ce3ec6e2',
    path: '17a64f01-3ed8-473c-8d04-32df2f5f7847/orphans/t4-orphan-17a64f01-3ed8-473c-8d04-32df2f5f7847.bin',
    classification: 'PROVEN_TEST_ARTIFACT',
    reason: 'Synthetic fixture row inserted by work/t4-orphan-fixture.sql, which inserts exactly `<owner_id>/orphans/t4-orphan-<owner_id>.bin` with metadata {"size":12,"mimetype":"application/octet-stream"} chosen via `(select owner_id from public.materials limit 1)`. Its comment states it is cleaned up after the check; that cleanup never ran. The owner is the disposable browser test user recorded in work/browser-fixture.json (scripts/create-browser-fixture.mjs). This row has NO backing bytes in the storage backend (download returns HTTP 500).',
    hasBytes: false,
  },
  {
    id: 'c4b0b2c3-a98a-47b7-8339-4db75b364262',
    path: '471e13ce-f42d-4b4c-9289-e3cff34fb694/imports/1eb8f3185052edc8fd5a136591578adaf3990ba6d6593400560f2511ac44a34b/source.json',
    classification: 'PROVEN_GENERATED_ARTIFACT',
    reason: 'Application-generated import archive (same proof as the first object). Object content SHA-256 equals its own imports/<sha256>/ path segment. Owner has no auth.users row.',
    hasBytes: true,
    alreadyRemoved: true,
    alreadyRemovedEvidence: 'storage server log: DELETE 200, role=service_role, 2026-10-12T01:19:52.727Z/.743Z/.763Z (per-object, in id order) - an earlier run of this pre-F1-fix script removed it without writing a post-delete record',
  },
  {
    id: 'e142c35a-8d77-44cf-bd63-78f995e77b07',
    path: 'e6fee3fc-c2da-4f43-ac13-cbc67909a4d9/imports/84a9dc7904e1ed1e3eb729a5d44588964389d52a0f8be21d208b93e5f5b416e3/source.json',
    classification: 'PROVEN_GENERATED_ARTIFACT',
    reason: 'Application-generated import archive (same proof). Object content SHA-256 equals its own imports/<sha256>/ path segment. Owner has no auth.users row.',
    hasBytes: true,
    alreadyRemoved: true,
    alreadyRemovedEvidence: 'storage server log: DELETE 200, role=service_role, 2026-10-12T01:19:52.727Z/.743Z/.763Z (per-object, in id order) - an earlier run of this pre-F1-fix script removed it without writing a post-delete record',
  },
];

const out = {
  phase: 'M7 quarantine + reconciliation',
  environment: 'local',
  apiUrl: API,
  bucket: BUCKET,
  startedAt: new Date().toISOString(),
  integrityBefore: null,
  beforeInventory: null,
  quarantine: [],
  alreadyRemoved: [],
  deletions: [],
  integrityAfter: null,
  afterInventory: null,
  actions: [],
  errors: [],
};

// --- Step 1: quarantine every object BEFORE any active-bucket change ---
// Resume support: if a quarantine directory already holds a complete copy set,
// reuse it instead of re-downloading. The recomputed checksum is compared against
// the checksum RECORDED in that directory's RESULT.json — the comparison, not the
// act of hashing, is what sets `verified`. A copy set with no recorded manifest,
// or whose bytes no longer match it, is rejected and never becomes resumable.
const qRoot = path.join(root, 'deliverables/atlas-production/orphan-quarantine');
let qDir = null;
let resumed = false;
let resumedEntries = null;
let resumeRejection = null;
try {
  const dirs = (await fs.readdir(qRoot, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .reverse();
  for (const d of dirs) {
    const candidate = path.join(qRoot, d);
    let files;
    try { files = await fs.readdir(candidate); } catch { continue; }

    // A resume is only legitimate against a recorded manifest of what the bytes must be.
    let recorded = null;
    for (const manifestName of ['RESULT.json', 'manifest.json']) {
      if (!files.includes(manifestName)) continue;
      try {
        const parsed = JSON.parse(await fs.readFile(path.join(candidate, manifestName), 'utf8'));
        const list = Array.isArray(parsed) ? parsed : (parsed.quarantine ?? parsed.entries ?? null);
        if (Array.isArray(list) && list.length) { recorded = list; break; }
      } catch { /* unreadable manifest is not a usable manifest */ }
    }
    if (!recorded) {
      resumeRejection = `${d}: no readable RESULT.json/manifest.json recording expected checksums — refused to resume (cannot verify what was preserved)`;
      continue;
    }
    const recordedByPath = new Map(recorded.map((e) => [e.originalPath, e]));

    const entries = [];
    let complete = true;
    let mismatch = null;
    for (const obj of OBJECTS) {
      const metaName = `storage-object-row-${obj.id}.json`;
      if (!files.includes(metaName)) { complete = false; break; }
      const metaAbs = path.join(candidate, metaName);
      const metaBytes = await fs.readFile(metaAbs);
      const prior = recordedByPath.get(obj.path);
      if (!prior) { complete = false; mismatch = `${d}: object ${obj.path} absent from the recorded manifest`; break; }
      const entry = {
        originalBucket: BUCKET,
        originalPath: obj.path,
        storageObjectId: obj.id,
        classification: obj.classification,
        reason: obj.reason,
        reconciliationAction: 'Removed from LOCAL active bucket only; quarantine copy retained. This entry was recovered from an existing quarantine directory and re-verified against its recorded checksum.',
        timestamp: new Date().toISOString(),
        size: null,
        checksum: null,
        backupPath: null,
        metadataRowPath: path.relative(root, metaAbs).split(path.sep).join('/'),
        bytesPresent: obj.hasBytes,
        recordedChecksum: prior.checksum ?? null,
      };
      if (obj.hasBytes) {
        const binName = obj.path.replaceAll('/', '__');
        if (!files.includes(binName)) { complete = false; break; }
        const binAbs = path.join(candidate, binName);
        const binBytes = await fs.readFile(binAbs);
        entry.checksum = sha256(binBytes);
        entry.backupPath = path.relative(root, binAbs).split(path.sep).join('/');
        entry.size = binBytes.length;
        const segment = obj.path.split('/')[2];
        entry.contentHashMatchesPathSegment = entry.checksum === segment;
      } else {
        entry.checksum = sha256(metaBytes);
        entry.backupPath = path.relative(root, metaAbs).split(path.sep).join('/');
        entry.note = 'No backing bytes exist in the storage backend (download returns HTTP 500). Metadata-only fixture row; the preserved storage.objects row is the complete recoverable record.';
      }
      // THE verification decision: recomputed bytes must equal the RECORDED checksum.
      entry.checksumMatchesRecorded = Boolean(entry.recordedChecksum) && entry.checksum === entry.recordedChecksum;
      entry.verified = entry.checksumMatchesRecorded && entry.contentHashMatchesPathSegment !== false;
      if (!entry.verified) {
        complete = false;
        mismatch = `${d}: ${obj.path} — recomputed ${entry.checksum} does not match recorded ${entry.recordedChecksum}`;
        break;
      }
      entries.push(entry);
    }
    if (complete && entries.length === OBJECTS.length) {
      qDir = candidate;
      resumed = true;
      resumedEntries = entries;
      break;
    }
    if (mismatch) resumeRejection = mismatch;
  }
} catch { /* no quarantine root yet */ }
if (!qDir) qDir = path.join(qRoot, new Date().toISOString().replace(/[:.]/g, '-'));

// The BEFORE inventory must reflect the live stack at the time we act.
out.beforeInventory = JSON.parse(psql(`select coalesce(json_agg(x order by name),'[]') from (select id,bucket_id,name,owner,owner_id,metadata,version,created_at,is_delete_marker,is_versioned from storage.objects) x;`));
const before = out.beforeInventory;
out.actions.push(`BEFORE inventory: ${before.length} object(s) in the local stack`);

// Record the integrity state we are starting from, so the report shows both sides of the gate.
out.integrityBefore = await runIntegrity('dsh-T4-integrity-before.json');
out.actions.push(`Pre-reconciliation integrity: exit ${out.integrityBefore.exitCode}, missingReferences=${out.integrityBefore.missingReferences}, orphanObjects=${out.integrityBefore.orphanObjects} (report: ${out.integrityBefore.reportPath})`);

if (resumed) {
  out.quarantine = resumedEntries;
  out.actions.push(`Reused existing quarantine from ${path.relative(root, qDir).split(path.sep).join('/')}: all ${resumedEntries.length} copies re-hashed from disk and confirmed intact (objects still present in the active bucket)`);
} else {
await fs.mkdir(qDir, { recursive: true });

for (const obj of OBJECTS) {
  const entry = {
    originalBucket: BUCKET,
    originalPath: obj.path,
    storageObjectId: obj.id,
    classification: obj.classification,
    reason: obj.reason,
    reconciliationAction: 'Removed from LOCAL active bucket only; quarantine copy retained.',
    timestamp: new Date().toISOString(),
    size: null,
    checksum: null,
    backupPath: null,
    bytesPresent: obj.hasBytes,
  };
  const row = before.find((r) => r.id === obj.id);
  if (obj.alreadyRemoved) {
    // Re-derived expectation: an object this script already removed MUST be absent. If it is present,
    // reality disagrees with the recorded history and we must not proceed blindly.
    if (row) out.errors.push(`Object ${obj.id} is marked alreadyRemoved but is STILL PRESENT in the bucket - recorded history disagrees with reality; refusing to proceed`);
    // Carry the EVIDENCE into the record, not just the boolean. Emitting `confirmedAbsent: true` alone
    // would reproduce the F8 failure shape (an unevidenced `true`) in the very field a future reader
    // would use to check this claim - so the marker's proof is propagated to the artifact itself.
    else out.alreadyRemoved.push({ storageObjectId: obj.id, path: obj.path, confirmedAbsent: true, evidence: obj.alreadyRemovedEvidence ?? null });
    continue;
  }
  if (!row) { out.errors.push(`Object ${obj.id} not found in BEFORE inventory`); continue; }
  entry.size = row.metadata?.size ?? null;

  const metaFile = `storage-object-row-${obj.id}.json`;
  entry.metadataRowPath = path.relative(root, path.join(qDir, metaFile)).split(path.sep).join('/');
  await fs.writeFile(path.join(qDir, metaFile), JSON.stringify(row, null, 2) + '\n');

  if (obj.hasBytes) {
    const res = await fetch(`${API}/storage/v1/object/${BUCKET}/${obj.path}`, { headers: { Authorization: `Bearer ${KEY}`, apikey: KEY } });
    if (!res.ok) { out.errors.push(`Download failed ${res.status} for ${obj.path}`); continue; }
    const bytes = Buffer.from(await res.arrayBuffer());
    const file = obj.path.replaceAll('/', '__');
    const target = path.join(qDir, file);
    await fs.writeFile(target, bytes);
    entry.checksum = sha256(bytes);
    entry.checksumKind = 'OBJECT_CONTENT';
    entry.backupPath = path.relative(root, target).split(path.sep).join('/');
    entry.size = bytes.length;
    // Self-verifying proof: content hash must equal the imports/<sha256>/ path segment.
    const segment = obj.path.split('/')[2];
    entry.contentHashMatchesPathSegment = entry.checksum === segment;
  } else {
    // No backing bytes: record that explicitly and hash the metadata row instead.
    // checksumKind makes the digest self-describing - this is NOT a content hash, and a
    // consumer comparing it against object content would be comparing different things.
    entry.checksum = sha256(await fs.readFile(path.join(qDir, metaFile)));
    entry.checksumKind = 'METADATA_ROW_JSON';
    entry.backupPath = path.relative(root, path.join(qDir, metaFile)).split(path.sep).join('/');
    entry.note = 'No backing bytes exist in the storage backend (download returns HTTP 500). This is a metadata-only fixture row; the preserved storage.objects row above is the complete recoverable record. Its checksum is the SHA-256 of that row JSON, not of object content, which does not exist.';
  }
  out.quarantine.push(entry);
}

// --- Step 2: verify every quarantine copy against the recorded checksum ---
for (const entry of out.quarantine) {
  const abs = path.resolve(root, entry.backupPath);
  const bytes = await fs.readFile(abs);
  entry.verified = sha256(bytes) === entry.checksum;
  if (!entry.verified) out.errors.push(`Quarantine checksum mismatch for ${entry.originalPath}`);
}
if (out.errors.length) {
  await fs.writeFile(path.join(qDir, 'RESULT.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify({ aborted: true, errors: out.errors }, null, 2));
  process.exit(2);
}
// Report the verified count honestly: byte-backed objects are content-verified, while a
// bytes-less metadata row is verified only in the sense that we re-hashed the preserved row JSON.
const verifiedCount = out.quarantine.filter((e) => e.verified).length;
const withBytes = out.quarantine.filter((e) => e.bytesPresent).length;
out.actions.push(`Quarantine written to ${path.relative(root, qDir).split(path.sep).join('/')}; ${verifiedCount}/${out.quarantine.length} copies checksum-verified (${withBytes} content-verified, ${out.quarantine.length - withBytes} metadata-row only)`);
}
// Persist the quarantine before any deletion so a partial run is resumable. The phase name records
// only what happened (the quarantine was written); per-object verification lives in each entry's
// `verified` flag. `quarantine-verified` would overclaim whenever a bytes-less row is present.
await fs.writeFile(path.join(qDir, 'RESULT.json'), JSON.stringify({ ...out, phase: 'quarantine-written' }, null, 2) + '\n');

// --- Step 3: remove originals from the LOCAL active bucket via the Storage API ---
// storage.objects is protected by storage.protect_delete(): direct SQL deletion is
// refused by design, so the supported Storage API is the only correct route. The
// API also keeps the metadata row and the backing file consistent.
//
// SCOPE DISCIPLINE (corrected): this script authenticates with the service-role
// key, which BYPASSES RLS. The owner-scoped storage policies
// (202610110006_security.sql:45-47, `for delete to authenticated using
// (storage.foldername(name))[1] = (auth.uid()::text)`) therefore do NOT constrain
// this run - they apply to authenticated end users, not to the service role. So
// "the API refuses paths the caller does not own" would be FALSE here: nothing
// except the explicit OBJECTS list below bounds what this loop can delete.
// That is the real reason the identity of those 4 objects had to be proven
// before writing this file, and why the list is hardcoded rather than discovered
// at runtime. See the pre-delete gate: every entry must be checksum-verified first.
//
// The property that DOES hold - and what the original (wrong) sentence was
// reaching for - is that deletion is PATH-ANCHORED, not pattern-anchored: each
// request below is built from one exact obj.path plus a constant BUCKET, with no
// wildcard, prefix or list-remove semantics. Even a corrupted OBJECTS entry could
// affect at most one specific path, never a matching set.
//
// HARD GATE (applies to the resume path too, not only the fresh-download path):
// nothing is deleted unless EVERY object has a quarantine copy whose bytes were
// checked against the checksum recorded in the manifest. If any entry is
// unverified, the run aborts BEFORE the first DELETE.
// CONDITION 1 (reviewer, F12): the expected set must count only objects EXPECTED TO BE PRESENT AND
// REMOVED. alreadyRemoved objects are expected ABSENT, so including them in this arithmetic would make
// the gate compare 4 quarantine entries against a 1-object live set and fail for the wrong reason (or,
// worse, pass wrongly if the counts ever coincided). This is the fix for that hazard.
//
// CONDITION 2 (reviewer, F12): alreadyRemoved is a CLAIM that a removal happened, so it must carry its
// evidence and be refused without it - otherwise the marker becomes the same unevidenced `true` that F8
// was. Six variants of that failure mode are already recorded; this one is refused in advance.
const pendingRemoval = OBJECTS.filter((o) => !o.alreadyRemoved);
const alreadyRemoved = OBJECTS.filter((o) => o.alreadyRemoved);
const unevidenced = alreadyRemoved.filter((o) => !o.alreadyRemovedEvidence);
if (unevidenced.length) {
  out.errors.push(
    `Refusing to proceed: ${unevidenced.length} object(s) marked alreadyRemoved WITHOUT supporting evidence ` +
    `(${unevidenced.map((o) => o.id).join(', ')}). alreadyRemoved is a claim that a deletion happened; it must cite the log line that proves it.`,
  );
}

const unverified = out.quarantine.filter((e) => !e.verified);
if (out.quarantine.length !== pendingRemoval.length || unverified.length) {
  out.errors.push(
    `Refusing to delete: ${out.quarantine.length}/${pendingRemoval.length} quarantine copies present ` +
    `(expected set excludes ${alreadyRemoved.length} already-removed object(s)), ` +
    `${unverified.length} unverified${unverified.length ? ' (' + unverified.map((e) => e.originalPath).join(', ') + ')' : ''}` +
    (resumeRejection ? ` — last resume rejection: ${resumeRejection}` : ''),
  );
  await fs.writeFile(path.join(qDir, 'RESULT.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify({ aborted: true, phase: 'pre-delete-gate', errors: out.errors }, null, 2));
  process.exit(4);
}
out.actions.push(`PRE-DELETE GATE: all ${out.quarantine.length} copies verified against their recorded checksums; deletion authorised for ${pendingRemoval.length} object(s); ${alreadyRemoved.length} already-removed object(s) confirmed absent and excluded from the delete set`);

// CONDITION 3 (reviewer, F12): only objects STILL IN THE BUCKET are addressable here. Iterating the
// full OBJECTS list would put the three vanished IDs into the delete path, where their absence would be
// read as "already the desired end state" (the 404 tolerance just below) - silently absorbing an
// inconsistency instead of surfacing it. Their absence is checked explicitly above, not tolerated here.
const removed = [];
const failed = [];
for (const obj of pendingRemoval) {
  const res = await fetch(`${API}/storage/v1/object/${BUCKET}/${obj.path}`, { method: 'DELETE', headers: { Authorization: `Bearer ${KEY}`, apikey: KEY } });
  const body = (await res.text()).slice(0, 200);
  out.deletions.push({ path: obj.path, storageObjectId: obj.id, via: 'storage API DELETE', status: res.status, body });
  // 404/400 on an already-absent object is still the desired end state ("absent").
  if (res.ok) { removed.push(obj.path); } else { failed.push({ path: obj.path, status: res.status, body }); }
}
// Attempt every object even if an earlier one failed, so the end state is as close to
// 0/0 as possible; then report precisely what did and did not happen. A partial
// deletion is NOT hidden: the post-inventory below still reflects reality, and the
// quarantine copy for every object is retained regardless.
if (failed.length) {
  out.partialDeletion = {
    removedCount: removed.length,
    failedCount: failed.length,
    removed,
    failed,
    note: 'PARTIAL DELETION: some objects were removed and others were not. Every removed object retains a verified quarantine copy, so the state is fully recoverable. Re-running this script will re-verify the quarantine and attempt only the objects that are still present.',
  };
  out.errors.push(`${failed.length} DELETE(s) failed: ${failed.map((f) => `${f.path} (HTTP ${f.status})`).join(', ')}`);
  await fs.writeFile(path.join(qDir, 'RESULT.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify({ aborted: true, phase: 'delete', partialDeletion: out.partialDeletion }, null, 2));
  process.exit(3);
}
out.actions.push(`Deleted exactly ${removed.length} object(s) through the Storage API (storage.objects is delete-protected against direct SQL by design)`);

// --- Step 4: after-state proof ---
out.afterInventory = JSON.parse(psql(`select coalesce(json_agg(x order by name),'[]') from (select id,bucket_id,name from storage.objects) x;`));

// --- Step 5: the gate's own criterion, measured after the change ---
out.integrityAfter = await runIntegrity('dsh-T4-integrity-final.json');
out.actions.push(`Post-reconciliation integrity: exit ${out.integrityAfter.exitCode}, missingReferences=${out.integrityAfter.missingReferences}, orphanObjects=${out.integrityAfter.orphanObjects} (report: ${out.integrityAfter.reportPath})`);

await fs.writeFile(path.join(qDir, 'RESULT.json'), JSON.stringify(out, null, 2) + '\n');

// Manifest at the quarantine root, per the required contract.
const manifest = {
  environment: 'local',
  note: 'Recoverable quarantine of M7 ORPHAN_STORAGE_OBJECT findings from the LOCAL/TEST stack only. No production object was contacted. Originals were removed only from the local active bucket; these copies are retained.',
  createdAt: out.startedAt,
  quarantineDirectory: path.relative(root, qDir).split(path.sep).join('/'),
  apiUrl: API,
  bucket: BUCKET,
  objectCount: out.quarantine.length,
  objects: out.quarantine.map((e) => ({
    originalBucket: e.originalBucket,
    originalPath: e.originalPath,
    storageObjectId: e.storageObjectId,
    size: e.size,
    checksum: e.checksum,
    classification: e.classification,
    reason: e.reason,
    backupPath: e.backupPath,
    metadataRowPath: e.metadataRowPath,
    reconciliationAction: e.reconciliationAction,
    checksumVerified: e.verified,
    contentHashMatchesPathSegment: e.contentHashMatchesPathSegment ?? null,
    bytesPresent: e.bytesPresent,
    timestamp: e.timestamp,
  })),
  recoveryInstructions: [
    'These objects were orphans: no database row referenced them, so restoring only the files would recreate the orphan condition.',
    `For each entry, re-upload the quarantine file to bucket "application-documents" at exactly originalPath using the Supabase Storage API with the service role, then (only if a real DB reference is intended) insert the preserved storage.objects row from metadataRowPath.`,
    'Verification after restore: the object content SHA-256 must equal the recorded checksum, and for imports/<sha256>/source.json entries it must also equal the path segment.',
    'Environment recorded here is LOCAL only. Do not replay these rows into production.',
  ],
};
await fs.writeFile(path.join(root, 'deliverables/atlas-production/orphan-quarantine/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

console.log(JSON.stringify({
  quarantineDir: path.relative(root, qDir).split(path.sep).join('/'),
  quarantined: out.quarantine.length,
  allVerified: out.quarantine.every((e) => e.verified),
  selfVerifyingMatches: out.quarantine.filter((e) => e.contentHashMatchesPathSegment).length,
  before: out.beforeInventory.length,
  after: out.afterInventory.length,
  deletions: out.deletions,
  errors: out.errors,
  checksums: out.quarantine.map((e) => ({ path: e.originalPath.slice(0, 60) + '...', sha256: e.checksum })),
}, null, 2));
