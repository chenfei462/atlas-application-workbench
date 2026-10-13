import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const validator = path.join(root, 'scripts', 'validate-local-backup.mjs');
const manifest = path.join(root, 'scripts', 'migration-manifest.mjs');

function runNode(script, file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, file], { cwd: root });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function withBackup(data, callback) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-backup-'));
  const file = path.join(directory, 'backup.json');
  await fs.writeFile(file, JSON.stringify(data), 'utf8');
  try { return await callback(file); } finally { await fs.rm(directory, { recursive: true, force: true }); }
}

const validBackup = {
  schemaVersion: 2,
  programs: [{ id: 'p1', applicationRounds: [{ id: 'r1' }] }],
  applications: [{ id: 'a1', programId: 'p1', targetRoundId: 'r1' }],
  essays: [{ id: 'e1', applicationId: 'a1' }],
  recommenders: [{ id: 'rec1' }],
  recommendationRequests: [{ id: 'rr1', applicationId: 'a1', recommenderId: 'rec1' }],
};

test('validates a backup and emits a stable migration checksum', async () => {
  await withBackup(validBackup, async (file) => {
    const validation = await runNode(validator, file);
    assert.equal(validation.code, 0);
    const parsed = JSON.parse(validation.stdout);
    assert.equal(parsed.status, 'VALID');
    assert.match(parsed.checksum, /^[a-f0-9]{64}$/);

    const dryRun = await runNode(manifest, file);
    assert.equal(dryRun.code, 0);
    const output = JSON.parse(dryRun.stdout);
    assert.equal(output.mode, 'DRY_RUN');
    assert.equal(output.idempotencyKey, parsed.checksum);
    assert.equal(output.tableCounts.applications, 1);
  });
});

test('validator and manifest reject duplicate IDs, wrong-program rounds and broken version references', async () => {
  const invalid = [
    { ...validBackup, materials: [{ id: 'm1' }, { id: 'm1' }] },
    { ...validBackup, programs: [...validBackup.programs, { id: 'p2', applicationRounds: [{ id: 'r2' }] }], applications: [{ id: 'a1', programId: 'p1', targetRoundId: 'r2' }] },
    { ...validBackup, materialVersions: [{ id: 'mv1', materialId: 'missing', version: 1 }] },
    { ...validBackup, essayVersions: [{ id: 'ev1', essayId: 'missing', version: 1 }] },
    { ...validBackup, recommendationRequests: [{ id: 'rr1', applicationId: 'a1', recommenderId: 'missing' }] },
    { ...validBackup, decisions: [{ id: 'd1', applicationId: 'missing' }] },
    { ...validBackup, tasks: {} },
  ];
  for (const data of invalid) await withBackup(data, async file => {
    for (const script of [validator, manifest]) {
      const result = await runNode(script, file);
      assert.notEqual(result.code, 0, `${path.basename(script)} accepted invalid backup`);
    }
  });
});

test('migration manifest includes every version and audit count', async () => {
  const data = { ...validBackup, materials: [{ id: 'm1' }], materialVersions: [{ id: 'mv1', materialId: 'm1', version: 1 }], essayVersions: [{ id: 'ev1', essayId: 'e1', version: 1 }], auditLog: [{ id: 'audit1' }] };
  await withBackup(data, async file => {
    const result = await runNode(manifest, file);
    assert.equal(result.code, 0);
    const counts = JSON.parse(result.stdout).tableCounts;
    assert.equal(counts.material_versions, 1);
    assert.equal(counts.essay_versions, 1);
    assert.equal(counts.audit_events, 1);
  });
});

test('rejects unsupported schema and broken parent references', async () => {
  await withBackup({ ...validBackup, schemaVersion: 1 }, async (file) => {
    const result = await runNode(validator, file);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /Unsupported schemaVersion/);
  });

  await withBackup({ ...validBackup, applications: [{ id: 'a1', programId: 'missing' }] }, async (file) => {
    const result = await runNode(validator, file);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /references missing Program/);
  });
});

test('rejects malformed JSON', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-backup-invalid-'));
  const file = path.join(directory, 'backup.json');
  await fs.writeFile(file, '{not-json', 'utf8');
  try {
    const result = await runNode(validator, file);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /Invalid JSON backup/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
