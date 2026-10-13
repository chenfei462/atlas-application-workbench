import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const result=spawnSync(process.execPath,[path.join(root,'node_modules/supabase/dist/supabase.js'),'status','--output','json'],{cwd:root,encoding:'utf8'});
if(result.status!==0)throw new Error('Start the local Supabase stack first');
const settings=JSON.parse(result.stdout);if(settings.API_URL!=='http://127.0.0.1:55421')throw new Error('Unexpected local project');
writeFileSync(path.join(root,'.env.local'),`VITE_SUPABASE_URL=${settings.API_URL}\nVITE_SUPABASE_PUBLISHABLE_KEY=${settings.PUBLISHABLE_KEY??settings.ANON_KEY}\n`);
console.log('Local browser public configuration written to ignored .env.local; no privileged key exported');
