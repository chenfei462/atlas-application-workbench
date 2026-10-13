import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { coreTables, sha256, verifyBundle } from '../scripts/backup-lib.mjs';

// These tests deliberately exercise the transport contract, not real pg_dump archives.
// A real PostgreSQL/Supabase drill is required independently before claiming restorability.
const source = await import('../scripts/remote-source.mjs').catch(() => ({}));
const engine = await import('../scripts/backup-remote.mjs').catch(() => ({}));
function feature(module, name) { assert.equal(typeof module[name], 'function', `${name} must be implemented`); return module[name]; }
const projectRef = 'abcdefghijklmnopqrst';
const serviceRoleKey = 'sb_secret_' + 'X'.repeat(40);
const password = 'synthetic-private-password';
function databaseUrl({host=`db.${projectRef}.supabase.co`,user='postgres',port=5432,sslmode='verify-full',params={}}={}) {
 const url=new URL('postgresql://localhost/postgres');url.hostname=host;url.username=user;url.password=password;url.port=String(port);url.searchParams.set('sslmode',sslmode);for(const [key,value]of Object.entries(params))url.searchParams.set(key,value);return url.href;
}
function productionEnv(overrides = {}) { return { SUPABASE_PROJECT_REF: projectRef, SUPABASE_URL: `https://${projectRef}.supabase.co`, SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey, SUPABASE_DB_URL: databaseUrl(), SUPABASE_DB_SSL_ROOT_CERT: path.resolve(os.tmpdir(), 'synthetic-root.cer'), ...overrides }; }
function testConfig() { return feature(source, 'createTestSourceConfig')({ projectRef: 'atlas-isolated-fixture', publicUrl: 'http://127.0.0.1:55451', serviceRoleKey, database: { host: '127.0.0.1', port: 55452, database: 'postgres', user: 'postgres', password } }); }
function security() {
 return {version:2,functions:['is_owner','set_updated_at','import_atlas_backup','save_essay_version','record_submission','delete_material_version'].map(name=>({schema:'public',name,arguments:'',definition:`CREATE OR REPLACE FUNCTION public.${name}() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;`})),triggers:[{schema:'public',table:'universities',name:'updated',enabled:'O',definition:'CREATE TRIGGER updated BEFORE UPDATE ON public.universities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()'}],policies:[...coreTables.map(table=>({schema:'public',table,name:'owner',permissive:'PERMISSIVE',cmd:'ALL',roles:['authenticated'],qual:'owner_id = auth.uid()',with_check:'owner_id = auth.uid()'})),{schema:'storage',table:'objects',name:'owner',permissive:'PERMISSIVE',cmd:'ALL',roles:['authenticated'],qual:'owner_id = auth.uid()::text',with_check:'owner_id = auth.uid()::text'}],tables:[...coreTables.map(name=>({schema:'public',name,rlsEnabled:true,rlsForced:false})),{schema:'storage',name:'objects',rlsEnabled:true,rlsForced:false}]};
}
const objectBytes = Buffer.from('Synthetic PDF bytes for isolated transport tests');
function snapshot() {
 const tables=Object.fromEntries(coreTables.map(table=>[table,[]]));
 tables.material_versions=[{id:'version-a',owner_id:'owner-a',material_id:'material-a',storage_path:'owner-a/file.pdf',size_bytes:objectBytes.length,sha256:sha256(objectBytes)}];
 const databaseTables=[...coreTables.map(name=>({schema:'public',name,kind:'r'})),{schema:'auth',name:'users',kind:'r'},{schema:'auth',name:'identities',kind:'r'},{schema:'storage',name:'buckets',kind:'r'},{schema:'storage',name:'objects',kind:'r'}].map(table=>({...table,columns:[{name:'id',type:'uuid',nullable:false}]}));
 const contentFingerprints=databaseTables.filter(table=>table.schema!=='public').map(table=>({schema:table.schema,name:table.name,rowCount:0,digest:'0'.repeat(32)})).sort((a,b)=>(a.schema+'.'+a.name).localeCompare(b.schema+'.'+b.name));
 const schemaConstraints=coreTables.map(table=>({schema:'public',table,name:table+'_pkey',type:'p',definition:'PRIMARY KEY (id)',deferrable:false,deferred:false,validated:true}));
 const schemaIndexes=coreTables.map(table=>({schema:'public',table,name:table+'_pkey',definition:`CREATE UNIQUE INDEX ${table}_pkey ON public.${table} USING btree (id)`,unique:true,primary:true,valid:true,ready:true}));
 return { migrationHead:'202610110015', schemaSecurity:security(), tables, buckets:[{id:'application-documents',name:'application-documents',public:false}], objects:[{bucket_id:'application-documents',name:'owner-a/file.pdf',owner_id:'owner-a',metadata:{size:objectBytes.length,mimetype:'application/pdf'},version:'version-a'}], postgresVersion:'17.6',postgresMajor:17,databaseTables,authTables:['identities','users'],contentFingerprints,databaseFingerprint:sha256(Buffer.from(JSON.stringify(contentFingerprints))),schemaConstraints,schemaIndexes };
}
function archiveList(s = snapshot()) { return s.databaseTables.map((table,i)=>`${i+1}; 0 ${100+i} TABLE DATA ${table.schema} ${table.name} postgres`).join('\n'); }
function simulatedTransport(overrides={}) { return { async readSnapshot(){return structuredClone(snapshot());}, async dumpDatabase(){return Buffer.concat([Buffer.from('PGDMP'),Buffer.alloc(80)]);}, async downloadObject(){return objectBytes;}, async validateArchive(bytes,tables){ assert.ok(bytes.subarray(0,5).toString()==='PGDMP'); assert.ok(coreTables.every(table=>tables.includes(table))); return true; }, ...overrides }; }
async function withBackup(fn) { const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-remote-contract-'));try{return await fn(dir);}finally{await fs.rm(dir,{recursive:true,force:true});} }
async function failedManifest(dir) { const folders=await fs.readdir(dir);assert.equal(folders.length,1);return JSON.parse(await fs.readFile(path.join(dir,folders[0],'manifest.json'),'utf8')); }

test('remote configuration is explicit and cannot fall back to local settings',()=>{
 const parse=feature(source,'parseRemoteSourceConfig');
 assert.throws(()=>parse({}),/SUPABASE_PROJECT_REF/);
 assert.throws(()=>parse({API_URL:'http://127.0.0.1:54321',DB_URL:'postgresql://localhost/postgres',SERVICE_ROLE_KEY:serviceRoleKey}),/SUPABASE_PROJECT_REF/);
 const config=parse(productionEnv());assert.equal(config.projectRef,projectRef);assert.equal(config.publicUrl,`https://${projectRef}.supabase.co`);assert.equal(config.database.sslmode,'verify-full');
 const serialized=JSON.stringify(config);assert.ok(!serialized.includes(password)&&!serialized.includes(serviceRoleKey),'configuration serialization must not expose secrets');
 assert.ok(Object.isFrozen(config)&&Object.isFrozen(config.database));
});
test('production config rejects wrong project identities, unsafe URLs and TLS downgrade',()=>{
 const parse=feature(source,'parseRemoteSourceConfig');
 const invalid=[{SUPABASE_PROJECT_REF:''},{SUPABASE_URL:`https://${'z'.repeat(20)}.supabase.co`},{SUPABASE_URL:`http://${projectRef}.supabase.co`},{SUPABASE_URL:'http://127.0.0.1:55451'},{SUPABASE_URL:`https://${projectRef}.supabase.co/path`},{SUPABASE_URL:`https://${projectRef}.supabase.co?`},{SUPABASE_URL:`https://user:private@${projectRef}.supabase.co`},{SUPABASE_DB_URL:databaseUrl({host:`db.${'z'.repeat(20)}.supabase.co`})},{SUPABASE_DB_URL:databaseUrl({sslmode:'require'})},{SUPABASE_DB_URL:databaseUrl({params:{options:'-csearch_path=evil'}})},{SUPABASE_DB_SSL_ROOT_CERT:''},{SUPABASE_SERVICE_ROLE_KEY:''},{SUPABASE_SERVICE_ROLE_KEY:'sb_publishable_'+ 'X'.repeat(40)},{SUPABASE_DB_URL:databaseUrl({host:'localhost'})}];
 for(const item of invalid)assert.throws(()=>parse(productionEnv(item)),/REMOTE_CONFIG/);
});
test('session pooler is bound by project username and only accepts session port',()=>{
 const parse=feature(source,'parseRemoteSourceConfig');
 const url=databaseUrl({host:'aws-0-ap-northeast-1.pooler.supabase.com',user:`postgres.${projectRef}`});
 assert.equal(parse(productionEnv({SUPABASE_DB_URL:url})).database.port,5432);
 for(const bad of [url.replace(`postgres.${projectRef}`,`postgres.${'z'.repeat(20)}`),url.replace(':5432/',':6543/'),url.replace('pooler.supabase.com','pooler.supabase.com.evil.invalid')])assert.throws(()=>parse(productionEnv({SUPABASE_DB_URL:bad})),/REMOTE_CONFIG/);
});
test('legacy service JWT must have service_role and matching project ref',()=>{
 const parse=feature(source,'parseRemoteSourceConfig');
 const jwt=claims=>[Buffer.from('{}').toString('base64url'),Buffer.from(JSON.stringify(claims)).toString('base64url'),'synthetic-signature'].join('.');
 assert.doesNotThrow(()=>parse(productionEnv({SUPABASE_SERVICE_ROLE_KEY:jwt({role:'service_role',ref:projectRef})})));
 for(const claims of [{role:'anon',ref:projectRef},{role:'service_role',ref:'z'.repeat(20)},{role:'service_role'}])assert.throws(()=>parse(productionEnv({SUPABASE_SERVICE_ROLE_KEY:jwt(claims)})),/REMOTE_CONFIG/);
});
test('only explicit test factory permits loopback and it cannot target a remote host',()=>{
 const create=feature(source,'createTestSourceConfig');assert.equal(testConfig().mode,'isolated-test');
 assert.throws(()=>create({projectRef:'fixture',publicUrl:`https://${projectRef}.supabase.co`,serviceRoleKey,database:{host:'127.0.0.1',port:55452,database:'postgres',user:'postgres',password}}),/REMOTE_CONFIG/);
 assert.throws(()=>create({projectRef:'fixture',publicUrl:'http://127.0.0.1:55451',serviceRoleKey,database:{host:`db.${projectRef}.supabase.co`,port:5432,database:'postgres',user:'postgres',password}}),/REMOTE_CONFIG/);
});
test('configuration errors never include provided passwords, keys or database URLs',()=>{
 const parse=feature(source,'parseRemoteSourceConfig');const env=productionEnv({SUPABASE_URL:'https://'+password+'@evil.invalid'});
 try{parse(env);assert.fail('invalid config accepted');}catch(error){for(const value of [password,serviceRoleKey,env.SUPABASE_DB_URL])assert.ok(!String(error.stack).includes(value),'secret leaked in config error');}
});
test('successful transport bundle preserves Storage bytes and passes shared bundle checks',async()=>withBackup(async destinationRoot=>{
 const backup=feature(engine,'backupRemote');const transport=simulatedTransport();const dir=await backup({config:testConfig(),transport,destinationRoot});
 const manifest=await verifyBundle(dir,{archiveValidator:transport.validateArchive});assert.equal(manifest.status,'PASS');assert.equal(manifest.source.projectRef,'atlas-isolated-fixture');assert.equal(manifest.source.postgresMajor,17);assert.ok(manifest.source.authTables.includes('identities'));
 assert.deepEqual(await fs.readFile(path.join(dir,manifest.objects[0].filename)),objectBytes);assert.equal(manifest.objects[0].sha256,sha256(objectBytes));
}));
test('source read failures mark FAIL and never leak transport exception secrets',async()=>withBackup(async destinationRoot=>{
 const backup=feature(engine,'backupRemote');const transport=simulatedTransport({async readSnapshot(){throw Error(password+' '+serviceRoleKey);}});
 await assert.rejects(backup({config:testConfig(),transport,destinationRoot}),/SOURCE_READ_FAILED/);const manifest=await failedManifest(destinationRoot);assert.equal(manifest.status,'FAIL');for(const secret of [password,serviceRoleKey])assert.ok(!JSON.stringify(manifest).includes(secret),'secret leaked into failure manifest');
}));
test('a database reference absent from storage inventory fails the bundle',async()=>withBackup(async destinationRoot=>{
 const backup=feature(engine,'backupRemote');const s=snapshot();s.objects=[];
 await assert.rejects(backup({config:testConfig(),transport:simulatedTransport({async readSnapshot(){return structuredClone(s);}}),destinationRoot}),/MISSING_STORAGE_REFERENCE/);assert.equal((await failedManifest(destinationRoot)).status,'FAIL');
}));
test('an object read failure cannot leave a claimed PASS bundle',async()=>withBackup(async destinationRoot=>{
 const backup=feature(engine,'backupRemote');await assert.rejects(backup({config:testConfig(),transport:simulatedTransport({async downloadObject(){throw Error('secret '+serviceRoleKey);}}),destinationRoot}),/STORAGE_READ_FAILED/);assert.equal((await failedManifest(destinationRoot)).status,'FAIL');
}));
test('metadata size and referenced material checksum must match downloaded bytes',async()=>{
 const backup=feature(engine,'backupRemote');
 for(const change of [s=>{s.objects[0].metadata.size++;},s=>{s.tables.material_versions[0].sha256='0'.repeat(64);}])await withBackup(async destinationRoot=>{const s=snapshot();change(s);await assert.rejects(backup({config:testConfig(),transport:simulatedTransport({async readSnapshot(){return structuredClone(s);}}),destinationRoot}),/CHECKSUM|SIZE/);assert.equal((await failedManifest(destinationRoot)).status,'FAIL');});
});
test('changed public, auth, bucket, migration or schema state fails stability checks',async()=>{
 const backup=feature(engine,'backupRemote');
 for(const change of [s=>{s.tables.profiles.push({id:'new-row'});},s=>{s.contentFingerprints[0].digest='f'.repeat(32);s.databaseFingerprint=sha256(Buffer.from(JSON.stringify(s.contentFingerprints)));},s=>{s.buckets[0].public=true;},s=>{s.migrationHead='202610110016';},s=>{s.schemaSecurity.triggers[0].definition+=' ';},s=>{s.objects[0].version='changed';}])await withBackup(async destinationRoot=>{let calls=0;const transport=simulatedTransport({async readSnapshot(){const s=snapshot();if(calls++)change(s);return s;}});await assert.rejects(backup({config:testConfig(),transport,destinationRoot}),/SOURCE_DRIFT/);assert.equal((await failedManifest(destinationRoot)).status,'FAIL');});
});
test('object bytes changed without metadata changes still fail the second download',async()=>withBackup(async destinationRoot=>{
 const backup=feature(engine,'backupRemote');let calls=0;await assert.rejects(backup({config:testConfig(),transport:simulatedTransport({async downloadObject(){return calls++?Buffer.alloc(objectBytes.length):objectBytes;}}),destinationRoot}),/STORAGE_DRIFT/);assert.equal((await failedManifest(destinationRoot)).status,'FAIL');
}));
test('unsafe or duplicate object paths fail before downloading anything',async()=>{
 const backup=feature(engine,'backupRemote');
 for(const change of [s=>{s.objects[0].name='../private';},s=>{s.objects.push(structuredClone(s.objects[0]));}])await withBackup(async destinationRoot=>{const s=snapshot();change(s);let reads=0;await assert.rejects(backup({config:testConfig(),transport:simulatedTransport({async readSnapshot(){return s;},async downloadObject(){reads++;return objectBytes;}}),destinationRoot}),/STORAGE_INVENTORY/);assert.equal(reads,0);});
});
test('archive validation false or malformed dump must never pass',async()=>{
 const backup=feature(engine,'backupRemote');
 for(const transport of [simulatedTransport({async validateArchive(){return false;}}),simulatedTransport({async dumpDatabase(){return Buffer.from('invalid dump');}})])await withBackup(async destinationRoot=>{await assert.rejects(backup({config:testConfig(),transport,destinationRoot}),/ARCHIVE_VALIDATION/);assert.equal((await failedManifest(destinationRoot)).status,'FAIL');});
});
test('unbranded configuration is rejected before touching the source',async()=>withBackup(async destinationRoot=>{
 const backup=feature(engine,'backupRemote');let reads=0;await assert.rejects(backup({config:{mode:'isolated-test',projectRef:'fixture'},transport:simulatedTransport({async readSnapshot(){reads++;return snapshot();}}),destinationRoot}),/REMOTE_CONFIG/);assert.equal(reads,0);
}));
test('snapshot reader hashes Auth and Storage rows without returning them and uses read-only SQL',async()=>{
 const read=feature(source,'readRemoteSnapshot');const s=snapshot();const lines=[{kind:'meta',migrationHead:s.migrationHead,postgresVersion:s.postgresVersion,postgresMajor:s.postgresMajor,databaseTables:s.databaseTables,schemaConstraints:s.schemaConstraints,schemaIndexes:s.schemaIndexes},{kind:'security',value:s.schemaSecurity},{kind:'objects',value:s.objects},{kind:'buckets',value:s.buckets},...Object.entries(s.tables).map(([name,rows])=>({kind:'table',schema:'public',name,rows})),...s.contentFingerprints.map(item=>({kind:'fingerprint',...item}))];
 let sql;const result=await read(async query=>{sql=query;return lines.map(row=>JSON.stringify(row)).join('\n');});assert.equal(result.postgresMajor,17);assert.ok(result.authTables.includes('users'));assert.match(result.databaseFingerprint,/^[a-f0-9]{64}$/);assert.ok(!Object.hasOwn(result,'authRows'));assert.match(sql,/REPEATABLE READ READ ONLY/);assert.ok(!/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i.test(sql),'snapshot SQL must not contain write commands');
});
test('archive TOC validation requires all public, auth and storage data inventories',()=>{
 const validate=feature(source,'validateRemoteArchiveList');const s=snapshot();assert.equal(validate(archiveList(s),coreTables,s.databaseTables),true);
 for(const removed of ['auth users','auth identities','storage objects'])assert.throws(()=>validate(archiveList(s).split('\n').filter(line=>!line.includes(removed)).join('\n'),coreTables,s.databaseTables),/archive/i);
});
test('PostgreSQL multiline JSON aggregates are parsed as records without splitting their nested arrays',async()=>{
 const s=snapshot();s.tables.universities=[{id:'synthetic-1',name:'Quoted } and \\" brace { text'},{id:'synthetic-2',name:'Second synthetic row'}];
 const lines=[{kind:'meta',migrationHead:s.migrationHead,postgresVersion:s.postgresVersion,postgresMajor:s.postgresMajor,databaseTables:s.databaseTables,schemaConstraints:s.schemaConstraints,schemaIndexes:s.schemaIndexes},{kind:'security',value:s.schemaSecurity},{kind:'objects',value:s.objects},{kind:'buckets',value:s.buckets},...Object.entries(s.tables).map(([name,rows])=>({kind:'table',schema:'public',name,rows})),...s.contentFingerprints.map(item=>({kind:'fingerprint',...item}))];
 const read=feature(source,'readRemoteSnapshot');const result=await read(async()=>lines.map(row=>JSON.stringify(row,null,2)).join('\n'));
 assert.deepEqual(result.tables.universities,s.tables.universities);
 await assert.rejects(read(async()=>lines.map(row=>JSON.stringify(row,null,2)).join('\n')+'\nINCOMPLETE'),/SOURCE_READ_FAILED/);
});
test('PostgreSQL transport puts credentials in a temporary passfile, never argv or inherited environment',async()=>{
 const create=feature(source,'createRemoteTransport');const config=feature(source,'parseRemoteSourceConfig')(productionEnv());let passfile;let inspected=false;
 const transport=create(config,{runProcess:async(bin,args,options)=>{inspected=true;assert.ok(!args.join(' ').includes(password)&&!args.join(' ').includes(serviceRoleKey),'secret in argv');assert.equal(options.shell,false);assert.equal(options.env.PGPASSWORD,undefined);assert.equal(options.env.SUPABASE_SERVICE_ROLE_KEY,undefined);assert.equal(options.env.PGSSLMODE,'verify-full');assert.match(options.env.PGOPTIONS,/default_transaction_read_only=on/);passfile=options.env.PGPASSFILE;assert.ok((await fs.readFile(passfile,'utf8')).includes(password),'passfile did not receive password');return Buffer.concat([Buffer.from('PGDMP'),Buffer.alloc(80)]);}});
 await transport.dumpDatabase();assert.ok(inspected);await assert.rejects(fs.stat(passfile));
});
test('HTTP transport only uses GET, rejects redirects, and sanitizes errors',async()=>{
 const create=feature(source,'createRemoteTransport');const config=feature(source,'parseRemoteSourceConfig')(productionEnv());let calls=0;
 const transport=create(config,{fetchImpl:async(url,options)=>{calls++;assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(new URL(url).hostname,`${projectRef}.supabase.co`);return new Response(objectBytes,{status:200});}});assert.deepEqual(await transport.downloadObject('application-documents','owner-a/file.pdf'),objectBytes);assert.equal(calls,1);
 const failing=create(config,{fetchImpl:async()=>{throw Error(password+' '+serviceRoleKey);}});await assert.rejects(failing.downloadObject('application-documents','owner-a/file.pdf'),error=>{for(const value of [password,serviceRoleKey])assert.ok(!String(error.stack).includes(value),'secret leaked into transport error');return /STORAGE_READ_FAILED/.test(error.message);});
});
test('an empty Storage source still validates its privileged API key before SQL reads',async()=>{
 const create=feature(source,'createRemoteTransport');const config=feature(source,'parseRemoteSourceConfig')(productionEnv());let sqlReads=0;
 const transport=create(config,{fetchImpl:async()=>new Response(null,{status:401}),runProcess:async()=>{sqlReads++;return Buffer.from('');}});
 await assert.rejects(transport.readSnapshot(),/SOURCE_ACCESS_FAILED/);assert.equal(sqlReads,0);
});
test('source descriptors cannot omit columns or duplicate fingerprint entries',()=>{
 const validate=feature(source,'validateSourceSnapshot');for(const change of [s=>{s.databaseTables[0].columns=[];},s=>{s.databaseTables[0].columns.push(structuredClone(s.databaseTables[0].columns[0]));},s=>{s.contentFingerprints.push(structuredClone(s.contentFingerprints[0]));}]){const s=snapshot();change(s);assert.throws(()=>validate(s),/SOURCE_SNAPSHOT_INVALID/);}
});
test('constraints and indexes are mandatory source metadata in successful bundles',async()=>withBackup(async destinationRoot=>{
 const validate=feature(source,'validateSourceSnapshot');for(const key of ['schemaConstraints','schemaIndexes']){const s=snapshot();delete s[key];assert.throws(()=>validate(s),/SOURCE_SNAPSHOT_INVALID/);}
 const backup=feature(engine,'backupRemote');const dir=await backup({config:testConfig(),transport:simulatedTransport(),destinationRoot});const manifest=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'));assert.deepEqual(manifest.source.schemaConstraints,snapshot().schemaConstraints);assert.deepEqual(manifest.source.schemaIndexes,snapshot().schemaIndexes);
}));
test('constraint and index definition changes during backup fail stability checks',async()=>{
 const backup=feature(engine,'backupRemote');for(const key of ['schemaConstraints','schemaIndexes'])await withBackup(async destinationRoot=>{let calls=0;const transport=simulatedTransport({async readSnapshot(){const s=snapshot();if(calls++)s[key][0].definition+=' changed';return s;}});await assert.rejects(backup({config:testConfig(),transport,destinationRoot}),/SOURCE_DRIFT/);});
});
test('PostgreSQL schema definitions preserve legitimate pretty printed whitespace',()=>{
 const validate=feature(source,'validateSourceSnapshot');
 const s=snapshot();s.schemaConstraints[0].definition="CHECK (\n    id IS NOT NULL\r\n\tAND length(id::text) > 0\n)";s.schemaIndexes[0].definition='CREATE UNIQUE INDEX fixture\n ON public.profiles USING btree (id)';
 assert.doesNotThrow(()=>validate(s));
 for(const bad of ['   ','CHECK (id IS NOT NULL)\x00','CHECK (id IS NOT NULL)\x07']){const altered=snapshot();altered.schemaConstraints[0].definition=bad;assert.throws(()=>validate(altered),/SOURCE_SNAPSHOT_INVALID/);}
});
