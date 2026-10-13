import fs from 'node:fs/promises';
import path from 'node:path';
import {settings,project,inventory,exportTables,references,root,writeJSON,verifyBundle} from './backup-lib.mjs';
const index=process.argv.indexOf('--bundle');
const reportIndex=process.argv.indexOf('--report');
try {
 const reportArg=reportIndex>=0?process.argv[reportIndex+1]:null;
 if(reportIndex>=0&&(!reportArg||reportArg.startsWith('--')))throw new Error('--report requires a file path');
 const reportPath=path.resolve(reportArg??path.join(root,'work/backup-test-integrity-report.json'));
 let tables,objects;
 if(index>=0){const dir=path.resolve(process.argv[index+1]);const m=await verifyBundle(dir);tables=JSON.parse(await fs.readFile(path.join(dir,'atlas-export.json'),'utf8')).tables;objects=m.objects.map(o=>({bucket_id:o.bucket,name:o.path}));}
 else {const s=settings(),db=project();tables=await exportTables(s,db);objects=await inventory(db);}
 const refs=references(tables);const missing=refs.filter(r=>!objects.some(o=>o.bucket_id===r.bucket&&o.name===r.path));const orphanObjects=objects.filter(o=>!refs.some(r=>r.bucket===o.bucket_id&&r.path===o.name));
 // Both directions are integrity failures: a DB row whose file is absent (MISSING_STORAGE_OBJECT)
 // and a stored file no DB row references (ORPHAN_STORAGE_OBJECT). Orphans are reported, never
 // deleted - this checker is read-only and must stay that way.
 const failures=[...missing.map(r=>({code:'MISSING_STORAGE_OBJECT',...r})),...orphanObjects.map(o=>({code:'ORPHAN_STORAGE_OBJECT',bucket:o.bucket_id,path:o.name,owner:o.owner_id}))];
 const failed=missing.length>0||orphanObjects.length>0;
 const report={checkedAt:new Date().toISOString(),reportOnly:true,status:failed?'FAIL':'PASS',missingReferences:missing,orphanObjects,failures,counts:{missingReferences:missing.length,orphanObjects:orphanObjects.length},reportPath};await writeJSON(reportPath,report);console.log(JSON.stringify(report,null,2));if(failed)process.exitCode=1;
}catch(e){console.error(`INTEGRITY_FAIL ${e.message}`);process.exitCode=1;}
