// Server-only source adapter. This module never discovers a local CLI/Docker project.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { safePath, sha256, validateArchiveList, validateExport, validateSecuritySnapshot } from './backup-lib.mjs';

const secrets = new WeakMap();
const configError = name => new Error(`REMOTE_CONFIG_INVALID ${name}`);
const validText = value => typeof value === 'string' && value.length > 0 && !/[\x00-\x1f\x7f]/.test(value);
// pg_get_constraintdef/pg_get_indexdef may pretty-print legitimate SQL whitespace.
const validDefinition = value => typeof value === 'string' && value.trim().length > 0 && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);
const loopback = host => ['127.0.0.1', '[::1]', '::1', 'localhost'].includes(host);
function required(env, name) { if (!validText(env[name])) throw new Error(`REMOTE_CONFIG_MISSING ${name}`); return env[name]; }
function asUrl(text, name) { try { return new URL(text); } catch { throw configError(name); } }
function freezeConfig(config, privateValues) { Object.freeze(config.database); Object.freeze(config); secrets.set(config, Object.freeze(privateValues)); return config; }
export function assertSourceConfig(config) { if (!secrets.has(config)) throw configError('source configuration'); return config; }
function serviceKey(key, projectRef) {
 if (/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(key)) return;
 try { const claims=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()); if(key.split('.').length===3 && claims.role==='service_role' && claims.ref===projectRef) return; } catch {}
 throw configError('SUPABASE_SERVICE_ROLE_KEY');
}
export function parseRemoteSourceConfig(env) {
 // env is mandatory: callers must choose their source instead of importing local settings.
 env ??= {};
 const projectRef=required(env,'SUPABASE_PROJECT_REF');if(!/^[a-z0-9]{20}$/.test(projectRef))throw configError('SUPABASE_PROJECT_REF');
 const urlText=required(env,'SUPABASE_URL'),url=asUrl(urlText,'SUPABASE_URL');
 if(url.protocol!=='https:'||url.hostname!==`${projectRef}.supabase.co`||url.port||url.username||url.password||url.pathname!=='/'||/[?#]/.test(urlText)||urlText.trim()!==urlText)throw configError('SUPABASE_URL project identity');
 const key=required(env,'SUPABASE_SERVICE_ROLE_KEY');serviceKey(key,projectRef);
 const dbText=required(env,'SUPABASE_DB_URL'),db=asUrl(dbText,'SUPABASE_DB_URL');
 if(!['postgres:','postgresql:'].includes(db.protocol)||db.pathname!=='/postgres'||db.hash||dbText.includes('#')||dbText.trim()!==dbText)throw configError('SUPABASE_DB_URL');
 let user,embeddedPassword;try{user=decodeURIComponent(db.username);embeddedPassword=decodeURIComponent(db.password);}catch{throw configError('SUPABASE_DB_URL');}
 const port=Number(db.port||5432);
 const direct=db.hostname===`db.${projectRef}.supabase.co`&&user==='postgres';
 const pooled=/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(db.hostname)&&user===`postgres.${projectRef}`;
 if((!direct&&!pooled)||port!==5432)throw configError('SUPABASE_DB_URL project identity');
 if([...db.searchParams.keys()].some(key=>!['sslmode','sslrootcert'].includes(key))||db.searchParams.getAll('sslmode').length!==1||db.searchParams.get('sslmode')!=='verify-full'||db.searchParams.getAll('sslrootcert').length>1)throw configError('SUPABASE_DB_URL TLS');
 const sslrootcert=env.SUPABASE_DB_SSL_ROOT_CERT||db.searchParams.get('sslrootcert');
 if(!validText(sslrootcert)||!path.isAbsolute(sslrootcert))throw configError('SUPABASE_DB_SSL_ROOT_CERT');
 if(env.SUPABASE_DB_SSL_ROOT_CERT&&db.searchParams.has('sslrootcert')&&env.SUPABASE_DB_SSL_ROOT_CERT!==db.searchParams.get('sslrootcert'))throw configError('SUPABASE_DB_SSL_ROOT_CERT');
 const password=embeddedPassword||env.SUPABASE_DB_PASSWORD;
 if(!validText(password)||embeddedPassword&&env.SUPABASE_DB_PASSWORD&&embeddedPassword!==env.SUPABASE_DB_PASSWORD)throw configError('SUPABASE_DB_PASSWORD');
 const pgBinDir=env.ATLAS_PG_BIN_DIR;
 if(pgBinDir!==undefined&&(!validText(pgBinDir)||!path.isAbsolute(pgBinDir)))throw configError('ATLAS_PG_BIN_DIR');
 return freezeConfig({mode:'production',projectRef,publicUrl:url.origin,database:{host:db.hostname,port,database:'postgres',user,sslmode:'verify-full',sslrootcert},...(pgBinDir?{pgBinDir}: {})},{serviceRoleKey:key,password});
}
// The isolated loopback factory is an explicit API, never selected by CLI/environment flags.
export function createTestSourceConfig({projectRef,publicUrl,serviceRoleKey,database}={}) {
 if(!validText(projectRef)||!/^[a-z0-9][a-z0-9-]*$/.test(projectRef)||!validText(serviceRoleKey))throw configError('isolated test identity');
 const url=asUrl(publicUrl,'isolated test URL');
 if(url.protocol!=='http:'||!loopback(url.hostname)||!url.port||url.username||url.password||url.pathname!=='/'||/[?#]/.test(publicUrl)||!database||!loopback(database.host)||!Number.isInteger(database.port)||database.port<1024||database.port>65535||database.database!=='postgres'||!validText(database.user)||!validText(database.password))throw configError('isolated test source');
 return freezeConfig({mode:'isolated-test',projectRef,publicUrl:url.origin,database:{host:database.host,port:database.port,database:'postgres',user:database.user,sslmode:'disable'}},{serviceRoleKey,password:database.password});
}

// psql emits one JSON value per line. \gexec reads dynamically named tables within the
// same repeatable-read, read-only transaction; auth rows are fingerprinted in PostgreSQL.
export const snapshotSQL = String.raw`
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT json_build_object('kind','meta','migrationHead',(SELECT coalesce(max(version),'') FROM supabase_migrations.schema_migrations),'postgresVersion',current_setting('server_version'),'postgresMajor',current_setting('server_version_num')::int / 10000,
'databaseTables',(SELECT coalesce(json_agg(x ORDER BY schema,name),'[]') FROM (SELECT n.nspname AS schema,c.relname AS name,c.relkind AS kind,(SELECT coalesce(json_agg(json_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'nullable',NOT a.attnotnull) ORDER BY a.attnum),'[]') FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','storage') AND c.relkind IN ('r','p')) x),
'schemaConstraints',(SELECT coalesce(json_agg(x ORDER BY schema,"table",name),'[]') FROM (SELECT n.nspname AS schema,t.relname AS "table",c.conname AS name,c.contype AS type,pg_get_constraintdef(c.oid,true) AS definition,c.condeferrable AS deferrable,c.condeferred AS deferred,c.convalidated AS validated FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname IN ('public','auth','storage')) x),
'schemaIndexes',(SELECT coalesce(json_agg(x ORDER BY schema,"table",name),'[]') FROM (SELECT n.nspname AS schema,t.relname AS "table",c.relname AS name,pg_get_indexdef(i.indexrelid) AS definition,i.indisunique AS unique,i.indisprimary AS primary,i.indisvalid AS valid,i.indisready AS ready FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname IN ('public','auth','storage')) x));
SELECT json_build_object('kind','security','value',json_build_object(
'version',2,
'functions',(SELECT coalesce(json_agg(x ORDER BY schema,name,arguments),'[]') FROM (SELECT n.nspname AS schema,p.proname AS name,pg_get_function_identity_arguments(p.oid) AS arguments,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','storage')) x),
'triggers',(SELECT coalesce(json_agg(x ORDER BY schema,"table",name),'[]') FROM (SELECT n.nspname AS schema,c.relname AS "table",t.tgname AS name,t.tgenabled AS enabled,pg_get_triggerdef(t.oid,true) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','storage') AND NOT t.tgisinternal) x),
'policies',(SELECT coalesce(json_agg(x ORDER BY schema,"table",name),'[]') FROM (SELECT schemaname AS schema,tablename AS "table",policyname AS name,permissive,cmd,(SELECT json_agg(r ORDER BY r) FROM unnest(roles) r) AS roles,qual,with_check FROM pg_policies WHERE schemaname IN ('public','storage')) x),
'tables',(SELECT coalesce(json_agg(x ORDER BY schema,name),'[]') FROM (SELECT n.nspname AS schema,c.relname AS name,c.relrowsecurity AS "rlsEnabled",c.relforcerowsecurity AS "rlsForced" FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','storage') AND c.relkind IN ('r','p')) x)));
SELECT json_build_object('kind','objects','value',(SELECT coalesce(json_agg(to_jsonb(o) ORDER BY bucket_id,name),'[]') FROM storage.objects o));
SELECT json_build_object('kind','buckets','value',(SELECT coalesce(json_agg(to_jsonb(b) ORDER BY id),'[]') FROM storage.buckets b));
SELECT format('SELECT json_build_object(''kind'',''table'',''schema'',%L,''name'',%L,''rows'',coalesce(json_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),''[]''::json)) FROM %I.%I t;',schemaname,tablename,schemaname,tablename) FROM pg_tables WHERE schemaname='public' ORDER BY tablename
\gexec
SELECT format('SELECT json_build_object(''kind'',''fingerprint'',''schema'',%L,''name'',%L,''rowCount'',count(*),''digest'',md5(coalesce(string_agg(to_jsonb(t)::text,E''\n'' ORDER BY to_jsonb(t)::text),''''))) FROM %I.%I t;',schemaname,tablename,schemaname,tablename) FROM pg_tables WHERE schemaname IN ('auth','storage') ORDER BY schemaname,tablename
\gexec
COMMIT;
`;
export async function readRemoteSnapshot(executeSql) {
 try {
  // PostgreSQL json_agg of composite rows may contain physical newlines. Frame
  // complete top-level objects and respect quoted/escaped braces instead of
  // assuming that each psql record occupies one text line.
  const text=String(await executeSql(snapshotSQL)),lines=[];let start=-1,depth=0,quoted=false,escaped=false;
  for(let i=0;i<text.length;i++){
   const char=text[i];if(start<0){if(/\s/.test(char))continue;if(char!=='{')throw Error();start=i;depth=1;continue;}
   if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;continue;}
   if(char==='"')quoted=true;else if(char==='{'||char==='[')depth++;else if(char==='}'||char===']'){depth--;if(depth===0){lines.push(JSON.parse(text.slice(start,i+1)));start=-1;}}
  }
  if(start>=0||!lines.length)throw Error();
  const result={tables:{},contentFingerprints:[]};const single=new Set();
  for(const line of lines){
   if(['meta','security','objects','buckets'].includes(line.kind)){if(single.has(line.kind))throw Error();single.add(line.kind);}
   if(line.kind==='meta')Object.assign(result,{migrationHead:line.migrationHead,postgresVersion:line.postgresVersion,postgresMajor:line.postgresMajor,databaseTables:line.databaseTables,schemaConstraints:line.schemaConstraints,schemaIndexes:line.schemaIndexes});
   else if(line.kind==='security')result.schemaSecurity=line.value;
   else if(line.kind==='objects')result.objects=line.value;
   else if(line.kind==='buckets')result.buckets=line.value;
   else if(line.kind==='table'){if(line.schema!=='public'||Object.hasOwn(result.tables,line.name))throw Error();result.tables[line.name]=line.rows;}
   else if(line.kind==='fingerprint')result.contentFingerprints.push({schema:line.schema,name:line.name,rowCount:line.rowCount,digest:line.digest});
   else throw Error();
  }
  if(single.size!==4)throw Error();
  result.contentFingerprints.sort((a,b)=>(a.schema+'.'+a.name).localeCompare(b.schema+'.'+b.name));
  result.databaseFingerprint=sha256(Buffer.from(JSON.stringify(result.contentFingerprints)));
  result.authTables=result.databaseTables.filter(table=>table.schema==='auth').map(table=>table.name).sort();
  validateSourceSnapshot(result);return result;
 }catch{throw new Error('SOURCE_READ_FAILED');}
}
export function validateSourceSnapshot(snapshot) {
 if(!snapshot||!/^\d{12}$/.test(snapshot.migrationHead)||!Number.isInteger(snapshot.postgresMajor)||snapshot.postgresMajor<14||!validText(snapshot.postgresVersion)||!Array.isArray(snapshot.databaseTables)||!Array.isArray(snapshot.authTables)||!Array.isArray(snapshot.contentFingerprints)||!/^[a-f0-9]{64}$/.test(snapshot.databaseFingerprint))throw new Error('SOURCE_SNAPSHOT_INVALID');
 const names=new Set();for(const table of snapshot.databaseTables){if(!['public','auth','storage'].includes(table.schema)||!/^[a-z][a-z0-9_]*$/.test(table.name)||!['r','p'].includes(table.kind)||!Array.isArray(table.columns)||!table.columns.length||new Set(table.columns.map(column=>column.name)).size!==table.columns.length||table.columns.some(column=>!validText(column.name)||!validText(column.type)||typeof column.nullable!=='boolean'))throw new Error('SOURCE_SNAPSHOT_INVALID');const key=table.schema+'.'+table.name;if(names.has(key))throw new Error('SOURCE_SNAPSHOT_INVALID');names.add(key);}
 for(const [key,booleanFields]of [['schemaConstraints',['deferrable','deferred','validated']],['schemaIndexes',['unique','primary','valid','ready']]]){const rows=snapshot[key];if(!Array.isArray(rows))throw new Error('SOURCE_SNAPSHOT_INVALID');const seen=new Set();for(const row of rows){const identity=JSON.stringify([row.schema,row.table,row.name]);if(!names.has(row.schema+'.'+row.table)||!validText(row.name)||!validDefinition(row.definition)||seen.has(identity)||booleanFields.some(field=>typeof row[field]!=='boolean')||key==='schemaConstraints'&&!['c','f','p','u','t','x','n'].includes(row.type))throw new Error('SOURCE_SNAPSHOT_INVALID');seen.add(identity);}}
 if(!['auth.users','auth.identities','storage.buckets','storage.objects'].every(name=>names.has(name))||JSON.stringify(snapshot.authTables)!==JSON.stringify(snapshot.databaseTables.filter(table=>table.schema==='auth').map(table=>table.name).sort()))throw new Error('SOURCE_SNAPSHOT_INVALID');
 validateSecuritySnapshot(snapshot.schemaSecurity);validateExport({schemaVersion:3,exportedAt:new Date(0).toISOString(),tables:snapshot.tables},snapshot.databaseTables.filter(table=>table.schema==='public').map(table=>table.name));
 const fingerprints=new Set();for(const item of snapshot.contentFingerprints){const key=item.schema+'.'+item.name;if(!['auth','storage'].includes(item.schema)||!names.has(key)||fingerprints.has(key)||!Number.isSafeInteger(item.rowCount)||item.rowCount<0||!/^[a-f0-9]{32}$/.test(item.digest))throw new Error('SOURCE_SNAPSHOT_INVALID');fingerprints.add(key);}
 if(snapshot.databaseTables.some(table=>['auth','storage'].includes(table.schema)&&!fingerprints.has(table.schema+'.'+table.name))||snapshot.databaseFingerprint!==sha256(Buffer.from(JSON.stringify(snapshot.contentFingerprints))))throw new Error('SOURCE_SNAPSHOT_INVALID');
 if(!Array.isArray(snapshot.objects)||!Array.isArray(snapshot.buckets))throw new Error('SOURCE_SNAPSHOT_INVALID');return snapshot;
}
export function validateRemoteArchiveList(list,publicTables,databaseTables) {
 try{validateArchiveList(list,publicTables);const expected=databaseTables.filter(table=>table.kind==='r').map(table=>table.schema+'.'+table.name).sort();const actual=String(list).split(/\r?\n/).map(line=>line.match(/\bTABLE DATA (public|auth|storage) ([a-z][a-z0-9_]*)\s/)?.slice(1).join('.')).filter(Boolean).sort();if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error();return true;}catch{throw new Error('Database archive inventory invalid');}
}

function cleanEnvironment() {
 // An allowlist avoids inherited PG* overrides and all Supabase/service credentials.
 const env={};for(const [key,value]of Object.entries(process.env))if(['PATH','PATHEXT','SYSTEMROOT','WINDIR','COMSPEC','TEMP','TMP','LANG','LC_ALL'].includes(key.toUpperCase()))env[key]=value;return env;
}
async function runBinary(bin,args,options) {
 return new Promise((resolve,reject)=>{
  const chunks=[];let length=0,failed=false;const child=spawn(bin,args,{env:options.env,shell:false,windowsHide:true,stdio:['pipe','pipe','ignore']});
  child.on('error',()=>reject(new Error('PROCESS_FAILED')));child.stdin.on('error',()=>{});
  child.stdout.on('data',chunk=>{if(options.discardOutput)return;length+=chunk.length;if(length>512*1024*1024){failed=true;child.kill();}else chunks.push(chunk);});
  child.on('close',code=>code===0&&!failed?resolve(Buffer.concat(chunks)):reject(new Error('PROCESS_FAILED')));
  child.stdin.end(options.input);
 });
}
function binary(config,name) { return config.pgBinDir?path.join(config.pgBinDir,name+(process.platform==='win32'?'.exe':'')):name; }
export function createRemoteTransport(config,{runProcess=runBinary,fetchImpl=fetch}={}) {
 assertSourceConfig(config);const privateValues=secrets.get(config);let latestSnapshot;
 async function get(route,code){try{const key=privateValues.serviceRoleKey;const response=await fetchImpl(config.publicUrl+route,{method:'GET',redirect:'error',signal:AbortSignal.timeout(60000),headers:{apikey:key,...(key.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+key})}});if(!response.ok||response.redirected)throw Error();return response;}catch{throw new Error(code);}}
 async function pg(name,args,{input,discardOutput=false,connect=false,code='SOURCE_READ_FAILED'}={}) {
  let privateDir;
  try{
   const env=cleanEnvironment();
   if(connect){privateDir=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-remote-pg-'));await fs.chmod(privateDir,0o700);const passfile=path.join(privateDir,'credentials.pgpass');const escape=value=>String(value).replaceAll('\\','\\\\').replaceAll(':','\\:');const db=config.database;await fs.writeFile(passfile,[db.host,db.port,db.database,db.user,privateValues.password].map(escape).join(':')+'\n',{mode:0o600});Object.assign(env,{PGHOST:db.host,PGPORT:String(db.port),PGDATABASE:db.database,PGUSER:db.user,PGPASSFILE:passfile,PGSSLMODE:db.sslmode,PGCONNECT_TIMEOUT:'15',PGAPPNAME:'atlas-readonly-backup',PGOPTIONS:'-c default_transaction_read_only=on -c statement_timeout=300000',...(db.sslrootcert?{PGSSLROOTCERT:db.sslrootcert}:{})});}
   return Buffer.from(await runProcess(binary(config,name),args,{input,discardOutput,env,shell:false}));
  }catch{throw new Error(code);}finally{if(privateDir)await fs.rm(privateDir,{recursive:true,force:true}).catch(()=>{});}
 }
 return Object.freeze({
  async readSnapshot(){const access=await get('/storage/v1/bucket?limit=1&offset=0','SOURCE_ACCESS_FAILED');try{await access.arrayBuffer();}catch{throw new Error('SOURCE_ACCESS_FAILED');}latestSnapshot=await readRemoteSnapshot(q=>pg('psql',['-X','-q','-t','-A','-w','-v','ON_ERROR_STOP=1'],{input:q,connect:true}));return latestSnapshot;},
  async dumpDatabase(){return pg('pg_dump',['--no-password','--format=custom','--schema=public','--schema=auth','--schema=storage'],{connect:true,code:'DATABASE_DUMP_FAILED'});},
  async validateArchive(bytes,publicTables){
   if(!latestSnapshot||bytes.length<20||bytes.subarray(0,5).toString()!=='PGDMP')throw new Error('ARCHIVE_VALIDATION_FAILED');
   const list=await pg('pg_restore',['--list'],{input:bytes,code:'ARCHIVE_VALIDATION_FAILED'});validateRemoteArchiveList(list.toString(),publicTables,latestSnapshot.databaseTables);
   // Decode every archive payload without connecting to any database or exposing SQL.
   await pg('pg_restore',['--exit-on-error','--file='+os.devNull],{input:bytes,discardOutput:true,code:'ARCHIVE_VALIDATION_FAILED'});return true;
  },
  async downloadObject(bucket,objectPath){
   try{if(!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(bucket))throw Error();safePath(os.tmpdir(),`storage/${bucket}/${objectPath}`);const route='/storage/v1/object/authenticated/'+encodeURIComponent(bucket)+'/'+objectPath.split('/').map(encodeURIComponent).join('/');const response=await get(route,'STORAGE_READ_FAILED');return Buffer.from(await response.arrayBuffer());}catch{throw new Error('STORAGE_READ_FAILED');}
  }
 });
}
