import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const name = `atlas-test-${crypto.randomUUID()}`;
function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout;
}
function sql(source, database = 'postgres') {
  return docker(['exec', '-i', name, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', database], source);
}
try {
  docker(['run', '--detach', '--name', name, '--label', 'atlas.ephemeral-test=true', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:15-alpine']);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (spawnSync('docker', ['exec', name, 'pg_isready', '-U', 'postgres'], { stdio: 'ignore' }).status === 0) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('Temporary PostgreSQL did not start');
  sql(readFileSync(path.join(root, 'supabase/tests/000_mocks.sql'), 'utf8'));
  for (const file of readdirSync(path.join(root, 'supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) {
    sql(readFileSync(path.join(root, 'supabase/migrations', file), 'utf8'));
    console.log(`MIGRATION PASS ${file}`);
  }
  sql(readFileSync(path.join(root, 'supabase/seed.sql'), 'utf8'));
  for (const file of readdirSync(path.join(root, 'supabase/tests')).filter(f => f.endsWith('.sql') && !f.startsWith('000_')).sort()) {
    sql(readFileSync(path.join(root, 'supabase/tests', file), 'utf8'));
    console.log(`TEST PASS ${file}`);
  }
  // Text dump stays in memory; restore only into a new database in this test container.
  const dump = docker(['exec', name, 'pg_dump', '-U', 'postgres', '--no-owner', '--no-privileges', 'postgres']);
  sql('CREATE DATABASE atlas_restore;');
  sql(dump, 'atlas_restore');
  const tables = sql("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;").split('\n').map(s=>s.trim()).filter(s=>/^[a-z_]+$/.test(s) && s !== 'tablename');
  for (const table of tables) {
    const query = `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id), '[]'::jsonb) FROM public.${table} t;`;
    if (sql(query) !== sql(query, 'atlas_restore')) throw new Error(`Restore mismatch: ${table}`);
  }
  // Compare definitions with stable names rather than object identifiers.
  const constraints = "SELECT conrelid::regclass::text, conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY 1,2;";
  if (sql(constraints) !== sql(constraints, 'atlas_restore')) throw new Error('Restored constraints mismatch');
  const policies = "SELECT schemaname,tablename,policyname,cmd,qual,with_check FROM pg_policies ORDER BY 1,2,3;";
  if (sql(policies) !== sql(policies, 'atlas_restore')) throw new Error('Restored RLS policies mismatch');
  console.log(`BACKUP RESTORE PASS: ${tables.length} public tables, rows, constraints and policies`);
  console.log('DATABASE LOCAL TESTS PASS (auth/storage schemas are mocks; HTTP integration is a separate gate)');
} finally {
  // name is generated in this invocation; no existing services or volumes are targeted.
  spawnSync('docker', ['rm', '--force', '--volumes', name], { stdio: 'ignore' });
}
