import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const localRoot=path.resolve(import.meta.dirname,'..');
export const localPage='http://127.0.0.1:4189/outputs/index.html';
const apiUrl='http://127.0.0.1:55421';
const fail=code=>new Error(code);
const messages={LOCAL_PROJECT_INVALID:'本地项目配置不匹配，请使用原 Atlas 文件夹启动。',LOCAL_DEPENDENCIES_MISSING:'缺少本地依赖，请在 Atlas 文件夹执行 npm install 后重试。',DOCKER_UNAVAILABLE:'Docker 尚未就绪，请先打开 Docker Desktop，等待启动完成后重试。',LOCAL_SERVICES_START_FAILED:'本地数据库未能启动，请检查 Docker Desktop 是否运行正常。',LOCAL_SERVICE_IDENTITY_INVALID:'本地服务地址或公开配置不匹配，已停止启动。',LOCAL_SERVICES_UNHEALTHY:'本地数据库服务尚未就绪，请稍后重新启动 Atlas。',LOCAL_PAGE_START_FAILED:'Atlas 页面未能启动，可能是 4189 端口已被占用。',LOCAL_LAUNCH_BUSY:'Atlas 正在启动，请稍后再试。',LOCAL_PATH_INVALID:'启动记录目录异常，已停止操作。',LOCAL_PROCESS_IDENTITY_FAILED:'无法核实页面进程，请稍后重试。',LOCAL_BROWSER_FAILED:'页面已启动，请手动打开 http://127.0.0.1:4189/outputs/index.html。',LOCAL_LAUNCH_FAILED:'Atlas 启动未完成，请稍后重试。'};
export function launchMessage(code){return messages[code]||messages.LOCAL_LAUNCH_FAILED;}
function safeText(value){return typeof value==='string'&&value.length>0&&!/[\x00-\x1f]/.test(value);}
export function launchContext(root){return {root:path.resolve(root),nodePath:process.execPath,vitePath:path.join(path.resolve(root),'node_modules/vite/bin/vite.js'),url:localPage};}
export function viteLaunchOptions(root,browserConfig){const c=launchContext(root);return {executable:c.nodePath,args:[c.vitePath,'--host','127.0.0.1','--port','4189','--strictPort','--mode','local-dev'],options:{cwd:c.root,shell:false,windowsHide:true,detached:true,stdio:'ignore',...(browserConfig?{env:{...process.env,VITE_SUPABASE_URL:browserConfig.url,VITE_SUPABASE_PUBLISHABLE_KEY:browserConfig.key}}:{})}};}
function capture(executable,args,options={}){return new Promise((resolve,reject)=>{const child=spawn(executable,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],...options});const chunks=[];let size=0;child.stdout.on('data',b=>{size+=b.length;if(size>4*1024*1024)child.kill();else chunks.push(b);});child.stderr.on('data',()=>{});child.on('error',()=>reject(fail('PROCESS_FAILED')));child.on('close',code=>code===0?resolve(Buffer.concat(chunks).toString()):reject(fail('PROCESS_FAILED')));});}
const psLiteral=value=>"'"+String(value).replaceAll("'","''")+"'";
function identityScript(record,context,{stop=false,captureTime=false}={}){
 if(!Number.isInteger(record.pid)||record.pid<1)throw fail('LOCAL_PROCESS_IDENTITY_FAILED');
 const node=psLiteral(context.nodePath),script=psLiteral(context.vitePath),stamp=psLiteral(record.startedAt||'');
 // CIM command lines stay inside this subprocess: output is a timestamp or a boolean.
 return `$ErrorActionPreference='Stop'; $atlasItem=Get-CimInstance Win32_Process -Filter 'ProcessId = ${record.pid}' -ErrorAction SilentlyContinue; $atlasMatches=$null -ne $atlasItem -and $atlasItem.ExecutablePath -eq ${node} -and $atlasItem.CommandLine -match ('(?:^|\\s)"?'+[regex]::Escape(${script})+'"?(?:\\s|$)') -and $atlasItem.CommandLine.Contains('--host 127.0.0.1 --port 4189 --strictPort --mode local-dev'); if(-not $atlasMatches){'false';exit}; $atlasStamp=$atlasItem.CreationDate.ToUniversalTime().ToString('o'); ${captureTime?"$atlasStamp":`if($atlasStamp -ne ${stamp}){'false';exit}; ${stop?`$atlasProcess=[Diagnostics.Process]::GetProcessById(${record.pid}); $atlasExpected=[datetime]${stamp}; if([Math]::Abs(($atlasProcess.StartTime.ToUniversalTime()-$atlasExpected.ToUniversalTime()).TotalSeconds) -gt 0.1){'false';exit}; $atlasProcess.Kill(); $atlasProcess.Dispose(); `:''}'true'`}`;
}
async function ps(code){for(const executable of ['pwsh.exe','powershell.exe'])try{return await capture(executable,['-NoProfile','-NonInteractive','-Command',code]);}catch{}throw fail('PROCESS_FAILED');}
export const nativeProcesses={
 async spawnVite(context){const options=viteLaunchOptions(context.root,context.browserConfig);const child=spawn(options.executable,options.args,options.options);await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',()=>reject(fail('LOCAL_PAGE_START_FAILED')));});try{const startedAt=(await ps(identityScript({pid:child.pid},context,{captureTime:true}))).trim();if(!startedAt||startedAt==='false')throw fail('LOCAL_PROCESS_IDENTITY_FAILED');child.unref();return {pid:child.pid,startedAt};}catch{child.kill();throw fail('LOCAL_PROCESS_IDENTITY_FAILED');}},
 async matches(record,context){try{return (await ps(identityScript(record,context))).trim()==='true';}catch{return false;}},
 async stopVerified(record,context){try{return (await ps(identityScript(record,context,{stop:true}))).trim()==='true';}catch{return false;}},
 async openBrowser(){await ps(`Start-Process -FilePath ${psLiteral(localPage)} -WindowStyle Hidden`);}
};
function nativeServices(root){const cli=path.join(root,'node_modules/supabase/dist/supabase.js');return {
 async dockerReady(){await capture('docker',['info','--format','{{.ServerVersion}}'],{cwd:root});},
 async status(){return JSON.parse(await capture(process.execPath,[cli,'status','--output','json'],{cwd:root}));},
 async start(){await capture(process.execPath,[cli,'start','-x','realtime,studio,postgres-meta,edge-runtime,logflare,vector,supavisor,imgproxy'],{cwd:root});},
 async healthy(settings){const publicKey=settings.PUBLISHABLE_KEY??settings.ANON_KEY;for(const route of ['/auth/v1/health','/rest/v1/','/storage/v1/status']){const response=await fetch(apiUrl+route,{method:'GET',redirect:'error',headers:{apikey:publicKey},signal:AbortSignal.timeout(10000)});if(!response.ok)throw fail('LOCAL_SERVICES_UNHEALTHY');await response.arrayBuffer();}}
};}
const nativeHTTP={async pageReady(){try{const response=await fetch(localPage,{redirect:'error',signal:AbortSignal.timeout(2000)});return response.ok&&/<title>Atlas\b/.test(await response.text());}catch{return false;}},async waitForPage(){for(let attempt=0;attempt<40;attempt++){if(await this.pageReady())return;await new Promise(resolve=>setTimeout(resolve,500));}throw fail('LOCAL_PAGE_START_FAILED');}};
export async function readLaunchRecord(root){try{const record=JSON.parse(await fs.readFile(path.join(root,'work/local-launch.json'),'utf8'));const c=launchContext(root);return record.root===c.root&&record.nodePath===c.nodePath&&record.vitePath===c.vitePath&&record.url===localPage&&Number.isInteger(record.pid)&&record.pid>0&&safeText(record.startedAt)?record:null;}catch{return null;}}
export async function launchWork(root){const work=path.join(root,'work');await fs.mkdir(work,{recursive:true});if(await fs.realpath(work)!==path.resolve(work))throw fail('LOCAL_PATH_INVALID');const record=await fs.lstat(path.join(work,'local-launch.json')).catch(()=>null);if(record&&(!record.isFile()||record.isSymbolicLink()))throw fail('LOCAL_PATH_INVALID');return work;}
async function acquireLock(work){const filename=path.join(work,'local-launch.lock');try{const lock=await fs.open(filename,'wx');await lock.writeFile(JSON.stringify({pid:process.pid}));return lock;}catch(error){if(error.code!=='EEXIST')throw error;let owner;try{owner=JSON.parse(await fs.readFile(filename,'utf8'));}catch{throw fail('LOCAL_LAUNCH_BUSY');}if(!Number.isInteger(owner.pid)||owner.pid<1)throw fail('LOCAL_LAUNCH_BUSY');try{process.kill(owner.pid,0);throw fail('LOCAL_LAUNCH_BUSY');}catch(error){if(error.message==='LOCAL_LAUNCH_BUSY'||error.code!=='ESRCH')throw fail('LOCAL_LAUNCH_BUSY');}await fs.rm(filename);const lock=await fs.open(filename,'wx');await lock.writeFile(JSON.stringify({pid:process.pid}));return lock;}}
function publicLocalKey(settings){const key=settings.PUBLISHABLE_KEY??settings.ANON_KEY;let publicKey=safeText(key)&&/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(key);try{if(safeText(key)&&key.split('.').length===3&&JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role==='anon')publicKey=true;}catch{}if(!publicKey)throw fail('LOCAL_SERVICE_IDENTITY_INVALID');return key;}
async function ensurePublicEnvironment(root,settings){const file=path.join(root,'.env.local');const key=publicLocalKey(settings);if(await fs.lstat(file).catch(()=>null))return;
 const temporary=path.join(root,'.atlas-public-env-'+process.pid+'-'+Date.now());try{await fs.writeFile(temporary,`VITE_SUPABASE_URL=${apiUrl}\nVITE_SUPABASE_PUBLISHABLE_KEY=${key}\n`,{flag:'wx'});try{await fs.link(temporary,file);}catch(error){if(error.code!=='EEXIST')throw error;}}finally{await fs.rm(temporary,{force:true});}}
export async function startLocal({root=localRoot,openBrowser=true,services,processes=nativeProcesses,http=nativeHTTP}={}){
 root=path.resolve(root);const context=launchContext(root);let lock,stage='LOCAL_PROJECT_INVALID';
 try{
  const config=await fs.readFile(path.join(root,'supabase/config.toml'),'utf8');const ids=[...config.matchAll(/^project_id\s*=\s*"([^"]+)"\s*(?:#.*)?$/gm)];const sectionPort=section=>{const match=config.match(new RegExp('^\\['+section+'\\]\\s*(?:#.*)?$([\\s\\S]*?)(?=^\\[|$(?![\\s\\S]))','m'));return Number(match?.[1].match(/^port\s*=\s*(\d+)\s*(?:#.*)?$/m)?.[1]);};if(ids.length!==1||ids[0][1]!=='atlas-local-01a12938'||sectionPort('api')!==55421||sectionPort('db')!==55422)throw fail(stage);
  stage='LOCAL_DEPENDENCIES_MISSING';for(const file of [context.vitePath,path.join(root,'node_modules/supabase/dist/supabase.js')])if(!(await fs.stat(file)).isFile())throw fail(stage);
  const work=await launchWork(root);stage='LOCAL_LAUNCH_BUSY';lock=await acquireLock(work);services??=nativeServices(root);
  stage='DOCKER_UNAVAILABLE';await services.dockerReady();stage='LOCAL_SERVICES_START_FAILED';let settings;try{settings=await services.status();}catch{await services.start();settings=await services.status();}
  stage='LOCAL_SERVICE_IDENTITY_INVALID';if(settings.API_URL!==apiUrl)throw fail(stage);context.browserConfig={url:apiUrl,key:publicLocalKey(settings)};await ensurePublicEnvironment(root,settings);
  stage='LOCAL_SERVICES_UNHEALTHY';await services.healthy(settings);
  const record=await readLaunchRecord(root);stage='LOCAL_PAGE_START_FAILED';let status='LOCAL_STARTED';
  if(record&&await processes.matches(record,context)){if(!await http.pageReady())await http.waitForPage();status='LOCAL_REUSED';}
  else if(await http.pageReady()){status='LOCAL_REUSED_UNMANAGED';}
  else {const identity=await processes.spawnVite(context);const next={...launchContext(root),...identity};await fs.writeFile(path.join(work,'local-launch.json'),JSON.stringify(next,null,2)+'\n');await http.waitForPage();}
  if(openBrowser){stage='LOCAL_BROWSER_FAILED';await processes.openBrowser(localPage);}return {status,url:localPage,...(status==='LOCAL_REUSED_UNMANAGED'?{source:'UNVERIFIED_UNMANAGED'}:{})};
 }catch(error){throw fail(Object.hasOwn(messages,error.message)?error.message:stage);}finally{if(lock){await lock.close();await fs.rm(path.join(root,'work/local-launch.lock'),{force:true}).catch(()=>{});}}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){startLocal().then(result=>console.log(result.status==='LOCAL_REUSED_UNMANAGED'?'已打开原先运行的 Atlas 页面。此进程的本地配置未核实，停止 Atlas 不会关闭它。':result.status==='LOCAL_STARTED'?'Atlas 已启动。':'Atlas 页面已打开。')).catch(error=>{console.error(launchMessage(error.message));process.exitCode=1;});}
