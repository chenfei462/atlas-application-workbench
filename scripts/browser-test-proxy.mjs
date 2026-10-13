// Loopback-only browser verification proxy. It never changes the main stack or
// the machine's network settings; faults affect only this test API endpoint.
import http from 'node:http';
import {pathToFileURL} from 'node:url';

const localApi='http://127.0.0.1:55421';
function listen(server,port){return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});}
async function stop(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}

export async function startBrowserTestProxy({apiPort=55461,controlPort=55462,controlToken,upstream=localApi,testUpstreamPort,requestTimeoutMs=15000}={}){
 if(typeof controlToken!=='string'||controlToken.length<32)throw Error('A private local control token is required');
 if(upstream!==localApi)throw Error('Proxy is restricted to the fixed local Atlas API');
 for(const port of [apiPort,controlPort,...(testUpstreamPort===undefined?[]:[testUpstreamPort])])if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid local test port');
 if(!Number.isSafeInteger(requestTimeoutMs)||requestTimeoutMs<1||requestTimeoutMs>60000)throw Error('Invalid local test timeout');
 const target=new URL(localApi);if(testUpstreamPort!==undefined)target.port=String(testUpstreamPort);
 let offline=false;
 const api=http.createServer((request,response)=>{
  if(offline){request.socket.destroy();return;}
  const outgoing=http.request({hostname:target.hostname,port:target.port,path:request.url,method:request.method,headers:{...request.headers,host:target.host}},incoming=>{response.writeHead(incoming.statusCode??502,incoming.headers);incoming.on('aborted',()=>response.destroy());incoming.on('error',()=>response.destroy());incoming.on('close',()=>{if(!incoming.complete)response.destroy();});incoming.pipe(response);});
  outgoing.setTimeout(requestTimeoutMs,()=>outgoing.destroy(new Error('Local upstream timed out')));
  outgoing.on('error',()=>{if(response.writableEnded||response.destroyed)return;if(response.headersSent){response.destroy();return;}response.writeHead(502,{'Content-Type':'application/json'});response.end('{"message":"Local test upstream unavailable"}');});
  request.on('error',()=>outgoing.destroy());request.on('aborted',()=>outgoing.destroy());response.on('close',()=>outgoing.destroy());request.pipe(outgoing);
 });
 const control=http.createServer(async(request,response)=>{
  const reply=(status,value)=>{response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(JSON.stringify(value));};
  if(request.headers['x-atlas-test-token']!==controlToken){reply(403,{status:'DENIED'});return;}
  if(request.method!=='POST'||request.url!=='/mode'){reply(404,{status:'NOT_FOUND'});return;}
  try{
   let body='';for await(const bytes of request){body+=bytes.toString();if(body.length>1024){reply(413,{status:'TOO_LARGE'});return;}}
   const value=JSON.parse(body);if(typeof value.offline!=='boolean'){reply(400,{status:'INVALID_MODE'});return;}
   offline=value.offline;reply(200,{status:'PASS',offline});
  }catch{reply(400,{status:'INVALID_MODE'});}
 });
 try{await listen(api,apiPort);await listen(control,controlPort);}catch(error){await stop(api);await stop(control);throw error;}
 return {apiUrl:`http://127.0.0.1:${api.address().port}`,controlUrl:`http://127.0.0.1:${control.address().port}`,close:async()=>{await stop(api);await stop(control);}};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2);
 if(args.length===1&&args[0]==='--help')console.log('Loopback browser test proxy: set ATLAS_TEST_CONTROL_TOKEN in the local process, then run this script. API 55461 forwards only local Atlas 55421; authenticated control POST /mode on 55462.');
 else if(args.length){console.error('BROWSER_PROXY_FAIL: unsupported arguments');process.exitCode=1;}
 else{
  try{const proxy=await startBrowserTestProxy({controlToken:process.env.ATLAS_TEST_CONTROL_TOKEN});console.log('BROWSER_PROXY_READY: loopback API 55461, authenticated control 55462');for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void proxy.close().finally(()=>process.exit(0));});}
  catch{console.error('BROWSER_PROXY_FAIL: local test proxy could not start');process.exitCode=1;}
 }
}
