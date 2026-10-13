import fs from 'node:fs/promises';
import path from 'node:path';

export const restoreHelp = `Usage: node scripts/restore-test.mjs --bundle <directory> --target <work/directory> --report <unique.json> --credentials <private.json> [--resume] [--verify-only]
       node scripts/restore-test.mjs --help
Without arguments, the legacy local synthetic-fixture drill is used.
Existing targets must use --resume and retain the isolated Atlas restore project and ports.
--verify-only compares an existing restored target and requires --bundle --resume.
New engine bundles restore accounts/identities only; unsupported nonempty Auth protection state blocks restoration.`;

export function parseRestoreArgs(args) {
  const valueFlags = new Map([['--bundle', 'bundle'], ['--target', 'target'], ['--target-cwd', 'target'], ['--report', 'report'], ['--credentials', 'credentials']]);
  const booleanFlags = new Map([['--resume', 'resume'], ['--verify-only', 'verifyOnly'], ['--help', 'help']]);
  const result = {};
  const fail = message => { throw Error(`RESTORE_ARGUMENTS_INVALID ${message}`); };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i], key = valueFlags.get(flag) || booleanFlags.get(flag);
    if (!key) fail('unknown argument');
    if (Object.hasOwn(result, key)) fail('duplicate argument');
    if (valueFlags.has(flag)) {
      const value = args[++i];
      if (!value || value.startsWith('--')) fail(`${flag} requires a value`);
      result[key] = value;
    } else result[key] = true;
  }
  if (result.help && args.length !== 1) fail('--help must be used alone');
  if (args.length && !result.help && !result.bundle) fail('explicit arguments require --bundle');
  if (result.bundle && (!result.target || !result.report || !result.credentials)) fail('--bundle requires --target, --report and --credentials');
  if (result.verifyOnly && !result.resume) fail('--verify-only requires --resume');
  return result;
}

function confined(base, target) {
  const rel = path.relative(path.resolve(base), path.resolve(target));
  return Boolean(rel && rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel));
}

