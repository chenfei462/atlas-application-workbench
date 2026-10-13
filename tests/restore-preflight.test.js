import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { restore } from '../scripts/restore.mjs';

test('incompatible schema blocks restore before any database or storage mutation', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-restore-preflight-'));
  const calls = [];
  const security = { version: 2, functions: [], triggers: [], policies: [], tables: [] };
  try {
    await fs.writeFile(path.join(dir, 'atlas-export.json'), JSON.stringify({ tables: {} }));
    const operations = {
      settings: () => ({ API_URL: 'http://127.0.0.1:55431', DB_URL: 'postgres://localhost:55432/postgres' }),
      project: () => 'supabase_db_atlas-restore-test',
      verifyBundle: async () => ({ migrationHead: '202610110015', schemaSecurity: security, objects: [] }),
      sql: (_db, query) => { calls.push(query); return query.includes('max(version)') ? '202610110015' : '0'; },
      command: () => { calls.push('DATABASE_MUTATION'); throw new Error('write must not run'); },
      api: async () => { calls.push('STORAGE_MUTATION'); throw new Error('write must not run'); },
      schemaSecurity: () => ({ ...security, functions: [{ definition: 'changed' }] }),
    };
    await assert.rejects(restore(dir, dir, { operations }), /Schema security definitions differ/);
    assert.ok(!calls.includes('DATABASE_MUTATION'));
    assert.ok(!calls.includes('STORAGE_MUTATION'));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

async function copiedCLI(args) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-restore-cli-'));
  try {
    await fs.cp(path.resolve(import.meta.dirname, '../scripts'), path.join(dir, 'scripts'), { recursive: true });
    const result = spawnSync(process.execPath, ['scripts/restore-test.mjs', ...args], {
      cwd: dir, env: { ...process.env, PATH: '' }, encoding: 'utf8',
    });
    assert.equal(await fs.stat(path.join(dir, 'work')).catch(() => null), null, 'CLI validation must not create work artifacts');
    return result;
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

test('restore help exits without invoking the source CLI or creating a fixture', async () => {
  const result = await copiedCLI(['--help']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage:.*restore-test/s);
});

test('unknown, duplicate and missing CLI arguments fail before any artifact is created', async () => {
  for (const args of [['--unknown'], ['--bundle'], ['--report'], ['--target', 'a', '--target-cwd', 'b'], ['--resume', '--resume']]) {
    const result = await copiedCLI(args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /RESTORE_ARGUMENTS_INVALID/);
  }
});

test('existing target configuration rejects data-bearing stacks, wrong ports and realpath escape', async () => {
  const { assertIsolatedTargetConfig } = await import('../scripts/restore-preflight.mjs');
  const config = 'project_id = "atlas-restore-example"\n[api]\nport = 55431\n[db]\nport = 55432\n';
  const base = path.resolve(os.tmpdir(), 'atlas-test', 'work');
  const target = path.join(base, 'fresh-target');
  assert.doesNotThrow(() => assertIsolatedTargetConfig(config, base, target));
  for (const invalid of [config.replace('atlas-restore-example', 'atlas-local-01a12938'), config.replace('55431', '55421'), config.replace('55432', '5432')]) {
    assert.throws(() => assertIsolatedTargetConfig(invalid, base, target), /BLOCKED_RESTORE_TARGET/);
  }
  assert.throws(() => assertIsolatedTargetConfig(config, base, path.resolve(base, '../../outside')), /BLOCKED_RESTORE_TARGET/);
});

const columns = [{ name: 'id', type: 'uuid', nullable: false }];
function compatible() {
  const fingerprints = [
    { schema: 'auth', name: 'identities', rowCount: 1, digest: 'a'.repeat(32) },
    { schema: 'auth', name: 'mfa_factors', rowCount: 0, digest: 'd41d8cd98f00b204e9800998ecf8427e' },
    { schema: 'auth', name: 'schema_migrations', rowCount: 1, digest: 'b'.repeat(32) },
    { schema: 'auth', name: 'sessions', rowCount: 2, digest: 'c'.repeat(32) },
    { schema: 'auth', name: 'users', rowCount: 1, digest: 'd'.repeat(32) },
  ];
  const source = { mode: 'isolated-test', postgresVersion: '17.6', postgresMajor: 17,
    databaseTables: [{ schema: 'public', name: 'profiles', kind: 'r', columns }, ...fingerprints.map(({ name }) => ({ schema: 'auth', name, kind: 'r', columns }))],
    authTables: fingerprints.map(row => row.name), contentFingerprints: fingerprints, schemaConstraints: [], schemaIndexes: [] };
  return { manifest: { formatVersion: 1, environment: 'Atlas explicit source backup', source }, target: structuredClone(source) };
}

test('new engine manifest requires known PostgreSQL and full account compatibility metadata', async () => {
  const { assertRestoreCompatibility } = await import('../scripts/restore-preflight.mjs');
  const { manifest, target } = compatible();
  const result = assertRestoreCompatibility(manifest, target);
  assert.equal(result.authCompatibility, 'VERIFIED_ACCOUNTS_IDENTITIES');
  assert.deepEqual(result.omittedAuthState.map(row => row.table), ['sessions']);
  for (const invalid of [{ ...manifest, source: undefined }, { ...manifest, source: { ...manifest.source, postgresMajor: 16 } }, { ...manifest, source: { ...manifest.source, authTables: ['users'] } }]) {
    assert.throws(() => assertRestoreCompatibility(invalid, target), /BLOCKED_RESTORE_COMPATIBILITY/);
  }
  const drift = structuredClone(target);
  drift.databaseTables.find(row => row.name === 'identities').columns[0].type = 'text';
  assert.throws(() => assertRestoreCompatibility(manifest, drift), /BLOCKED_RESTORE_COMPATIBILITY/);
  const unknownAuthVersion = structuredClone(manifest);
  unknownAuthVersion.source.authTables = unknownAuthVersion.source.authTables.filter(name => name !== 'schema_migrations');
  unknownAuthVersion.source.databaseTables = unknownAuthVersion.source.databaseTables.filter(table => table.name !== 'schema_migrations');
  unknownAuthVersion.source.contentFingerprints = unknownAuthVersion.source.contentFingerprints.filter(table => table.name !== 'schema_migrations');
  assert.throws(() => assertRestoreCompatibility(unknownAuthVersion, target), /BLOCKED_RESTORE_COMPATIBILITY/);
});

test('MFA and unknown nonempty auth state block before accounts can lose protection', async () => {
  const { assertRestoreCompatibility } = await import('../scripts/restore-preflight.mjs');
  for (const name of ['mfa_factors', 'sso_providers', 'new_protection_state']) {
    const { manifest, target } = compatible();
    if (name === 'mfa_factors') manifest.source.contentFingerprints.find(row => row.name === name).rowCount = 1;
    else {
      manifest.source.authTables.push(name);
      manifest.source.databaseTables.push({ schema: 'auth', name, kind: 'r', columns });
      manifest.source.contentFingerprints.push({ schema: 'auth', name, rowCount: 1, digest: 'e'.repeat(32) });
    }
    assert.throws(() => assertRestoreCompatibility(manifest, target), /BLOCKED_UNSUPPORTED_AUTH_STATE/);
  }
});

test('auth accounts and identities require exact row counts and content fingerprints after restore', async () => {
  const { assertRestoredAuth, assertRestoreCompatibility } = await import('../scripts/restore-preflight.mjs');
  const { manifest, target } = compatible();
  const rows = manifest.source.contentFingerprints.filter(row => ['users', 'identities'].includes(row.name));
  assert.doesNotThrow(() => assertRestoredAuth(manifest, rows));
  for (const changed of [rows.map(row => ({ ...row, rowCount: 0 })), rows.map(row => ({ ...row, digest: '0'.repeat(32) }))]) {
    assert.throws(() => assertRestoredAuth(manifest, changed), /Restored auth/);
  }
  target.contentFingerprints.find(row => row.name === 'schema_migrations').digest = '0'.repeat(32);
  assert.throws(() => assertRestoreCompatibility(manifest, target), /BLOCKED_RESTORE_COMPATIBILITY/);
  assert.equal(assertRestoreCompatibility({ environment: 'http://127.0.0.1:55451' }, {}).authCompatibility, 'LEGACY_AUTH_COMPATIBILITY_UNKNOWN');
});

test('normalized rows compare by content across SQL JSON and REST object ordering', async () => {
  const { canonicalRows } = await import('../scripts/restore-preflight.mjs');
  const expected = [{ id: 'a', metadata: { y: 2, x: 1 }, name: 'first' }, { id: 'b', name: 'second' }];
  const actual = [{ name: 'second', id: 'b' }, { metadata: { x: 1, y: 2 }, name: 'first', id: 'a' }];
  assert.equal(canonicalRows(expected), canonicalRows(actual));
  actual[0].name = 'changed';
  assert.notEqual(canonicalRows(expected), canonicalRows(actual));
});

test('PostgreSQL or Auth column drift blocks the real restore workflow before writes', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-restore-compat-'));
  const security = { version: 2, functions: [], triggers: [], policies: [], tables: [] };
  try {
    await fs.writeFile(path.join(dir, 'atlas-export.json'), JSON.stringify({ tables: {} }));
    for (const drift of ['postgres', 'auth']) {
      const { manifest, target } = compatible();
      Object.assign(manifest, { migrationHead: '202610110015', schemaSecurity: security, objects: [] });
      if (drift === 'auth') target.databaseTables.find(table => table.name === 'users').columns = [{ name: 'different', type: 'text', nullable: true }];
      const writes = [];
      const operations = {
        settings: () => ({ API_URL: 'http://127.0.0.1:55431', DB_URL: 'postgres://localhost:55432/postgres' }),
        project: () => 'supabase_db_atlas-restore-test', verifyBundle: async () => manifest,
        schemaSecurity: () => security,
        sql: (_db, query) => query.includes('max(version)') ? manifest.migrationHead : query.includes("current_setting('server_version')") ? drift === 'postgres' ? '16.4' : '17.6' : query.includes('pg_constraint') || query.includes('pg_index') ? '[]' : query.includes('pg_class c') ? JSON.stringify(target.databaseTables) : query.includes('schema_migrations') ? JSON.stringify(target.contentFingerprints.find(row => row.name === 'schema_migrations')) : '0',
        command: () => { writes.push('database'); }, api: async () => { writes.push('storage'); },
      };
      await assert.rejects(restore(dir, dir, { operations }), /BLOCKED_RESTORE_COMPATIBILITY/);
      assert.deepEqual(writes, []);
    }
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('existing restore config behind an escaping work junction is rejected before startup', async () => {
  const { validateRestoreTarget } = await import('../scripts/restore-preflight.mjs');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-target-junction-'));
  try {
    const work = path.join(dir, 'work'), outside = path.join(dir, 'outside');
    await fs.mkdir(work); await fs.mkdir(path.join(outside, 'supabase'), { recursive: true });
    await fs.writeFile(path.join(outside, 'supabase/config.toml'), 'project_id = "atlas-restore-test"\n[api]\nport = 55431\n[db]\nport = 55442\n');
    await fs.symlink(outside, path.join(work, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(validateRestoreTarget(path.join(work, 'escape'), dir, { resume: true }), /BLOCKED_RESTORE_TARGET/);
    await assert.rejects(validateRestoreTarget(path.join(work, 'missing'), dir, { resume: true }), /BLOCKED_RESTORE_TARGET/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('restored byte files also require preserved bucket/path/owner inventory', async () => {
  const { assertRestoredObjects } = await import('../scripts/restore-preflight.mjs');
  const objects = [{ bucket: 'application-documents', path: 'owner/material.pdf', owner: null }];
  assert.doesNotThrow(() => assertRestoredObjects(objects, [{ bucket_id: objects[0].bucket, name: objects[0].path, owner_id: null }]));
  assert.throws(() => assertRestoredObjects(objects, [{ bucket_id: objects[0].bucket, name: objects[0].path, owner_id: 'different-owner' }]), /Restored storage/);
  assert.throws(() => assertRestoredObjects(objects, []), /Restored storage/);
  assert.throws(() => assertRestoredObjects(objects, [{ bucket_id: objects[0].bucket, name: objects[0].path, owner_id: null }, { bucket_id: 'other', name: 'orphan', owner_id: null }]), /Restored storage/);
});

test('new engine constraint and index drift is rejected despite matching migration head and columns', async () => {
  const { assertRestoreCompatibility } = await import('../scripts/restore-preflight.mjs');
  const { manifest, target } = compatible();
  const constraint = { schema: 'public', table: 'profiles', name: 'profiles_pkey', type: 'p', definition: 'PRIMARY KEY (id)', deferrable: false, deferred: false, validated: true };
  const index = { schema: 'public', table: 'profiles', name: 'profiles_pkey', definition: 'CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id)', unique: true, primary: true, valid: true, ready: true };
  manifest.source.schemaConstraints = [constraint]; target.schemaConstraints = [structuredClone(constraint)];
  manifest.source.schemaIndexes = [index]; target.schemaIndexes = [structuredClone(index)];
  assert.doesNotThrow(() => assertRestoreCompatibility(manifest, target));
  for (const field of ['schemaConstraints', 'schemaIndexes']) {
    const changed = structuredClone(target);
    changed[field][0].definition = 'changed';
    assert.throws(() => assertRestoreCompatibility(manifest, changed), /BLOCKED_RESTORE_COMPATIBILITY/);
    changed[field] = [];
    assert.throws(() => assertRestoreCompatibility(manifest, changed), /BLOCKED_RESTORE_COMPATIBILITY/);
    const missing = structuredClone(manifest); delete missing.source[field];
    assert.throws(() => assertRestoreCompatibility(missing, target), /BLOCKED_RESTORE_COMPATIBILITY/);
  }
});

test('same-ID bucket privacy, size and MIME drift block the restore workflow before any write', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-restore-bucket-'));
  const security = { version: 2, functions: [], triggers: [], policies: [], tables: [] };
  const bucket = { id: 'application-documents', public: false, file_size_limit: 52428800, allowed_mime_types: ['application/pdf'] };
  try {
    await fs.writeFile(path.join(dir, 'atlas-export.json'), JSON.stringify({ tables: {} }));
    for (const change of [{ public: true }, { file_size_limit: null }, { allowed_mime_types: null }]) {
      const mutations = [];
      const operations = {
        settings: () => ({ API_URL: 'http://127.0.0.1:55431', DB_URL: 'postgres://localhost:55432/postgres' }),
        project: () => 'supabase_db_atlas-restore-test',
        verifyBundle: async () => ({ migrationHead: '202610110015', schemaSecurity: security, objects: [], buckets: [bucket] }),
        schemaSecurity: () => security,
        sql: (_db, query) => query.includes('max(version)') ? '202610110015' : '0',
        command: () => { mutations.push('database'); throw Error('write must not run'); },
        api: async (_settings, route, options) => {
          if (options?.method && options.method !== 'GET') mutations.push('storage');
          assert.equal(route, '/storage/v1/bucket');
          return { json: async () => [{ ...bucket, ...change }] };
        },
      };
      await assert.rejects(restore(dir, dir, { operations }), /BLOCKED_RESTORE_BUCKET_SECURITY/);
      assert.deepEqual(mutations, []);
    }
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('source buckets require exact security after restore while fresh missing buckets may be created', async () => {
  const { assertRestoreBuckets } = await import('../scripts/restore-preflight.mjs');
  const bucket = { id: 'application-documents', public: false, file_size_limit: null, allowed_mime_types: ['image/png', 'application/pdf'] };
  assert.doesNotThrow(() => assertRestoreBuckets([bucket], [], { allowMissing: true }));
  assert.throws(() => assertRestoreBuckets([bucket], []), /BLOCKED_RESTORE_BUCKET_SECURITY/);
  assert.throws(() => assertRestoreBuckets([bucket], [{ ...bucket, public: true }]), /BLOCKED_RESTORE_BUCKET_SECURITY/);
  assert.doesNotThrow(() => assertRestoreBuckets([bucket], [{ ...bucket, allowed_mime_types: ['application/pdf', 'image/png'] }, { id: 'platform-extra', public: false }]));
});

test('storage table column drift is a compatibility block before restoring through the Storage API', async () => {
  const { assertRestoreCompatibility } = await import('../scripts/restore-preflight.mjs');
  const { manifest, target } = compatible();
  const storage = { schema: 'storage', name: 'objects', kind: 'r', columns: [{ name: 'owner_id', type: 'text', nullable: true }] };
  manifest.source.databaseTables.push(storage);
  manifest.source.contentFingerprints.push({ schema: 'storage', name: 'objects', rowCount: 1, digest: 'f'.repeat(32) });
  target.databaseTables.push(structuredClone(storage));
  assert.doesNotThrow(() => assertRestoreCompatibility(manifest, target));
  target.databaseTables.find(table => table.schema === 'storage').columns[0].type = 'uuid';
  assert.throws(() => assertRestoreCompatibility(manifest, target), /BLOCKED_RESTORE_COMPATIBILITY/);
});

test('a missing config cannot make a supabase subdirectory junction writable outside its target', async () => {
  const { validateRestoreTarget } = await import('../scripts/restore-preflight.mjs');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-supabase-junction-'));
  try {
    const work = path.join(dir, 'work'), target = path.join(work, 'fresh-target'), outside = path.join(dir, 'outside');
    await fs.mkdir(target, { recursive: true }); await fs.mkdir(outside);
    await fs.symlink(outside, path.join(target, 'supabase'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(validateRestoreTarget(target, dir), /BLOCKED_RESTORE_TARGET/);
    assert.deepEqual(await fs.readdir(outside), [], 'validation must not create files in the junction target');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
