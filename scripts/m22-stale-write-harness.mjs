import assert from 'node:assert/strict';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {repository} from '../src/repositories.ts';

const root = path.resolve(import.meta.dirname, '..');
const status = spawnSync(process.execPath, [path.join(root, 'node_modules/supabase/dist/supabase.js'), 'status', '--output', 'json'], {cwd: root, encoding: 'utf8'});
assert.equal(status.status, 0, 'start local Supabase first');
const config = JSON.parse(status.stdout);
assert.equal(config.API_URL, 'http://127.0.0.1:55421', 'M22 harness is restricted to the Atlas local stack');

const admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, {auth: {persistSession: false, autoRefreshToken: false}});
const email = `atlas-m22-${crypto.randomUUID()}@example.invalid`;
const password = `${crypto.randomUUID()}Aa!`;
const first = createClient(config.API_URL, config.ANON_KEY, {auth: {persistSession: false, autoRefreshToken: false}});
let owner;

try {
  const signup = await first.auth.signUp({email, password});
  assert.equal(signup.error, null, JSON.stringify(signup.error));
  assert.ok(signup.data.user && signup.data.session, 'local auth must return a session');
  owner = signup.data.user.id;

  const second = createClient(config.API_URL, config.ANON_KEY, {auth: {persistSession: false, autoRefreshToken: false}});
  const login = await second.auth.signInWithPassword({email, password});
  assert.equal(login.error, null, JSON.stringify(login.error));

  const firstRepo = repository(first, owner, 'universities');
  const secondRepo = repository(second, owner, 'universities');
  const university = await firstRepo.insert({name: 'M22 fake university'});
  const staleRead = await firstRepo.get(university.id);
  const secondUpdate = await secondRepo.update(university.id, {name: 'M22 second-session value'}, staleRead.updated_at);
  assert.equal(secondUpdate.name, 'M22 second-session value');

  await assert.rejects(
    firstRepo.update(university.id, {name: 'M22 stale overwrite'}, staleRead.updated_at),
    error => error?.kind === 'CONFLICT',
  );
  const afterConflict = await firstRepo.get(university.id);
  assert.equal(afterConflict.name, 'M22 second-session value', 'stale write must not overwrite the newer value');

  const freshUpdate = await firstRepo.update(university.id, {name: 'M22 fresh value'}, afterConflict.updated_at);
  assert.equal(freshUpdate.name, 'M22 fresh value');
  console.log('M22 PASS: stale write raised CONFLICT, newer value remained, fresh retry succeeded');
} finally {
  if (owner) {
    const result = await admin.auth.admin.deleteUser(owner);
    assert.equal(result.error, null, JSON.stringify(result.error));
  }
  console.log('M22 CLEANUP PASS: generated fake user removed');
}
