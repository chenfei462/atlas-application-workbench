import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
test('private upload service with compensation exists',()=>assert.ok(existsSync(new URL('../src/material-service.ts',import.meta.url)),'Upload service is missing'));
test('rejects unsafe filenames, zero bytes, unsupported MIME and oversized files',async()=>{
  const {validateFile}=await import('../src/material-service.ts');
  const file=(name:string,type:string,size:number)=>({name,type,size});
  for(const input of [file('../cv.pdf','application/pdf',10),file('a.pdf','application/pdf',0),file('a.exe','application/x-msdownload',10),file('a.pdf','application/pdf',25*1024*1024)]) assert.throws(()=>validateFile(input));
  assert.doesNotThrow(()=>validateFile(file('我的 CV.pdf','application/pdf',20)));
});
