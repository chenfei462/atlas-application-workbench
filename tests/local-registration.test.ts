import test from 'node:test';
import assert from 'node:assert/strict';
import {AuthService} from '../src/auth.ts';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database} from '../types/database.types.ts';

function fixture(mode='local-dev',url='http://127.0.0.1:55421'){
 const calls:unknown[]=[];let result:unknown={data:{session:{user:{id:'synthetic-owner'}}},error:null};
 const client={auth:{signUp:async(input:unknown)=>{calls.push(input);return result;}}} as unknown as SupabaseClient<Database>;
 const auth=new AuthService(client,{mode,url});
 return {auth,calls,setResult:(value:unknown)=>{result=value;}};
}
test('a first-time local user can create their account with the same Auth client',async()=>{
 const f=fixture();const session=await f.auth.signUp(' fake@example.invalid ','synthetic-password-123');
 assert.equal(session?.user.id,'synthetic-owner');assert.deepEqual(f.calls,[{email:'fake@example.invalid',password:'synthetic-password-123'}]);
});
test('local account creation stays disabled for production modes and remote endpoints',async()=>{
 for(const [mode,url] of [['production','http://127.0.0.1:55421'],['local-dev','https://synthetic.supabase.co'],['test','http://127.0.0.1:55421'],['local-dev','http://user:pass@127.0.0.1:55421']] as const){const f=fixture(mode,url);await assert.rejects(f.auth.signUp('fake@example.invalid','synthetic-password-123'));assert.equal(f.calls.length,0);}
});
test('invalid account input is rejected before an Auth request and server failure stays retryable',async()=>{
 const f=fixture();for(const [email,password] of [['','synthetic-password-123'],['not-email','synthetic-password-123'],['fake@example.invalid','short'],['fake@example.invalid','12345678'],['fake@example.invalid','12345678901']])await assert.rejects(f.auth.signUp(email,password));assert.equal(f.calls.length,0);
 f.setResult({data:{session:null},error:{message:'synthetic server failure'}});await assert.rejects(f.auth.signUp('fake@example.invalid','synthetic-password-123'),/创建|注册/);
});
