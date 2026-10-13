// M21 Offline Draft / Recovery Harness
// Tests that drafts survive network failures and clear on successful saves.
// Uses real local Supabase; simulates network failure via dead port.

import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createClient} from '@supabase/supabase-js';

const root = path.resolve(import.meta.dirname, '..');

// Re-run via tsx if needed
const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const runningWithTsx = process.env.ATLAS_M21_TSX_REEXEC === '1' || process.execArgv.some(arg => arg.includes('tsx'));
if (!runningWithTsx) {
  const child = spawnSync(process.execPath, [tsxCli, fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    cwd: root,
    env: {...process.env, ATLAS_M21_TSX_REEXEC: '1'},
    stdio: 'inherit',
  });
  process.exit(child.status ?? 1);
}

// Memory storage simulating browser localStorage
class MemoryStorage {
  #map = new Map();
  getItem(key) { return this.#map.get(key) ?? null; }
  setItem(key, value) { this.#map.set(key, value); }
  removeItem(key) { this.#map.delete(key); }
}

async function run() {
  const {repository} = await import('../src/repositories.ts');
  const {DraftRecovery} = await import('../src/drafts.ts');
  const {saveEssayDraft} = await import('../src/essay-save.ts');

  // 1. Verify local Supabase is running (without stopping anything)
  const binary = path.join(root, 'node_modules/supabase/dist/supabase.js');
  const status = spawnSync(process.execPath, [binary, 'status', '--output', 'json'], {cwd: root, encoding: 'utf8'});
  assert.equal(status.status, 0, 'Local Supabase must be running');
  const config = JSON.parse(status.stdout);
  assert.equal(config.API_URL, 'http://127.0.0.1:55421', 'Restricted to Atlas local stack');
  assert.equal(config.API_URL?.includes('127.0.0.1'), true, 'Should be localhost');

  const admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, {auth: {persistSession: false, autoRefreshToken: false}});
  const anonClient = createClient(config.API_URL, config.ANON_KEY, {auth: {persistSession: false, autoRefreshToken: false}});

  let owner = null;
  const cleanupErrors = [];

  try {
    // 2. Create a fake user
    const email = `m21-${crypto.randomUUID()}@example.invalid`;
    const password = crypto.randomBytes(16).toString('base64url');
    const signUp = await anonClient.auth.signUp({email, password});
    owner = signUp.data.user?.id ?? null;
    assert.equal(signUp.error, null, JSON.stringify(signUp.error));
    assert.ok(signUp.data.user && signUp.data.session, 'Signup must return session');

    // 3. Create profile
    await repository(anonClient, owner, 'profiles').insert({id: owner, display_name: 'M21 Draft Test', timezone: 'Asia/Hong_Kong'});

    // 4. Create a per-run university
    const university = await repository(anonClient, owner, 'universities').insert({
      owner_id: owner,
      name: `M21 University ${crypto.randomUUID().slice(0, 8)}`
    });

    // 5. Create a minimal data chain: program -> round -> application
    const program = await repository(anonClient, owner, 'programs').insert({
      university_id: university.id,
      program_name: 'M21 Fake Program',
      intake_year: 2027
    });
    const round = await repository(anonClient, owner, 'application_rounds').insert({
      program_id: program.id,
      name: 'Round 1',
      sort_order: 1,
      deadline_date: '2027-01-15',
      deadline_precision: 'DATE_ONLY',
      timezone: 'Asia/Hong_Kong'
    });
    const application = await repository(anonClient, owner, 'applications').insert({
      owner_id: owner,
      program_id: program.id,
      target_round_id: round.id,
      status: 'PREPARING'
    });

    // 5. Create a program_essay_requirement and an essay
    const er = await repository(anonClient, owner, 'program_essay_requirements').insert({
      owner_id: owner,
      program_id: program.id,
      essay_type: 'PS',
      source_id: null
    });
    const essay = await repository(anonClient, owner, 'essays').insert({
      owner_id: owner,
      application_id: application.id,
      program_essay_requirement_id: er.id,
      type: 'PS'
    });

    // 6. Create initial essay version (to have something to update)
    const initialVersion = await repository(anonClient, owner, 'essay_versions').insert({
      id: crypto.randomUUID(),
      owner_id: owner,
      essay_id: essay.id,
      version_number: 1,
      content: 'Initial version content',
      word_count: 5
    });
    await repository(anonClient, owner, 'essays').update(essay.id, {current_version_number: initialVersion.version_number});

    // 7. Initialize DraftRecovery with memory storage
    const storage = new MemoryStorage();
    const recovery = new DraftRecovery(storage, owner);
    const draftKey = essay.id;
    const draftContent = 'This is a partial draft that should survive a network failure.';

    // Write a draft
    recovery.write(draftKey, draftContent, initialVersion.version_number);

    // 8. Verify draft is saved (before any network call)
    const draftBefore = recovery.read(draftKey);
    assert.ok(draftBefore, 'Draft should exist after write');
    assert.equal(draftBefore.content, draftContent);

    // 9. Attempt the production essay save path against a dead endpoint.
    const deadClient = createClient('http://127.0.0.1:59999', config.ANON_KEY, {auth: {persistSession: false, autoRefreshToken: false}});
    await assert.rejects(
      saveEssayDraft(deadClient, recovery, {essayId: draftKey, content: draftContent, baseVersion: initialVersion.version_number}),
      error => error?.kind === 'NETWORK_ERROR',
      'Failed save must report a network error',
    );

    // 10. Verify draft still exists (because save didn't succeed)
    const draftAfter = recovery.read(draftKey);
    assert.ok(draftAfter, 'Draft must survive network failure');
    assert.equal(draftAfter.content, draftContent);

    // 11. Retry the same production path after connectivity returns.
    const savedVersion = await saveEssayDraft(anonClient, recovery, {
      essayId: draftKey,
      content: draftAfter.content,
      baseVersion: draftAfter.baseVersion,
    });
    assert.equal(savedVersion, initialVersion.version_number + 1);
    const savedEssay = await repository(anonClient, owner, 'essays').get(essay.id);
    assert.equal(savedEssay.current_version_number, savedVersion);
    const savedVersions = await repository(anonClient, owner, 'essay_versions').list();
    assert.equal(savedVersions.find(version => version.essay_id === essay.id && version.version_number === savedVersion)?.content, draftContent);

    // 13. The shared save path clears only the acknowledged draft.
    const draftCleared = recovery.read(draftKey);
    assert.equal(draftCleared, null, 'Draft must be cleared after successful save');

    // 14. A real stale-version RPC must preserve the submitted draft.
    await assert.rejects(
      saveEssayDraft(anonClient, recovery, {essayId: draftKey, content: 'Draft 2 content', baseVersion: initialVersion.version_number}),
      error => error?.kind === 'CONFLICT',
      'Stale essay version must report a conflict',
    );
    const draftAfterConflict = recovery.read(draftKey);
    assert.ok(draftAfterConflict, 'Draft preserved after simulated conflict');
    assert.equal(draftAfterConflict.content, 'Draft 2 content');

    console.log('M21 PASS: Drafts survive network failures and clear on success');
  } finally {
    // Cleanup: delete user and any artifacts
    if (owner && admin) {
      try {
        const result = await admin.auth.admin.deleteUser(owner);
        if (result.error) throw new Error('Fake user cleanup request failed');
      } catch (e) {
        cleanupErrors.push(`delete user: ${e.message}`);
      }
    }
  }

  if (cleanupErrors.length) {
    console.error('M21 CLEANUP ISSUES:', cleanupErrors);
    process.exitCode = 1;
  } else {
    console.log('M21 CLEANUP PASS');
  }
}

run().catch(e => {
  console.error('M21 FAIL:', e.message, e.stack);
  process.exitCode = 1;
});
