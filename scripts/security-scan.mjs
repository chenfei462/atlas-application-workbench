import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');const excluded=new Set(['node_modules','.git','work','backups','backups-remote','.temp','.branches']);const failures=[];let files=0;
function scan(text,file){
 if(/gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,}/.test(text))failures.push(`${file}: GitHub credential value`);
 if(/sbp_[A-Za-z0-9]{20,}/.test(text))failures.push(`${file}: Supabase access token value`);
 if(/sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/.test(text))failures.push(`${file}: API credential value`);
 if(/sb_secret_[A-Za-z0-9_-]{10,}/.test(text))failures.push(`${file}: privileged secret key value`);
 if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text))failures.push(`${file}: private key material`);
 if(/postgres(?:ql)?:\/\/[^\s'"<>]*:[^\s'"<>]+@/.test(text))failures.push(`${file}: credential-bearing database URL`);
 for(const match of text.matchAll(/eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)){try{if(JSON.parse(Buffer.from(match[1],'base64url').toString()).role==='service_role')failures.push(`${file}: privileged JWT value`);}catch{}}
 if(path.basename(file)==='.env.example'&&text.split('\n').some(line=>/^(?:VITE_|SUPABASE_|DATABASE_URL|SERVICE_ROLE_KEY)[A-Z0-9_]*=.+/.test(line.trim())&&!/=(?:<[^>]+>|your[-_]|placeholder)/i.test(line.trim())))failures.push(`${file}: example contains non-placeholder configuration`);
}
async function visit(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){if(excluded.has(entry.name)||entry.name.startsWith('.env')&&entry.name!=='.env.example')continue;const file=path.join(dir,entry.name);if(entry.isSymbolicLink())continue;if(entry.isDirectory())await visit(file);else if(/\.(?:ts|js|mjs|json|html|md|sql|toml|ps1|css|cmd|txt|ya?ml)$/.test(entry.name)||entry.name==='.env.example'){files++;scan(await fs.readFile(file,'utf8'),path.relative(root,file));}}}
await visit(root);const ignore=await fs.readFile(path.join(root,'.gitignore'),'utf8');for(const required of ['.env','backups/','work/'])if(!ignore.split(/\r?\n/).includes(required))failures.push(`Missing gitignore entry ${required}`);
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}else console.log(`SECRET_SAFETY_PASS: ${files} source, build, docs and fixture files scanned; private runtime paths ignored`);
