import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

test('browser test proxy forwards online traffic, fails saves offline, and requires its control token',async()=>{
 const {startBrowserTestProxy}=await import('../scripts/browser-test-proxy.mjs');
 const upstream=http.createServer((request,response)=>{response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify({path:request.url}));});
 await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
 const upstreamPort=upstream.address().port;let proxy;
 try{
  proxy=await startBrowserTestProxy({apiPort:0,controlPort:0,controlToken:'synthetic-control-token-for-local-tests',testUpstreamPort:upstreamPort});
  const read=await fetch(`${proxy.apiUrl}/rest/v1/essays`);assert.equal(read.status,200);assert.equal((await read.json()).path,'/rest/v1/essays');
  const denied=await fetch(`${proxy.controlUrl}/mode`,{method:'POST',body:JSON.stringify({offline:true})});assert.equal(denied.status,403);
  const changed=await fetch(`${proxy.controlUrl}/mode`,{method:'POST',headers:{'x-atlas-test-token':'synthetic-control-token-for-local-tests'},body:JSON.stringify({offline:true})});assert.equal(changed.status,200);
  await assert.rejects(fetch(`${proxy.apiUrl}/rest/v1/rpc/save_essay_version`,{method:'POST',body:'{}'}),/fetch failed/);
  const online=await fetch(`${proxy.controlUrl}/mode`,{method:'POST',headers:{'x-atlas-test-token':'synthetic-control-token-for-local-tests'},body:JSON.stringify({offline:false})});assert.equal(online.status,200);
  assert.equal((await fetch(`${proxy.apiUrl}/rest/v1/rpc/save_essay_version`,{method:'POST',body:'{}'})).status,200);
 }finally{if(proxy)await proxy.close();upstream.closeAllConnections();await new Promise(resolve=>upstream.close(resolve));}
});

test('proxy refuses non-local targets and missing control credentials before listening',async()=>{
 const {startBrowserTestProxy}=await import('../scripts/browser-test-proxy.mjs');
 await assert.rejects(startBrowserTestProxy({controlToken:''}),/control token/i);
 await assert.rejects(startBrowserTestProxy({controlToken:'synthetic-control-token-for-local-tests',upstream:'https://remote.example.invalid'}),/fixed local/i);
});

test('a truncated upstream response and a stalled upstream fail promptly instead of hanging a browser save',async()=>{
 const {startBrowserTestProxy}=await import('../scripts/browser-test-proxy.mjs');
 const upstream=http.createServer((request,response)=>{if(request.url==='/truncated'){response.writeHead(200,{'Content-Length':'1024'});response.flushHeaders();response.write('x');setTimeout(()=>response.destroy(),20);}});
 await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));let proxy;
 try{
  proxy=await startBrowserTestProxy({apiPort:0,controlPort:0,controlToken:'synthetic-control-token-for-local-tests',testUpstreamPort:upstream.address().port,requestTimeoutMs:100});
  await assert.rejects(async()=>{const response=await fetch(proxy.apiUrl+'/truncated',{signal:AbortSignal.timeout(1000)});await response.text();},/terminated|socket|fetch failed/i);
  const stalled=await fetch(proxy.apiUrl+'/stalled',{signal:AbortSignal.timeout(1000)});assert.equal(stalled.status,502);
  assert.equal((await fetch(proxy.controlUrl+'/mode',{method:'POST',headers:{'x-atlas-test-token':'synthetic-control-token-for-local-tests'},body:'{"offline":false}'})).status,200);
 }finally{if(proxy)await proxy.close();upstream.closeAllConnections();await new Promise(resolve=>upstream.close(resolve));}
});