export function assertIsolatedTargetConfig(config, realWork, realTarget) {
  const fail = () => { throw Error('BLOCKED_RESTORE_TARGET isolated work directory, Atlas restore project and ports required'); };
  if (!confined(realWork, realTarget)) fail();
  const ids = [...config.matchAll(/^project_id\s*=\s*"([^"]+)"\s*(?:#.*)?$/gm)];
  const sectionPort = section => {
    const sections = [...config.matchAll(new RegExp(`^\\[${section}\\]\\s*(?:#.*)?$([\\s\\S]*?)(?=^\\[|$(?![\\s\\S]))`, 'gm'))];
    if (sections.length !== 1) return null;
    const ports = [...sections[0][1].matchAll(/^port\s*=\s*(\d+)\s*(?:#.*)?$/gm)];
    return ports.length === 1 ? Number(ports[0][1]) : null;
  };
  if (ids.length !== 1 || !/^atlas-restore-[a-zA-Z0-9-]+$/.test(ids[0][1]) || sectionPort('api') !== 55431 || ![55432, 55442].includes(sectionPort('db'))) fail();
  return true;
}

export async function validateRestoreTarget(cwd, root, { resume = false } = {}) {
  const work = path.join(root, 'work');
  if (!confined(work, cwd)) throw Error('BLOCKED_RESTORE_TARGET target must be inside work');
  const realWork = await fs.realpath(work);
  let ancestor = path.resolve(cwd);
  while (!await fs.stat(ancestor).catch(() => null)) {
    const parent = path.dirname(ancestor);
    if (parent === ancestor) throw Error('BLOCKED_RESTORE_TARGET missing target parent');
    ancestor = parent;
  }
  const realAncestor = await fs.realpath(ancestor);
  if (realAncestor !== realWork && !confined(realWork, realAncestor)) throw Error('BLOCKED_RESTORE_TARGET real path escapes work');
  const configPath = path.join(cwd, 'supabase/config.toml');
  // Validate the future write destination as well as cwd. An existing supabase/
  // junction can escape even when cwd itself is a normal directory in work/.
  let configAncestor = path.dirname(configPath);
  while (!await fs.stat(configAncestor).catch(() => null)) {
    const parent = path.dirname(configAncestor);
    if (parent === configAncestor) throw Error('BLOCKED_RESTORE_TARGET missing config parent');
    configAncestor = parent;
  }
  const realConfigAncestor = await fs.realpath(configAncestor);
  const realFutureTarget = path.resolve(realAncestor, path.relative(ancestor, path.resolve(cwd)));
  if (realConfigAncestor !== realWork && !confined(realWork, realConfigAncestor)) throw Error('BLOCKED_RESTORE_TARGET config parent real path escapes work');
  if ((configAncestor === path.resolve(cwd) || confined(cwd, configAncestor)) && realConfigAncestor !== realFutureTarget && !confined(realFutureTarget, realConfigAncestor)) throw Error('BLOCKED_RESTORE_TARGET config parent real path escapes target');
  const exists = await fs.stat(configPath).catch(() => null);
  if (!exists) {
    if (resume) throw Error('BLOCKED_RESTORE_TARGET --resume requires an existing isolated target config');
    return false;
  }
  const realTarget = await fs.realpath(cwd), realConfig = await fs.realpath(configPath);
  if (!confined(realTarget, realConfig)) throw Error('BLOCKED_RESTORE_TARGET config real path escapes target');
  assertIsolatedTargetConfig(await fs.readFile(configPath, 'utf8'), realWork, realTarget);
  return true;
}

const accountTables = ['users', 'identities'];
const omittedState = new Set(['sessions', 'refresh_tokens', 'one_time_tokens', 'audit_log_entries']);
const block = message => { throw Error(`BLOCKED_RESTORE_COMPATIBILITY ${message}`); };
const isNewBundle = manifest => manifest.formatVersion !== undefined || manifest.source !== undefined || manifest.environment === 'Atlas explicit source backup' || /^https?:\/\//.test(manifest.environment || '') && !/^http:\/\/127\.0\.0\.1:\d+$/.test(manifest.environment);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const canonicalJSON = value => JSON.stringify(canonical(value));
const definitionOrder = (a, b) => `${a.schema}.${a.table}.${a.name}`.localeCompare(`${b.schema}.${b.table}.${b.name}`);

export function validateRestoreSource(manifest) {
  if (!isNewBundle(manifest)) return null;
  const source = manifest.source;
  if (manifest.formatVersion !== 1 || !source || !Number.isInteger(source.postgresMajor) || source.postgresMajor < 10 || typeof source.postgresVersion !== 'string' || Number(source.postgresVersion.match(/^\d+/)?.[0]) !== source.postgresMajor || !Array.isArray(source.databaseTables) || !Array.isArray(source.authTables) || !Array.isArray(source.contentFingerprints)) block('complete explicit source metadata required');
  const keys = new Set();
  for (const table of source.databaseTables) {
    const key = `${table.schema}.${table.name}`;
    if (!['public', 'auth', 'storage'].includes(table.schema) || !/^[a-z][a-z0-9_]*$/.test(table.name) || !['r', 'p'].includes(table.kind) || keys.has(key) || !Array.isArray(table.columns) || !table.columns.length || table.columns.some(column => typeof column.name !== 'string' || typeof column.type !== 'string' || typeof column.nullable !== 'boolean')) block('invalid source table signatures');
    keys.add(key);
  }
  const authTables = source.databaseTables.filter(table => table.schema === 'auth').map(table => table.name).sort();
  if (JSON.stringify([...source.authTables].sort()) !== JSON.stringify(authTables) || [...accountTables, 'schema_migrations'].some(name => !authTables.includes(name))) block('complete auth table and platform version inventory required');
  const fingerprints = new Map();
  for (const row of source.contentFingerprints) {
    const key = `${row.schema}.${row.name}`;
    if (!['auth', 'storage'].includes(row.schema) || !keys.has(key) || fingerprints.has(key) || !Number.isSafeInteger(row.rowCount) || row.rowCount < 0 || !/^[a-f0-9]{32}$/.test(row.digest)) block('invalid source content fingerprints');
    fingerprints.set(key, row);
  }
  if (source.databaseTables.some(table => ['auth', 'storage'].includes(table.schema) && !fingerprints.has(`${table.schema}.${table.name}`))) block('complete auth/storage content fingerprints required');
  for (const [field, flags] of [['schemaConstraints', ['deferrable', 'deferred', 'validated']], ['schemaIndexes', ['unique', 'primary', 'valid', 'ready']]]) {
    if (!Array.isArray(source[field])) block('complete schema constraint and index definitions required');
    const names = new Set();
    for (const definition of source[field]) {
      const key = `${definition.schema}.${definition.table}.${definition.name}`;
      if (!keys.has(`${definition.schema}.${definition.table}`) || typeof definition.name !== 'string' || !definition.name || typeof definition.definition !== 'string' || !definition.definition || names.has(key) || flags.some(flag => typeof definition[flag] !== 'boolean') || field === 'schemaConstraints' && !/^[a-z]$/.test(definition.type)) block('invalid schema constraint or index definitions');
      names.add(key);
    }
  }
  for (const name of authTables) {
    const row = fingerprints.get(`auth.${name}`);
    if (!accountTables.includes(name) && name !== 'schema_migrations' && !omittedState.has(name) && row.rowCount > 0) throw Error(`BLOCKED_UNSUPPORTED_AUTH_STATE auth.${name} rowCount=${row.rowCount}; accounts/identities-only restore refused`);
  }
  return source;
}

export function assertRestoreCompatibility(manifest, target) {
  const source = validateRestoreSource(manifest);
  if (!source) return { authCompatibility: 'LEGACY_AUTH_COMPATIBILITY_UNKNOWN', schemaCompatibility: 'LEGACY_SOURCE_COLUMNS_CONSTRAINTS_INDEXES_UNKNOWN', authScope: 'ACCOUNTS_IDENTITIES_ONLY', omittedAuthState: [] };
  if (source.postgresMajor !== target.postgresMajor) block('source and target PostgreSQL major versions differ');
  const relevant = table => ['public', 'storage'].includes(table.schema) || table.schema === 'auth' && accountTables.includes(table.name);
  const normalize = tables => tables.filter(relevant).map(({ schema, name, kind, columns }) => ({ schema, name, kind, columns })).sort((a, b) => `${a.schema}.${a.name}`.localeCompare(`${b.schema}.${b.name}`));
  if (!Array.isArray(target.databaseTables) || canonicalJSON(normalize(source.databaseTables)) !== canonicalJSON(normalize(target.databaseTables))) block('public, storage or auth account column definitions differ');
  for (const field of ['schemaConstraints', 'schemaIndexes']) if (!Array.isArray(target[field]) || canonicalJSON([...source[field]].sort(definitionOrder)) !== canonicalJSON([...target[field]].sort(definitionOrder))) block('schema constraint or index definitions differ');
  const sourceVersions = source.contentFingerprints.find(row => row.schema === 'auth' && row.name === 'schema_migrations');
  const targetVersions = target.contentFingerprints?.find(row => row.schema === 'auth' && row.name === 'schema_migrations');
  if (sourceVersions && (!targetVersions || sourceVersions.rowCount !== targetVersions.rowCount || sourceVersions.digest !== targetVersions.digest)) block('Auth platform migration versions differ');
  return { authCompatibility: 'VERIFIED_ACCOUNTS_IDENTITIES', schemaCompatibility: 'EXACT_COLUMNS_CONSTRAINTS_INDEXES', columnScope: ['public.*', 'storage.*', 'auth.users', 'auth.identities'], authScope: 'ACCOUNTS_IDENTITIES_ONLY', sourcePostgresMajor: source.postgresMajor, targetPostgresMajor: target.postgresMajor,
    omittedAuthState: source.contentFingerprints.filter(row => row.schema === 'auth' && omittedState.has(row.name) && row.rowCount > 0).map(row => ({ table: row.name, rowCount: row.rowCount, disposition: 'OMITTED_SESSIONS_TOKENS_AND_HISTORY' })) };
}

export function authFingerprintSQL(name) {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) throw Error('Invalid auth fingerprint table');
  return `select json_build_object('schema','auth','name','${name}','rowCount',count(*),'digest',md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),''))) from auth."${name}" t;`;
}

export function readTargetCompatibility(db, sql) {
  const postgresVersion = sql(db, "select current_setting('server_version');");
  const databaseTables = JSON.parse(sql(db, `select coalesce(json_agg(x order by schema,name),'[]') from (select n.nspname as schema,c.relname as name,c.relkind as kind,(select json_agg(json_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'nullable',not a.attnotnull) order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','auth','storage') and c.relkind in('r','p')) x;`));
  const contentFingerprints = databaseTables.some(table => table.schema === 'auth' && table.name === 'schema_migrations') ? [JSON.parse(sql(db, authFingerprintSQL('schema_migrations')))] : [];
  const schemaConstraints = JSON.parse(sql(db, `select coalesce(json_agg(x order by schema,"table",name),'[]') from (select n.nspname as schema,c.relname as "table",f.conname as name,f.contype as type,pg_get_constraintdef(f.oid,true) as definition,f.condeferrable as deferrable,f.condeferred as deferred,f.convalidated as validated from pg_constraint f join pg_class c on c.oid=f.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','auth','storage')) x;`));
  const schemaIndexes = JSON.parse(sql(db, `select coalesce(json_agg(x order by schema,"table",name),'[]') from (select n.nspname as schema,c.relname as "table",ic.relname as name,pg_get_indexdef(i.indexrelid) as definition,i.indisunique as "unique",i.indisprimary as "primary",i.indisvalid as valid,i.indisready as ready from pg_index i join pg_class c on c.oid=i.indrelid join pg_class ic on ic.oid=i.indexrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','auth','storage')) x;`));
  return { postgresVersion, postgresMajor: Number(postgresVersion.match(/^\d+/)?.[0]), databaseTables, contentFingerprints, schemaConstraints, schemaIndexes };
}

export function assertRestoredAuth(manifest, actual) {
  if (!validateRestoreSource(manifest)) return { status: 'LEGACY_SOURCE_FINGERPRINT_UNKNOWN', tables: [] };
  for (const name of accountTables) {
    const expected = manifest.source.contentFingerprints.find(row => row.schema === 'auth' && row.name === name);
    const restored = actual.find(row => row.schema === 'auth' && row.name === name);
    if (!restored || expected.rowCount !== restored.rowCount || expected.digest !== restored.digest) throw Error('Restored auth accounts or identities content differs');
  }
  return { status: 'EXACT_ACCOUNT_IDENTITY_CONTENT_MATCH', tables: actual.map(({ name, rowCount }) => ({ name, rowCount })) };
}

export function canonicalRows(rows) {
  return canonicalJSON([...rows].sort((a, b) => a.id.localeCompare(b.id)));
}

export function assertRestoredObjects(objects, inventory) {
  if (objects.length !== inventory.length) throw Error('Restored storage inventory differs');
  for (const object of objects) {
    const matches = inventory.filter(row => row.bucket_id === object.bucket && row.name === object.path);
    if (matches.length !== 1 || (matches[0].owner_id ?? null) !== (object.owner ?? null)) throw Error('Restored storage bucket, path or owner differs');
  }
  return true;
}

export function assertRestoreBuckets(expected, actual, { allowMissing = false } = {}) {
  const fail = () => { throw Error('BLOCKED_RESTORE_BUCKET_SECURITY source bucket privacy, file size or MIME restrictions differ'); };
  if (!Array.isArray(expected) || !Array.isArray(actual)) fail();
  const security = bucket => {
    if (typeof bucket.public !== 'boolean' || bucket.file_size_limit != null && (!Number.isSafeInteger(bucket.file_size_limit) || bucket.file_size_limit < 0) || bucket.allowed_mime_types != null && (!Array.isArray(bucket.allowed_mime_types) || bucket.allowed_mime_types.some(type => typeof type !== 'string'))) fail();
    return { public: bucket.public, file_size_limit: bucket.file_size_limit ?? null, allowed_mime_types: bucket.allowed_mime_types == null ? null : [...bucket.allowed_mime_types].sort() };
  };
  const ids = new Set();
  for (const bucket of expected) {
    if (typeof bucket.id !== 'string' || !bucket.id || ids.has(bucket.id)) fail();
    ids.add(bucket.id);
    const sourceSecurity = security(bucket), matches = actual.filter(live => live.id === bucket.id);
    if (!matches.length && allowMissing) continue;
    if (matches.length !== 1 || canonicalJSON(sourceSecurity) !== canonicalJSON(security(matches[0]))) fail();
  }
  // Extra platform buckets are outside the source restoration scope. Freshness
  // still requires storage.objects to be empty before data/file restoration.
  return { status: 'SOURCE_BUCKET_SECURITY_MATCH', sourceBucketsVerified: expected.length };
}
