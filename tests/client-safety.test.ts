import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
test('client rejects privileged keys and non-HTTPS remote endpoints',async()=>{
  const module=await import('../src/client.ts');
  assert.throws(()=>module.validatePublicConfig('https://example.supabase.co','sb_secret_secret'),/公开|public/i);
  const secretJwt=`eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')}.x`;
  assert.throws(()=>module.validatePublicConfig('https://example.supabase.co',secretJwt),/公开|public/i);
  assert.throws(()=>module.validatePublicConfig('http://example.com','sb_publishable_example'),/HTTPS/i);
  assert.doesNotThrow(()=>module.validatePublicConfig('http://127.0.0.1:55421','sb_publishable_example'));
});
test('draft recovery is isolated by owner and clears only after confirmed save',async()=>{
  const {DraftRecovery}=await import('../src/drafts.ts');
  const values=new Map<string,string>();
  const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)};
  const a=new DraftRecovery(storage,'owner-a'); const b=new DraftRecovery(storage,'owner-b');
  a.write('essay1','unsaved text',2); assert.equal(b.read('essay1'),null);
  assert.equal(a.read('essay1')?.content,'unsaved text');
  a.clear('essay1'); assert.equal(a.read('essay1'),null);
});
test('database errors are mapped to stable UI error categories',async()=>{
  const {mapError}=await import('../src/errors.ts');
  assert.equal(mapError({code:'23505'}).kind,'CONFLICT');
  assert.equal(mapError({code:'42501'}).kind,'PERMISSION_DENIED');
  assert.equal(mapError({code:'23503'}).kind,'VALIDATION_ERROR');
  assert.equal(mapError(new TypeError('Failed to fetch')).kind,'NETWORK_ERROR');
});
test('browser configuration validator and owner-isolated draft recovery are implemented',()=>{
  assert.ok(existsSync(new URL('../src/client.ts',import.meta.url)),'Missing public-only client validator');
  assert.ok(existsSync(new URL('../src/drafts.ts',import.meta.url)),'Missing draft recovery');
});
