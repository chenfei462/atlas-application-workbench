import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {localRoot,launchContext,readLaunchRecord,launchWork,nativeProcesses} from './start-local.mjs';
export async function stopLocal({root=localRoot,processes=nativeProcesses}={}){
 root=path.resolve(root);await launchWork(root);const record=await readLaunchRecord(root);if(!record)return {status:'LOCAL_NOT_RUNNING'};
 const context=launchContext(root);if(!await processes.matches(record,context)){await fs.rm(path.join(root,'work/local-launch.json'),{force:true});return {status:'LOCAL_STALE_RECORD'};}
 if(!await processes.stopVerified(record,context))throw Error('LOCAL_STOP_IDENTITY_FAILED');
 await fs.rm(path.join(root,'work/local-launch.json'),{force:true});return {status:'LOCAL_STOPPED'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){stopLocal().then(result=>console.log(result.status==='LOCAL_STOPPED'?'Atlas 页面已停止，本地数据库和数据已保留。':'没有需要关闭的 Atlas 页面进程，本地数据库和数据已保留。')).catch(()=>{console.error('无法核实页面进程，已保留该进程。可关闭浏览器后稍后重试。');process.exitCode=1;});}
