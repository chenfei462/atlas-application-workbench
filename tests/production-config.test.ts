import test from 'node:test';
import assert from 'node:assert/strict';
import viteConfig from '../vite.config.ts';
import {validatePublicConfig} from '../src/client.ts';

const publicKey='sb_publishable_SyntheticPublicKeyForConfigTests42';
const projectUrl='https://synthetic-project.supabase.co';
const anonKey=[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({role:'anon'})).toString('base64url'),'synthetic-signature'].join('.');

function configure(url:string|undefined,key:string|undefined,mode='production'){
  const names=['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'] as const;
  const prior=names.map(name=>process.env[name]);
  try{
    // Empty synthetic values override any ignored local env file. No real value is exposed.
    process.env.VITE_SUPABASE_URL=url??'';
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY=key??'';
    assert.equal(typeof viteConfig,'function');
    if(typeof viteConfig!=='function')throw new Error('Expected Vite configuration callback');
    return viteConfig({command:'build',mode,isSsrBuild:false,isPreview:false});
  }finally{
    names.forEach((name,index)=>{if(prior[index]===undefined)delete process.env[name];else process.env[name]=prior[index];});
  }
}

for(const [name,url] of [
  ['remote HTTP','http://synthetic-project.supabase.co'],
  ['remote FTP','ftp://synthetic-project.supabase.co'],
  ['embedded credentials','https://synthetic-user:synthetic-password@synthetic-project.supabase.co'],
  ['empty credentials','https://@synthetic-project.supabase.co'],
  ['project path','https://synthetic-project.supabase.co/rest/v1'],
  ['project query','https://synthetic-project.supabase.co/?synthetic=value'],
  ['empty project query','https://synthetic-project.supabase.co/?'],
  ['project fragment','https://synthetic-project.supabase.co/#synthetic'],
  ['empty project fragment','https://synthetic-project.supabase.co/#'],
  ['malformed URL','synthetic-invalid-url'],
  ['localhost','https://localhost'],
  ['localhost trailing dot','https://localhost.'],
  ['localhost subdomain','https://synthetic.localhost'],
  ['127/8 alias','https://127.0.0.2'],
  ['127/8 last address','https://127.255.255.255'],
  ['numeric loopback alias','https://2130706433'],
  ['IPv6 loopback','https://[::1]'],
  ['expanded IPv6 loopback','https://[0:0:0:0:0:0:0:1]'],
  ['IPv4 mapped IPv6 loopback','https://[::ffff:127.0.0.2]'],
  ['hex IPv4 mapped IPv6 loopback','https://[::ffff:7fff:ffff]'],
  ['expanded IPv4 mapped IPv6 loopback','https://[0:0:0:0:0:ffff:7f00:2]'],
] as const){
  test(`production build rejects ${name} before emitting an artifact`,()=>{
    assert.throws(()=>configure(url,publicKey),error=>{
      assert.ok(error instanceof Error);
      assert.match(error.message,/BLOCKED_PRODUCTION_CONFIGURATION/);
      assert.ok(!error.message.includes(url));
      assert.ok(!error.message.includes(publicKey));
      return true;
    });
  });
}

for(const [name,key] of [
  ['missing key',undefined],['empty key',''],['blank key','   '],
  ['empty publishable suffix','sb_publishable_'],
  ['placeholder publishable key','sb_publishable_placeholder'],
  ['example publishable key','sb_publishable_example'],
  ['your-key publishable key','sb_publishable_your_key'],
  ['template publishable key','sb_publishable_<your-key>'],
  ['privileged secret key','sb_secret_'+'synthetic_not_a_real_key'],
  ['privileged role JWT',[Buffer.from('{}').toString('base64url'),Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url'),'synthetic-signature'].join('.')],
] as const){
  test(`production build rejects ${name}`,()=>{
    assert.throws(()=>configure(projectUrl,key),error=>{
      assert.ok(error instanceof Error);
      assert.match(error.message,/BLOCKED_PRODUCTION_CONFIGURATION/);
      if(key)assert.ok(!error.message.includes(key));
      return true;
    });
  });
}

test('production build rejects missing URL with the configuration-blocked marker',()=>{
  assert.throws(()=>configure(undefined,publicKey),/BLOCKED_PRODUCTION_CONFIGURATION/);
});
test('production build accepts a synthetic root HTTPS project and public key',()=>{
  assert.doesNotThrow(()=>configure(projectUrl,publicKey));
});
test('production build accepts a public anon-role JWT',()=>{
  assert.doesNotThrow(()=>configure(projectUrl,anonKey));
});
test('local build keeps working with loopback public configuration',()=>{
  assert.doesNotThrow(()=>configure('http://127.0.0.1:55421','sb_publishable_example','local-dev'));
  assert.deepEqual(validatePublicConfig('http://127.0.0.1:55421','sb_publishable_example'),{url:'http://127.0.0.1:55421',key:'sb_publishable_example'});
});
for(const mode of ['staging','test']){
  test(`${mode} build cannot bypass production safety with local configuration`,()=>{
    assert.throws(()=>configure('http://127.0.0.1:55421',publicKey,mode),/BLOCKED_PRODUCTION_CONFIGURATION/);
  });
}
test('runtime continues to reject credential-bearing and non-HTTPS remote URLs',()=>{
  assert.throws(()=>validatePublicConfig('https://synthetic:synthetic@synthetic-project.supabase.co',publicKey));
  assert.throws(()=>validatePublicConfig('http://synthetic-project.supabase.co',publicKey));
});
