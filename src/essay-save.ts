import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database} from '../types/database.types.js';
import {DraftRecovery} from './drafts.js';
import {AtlasError,mapError} from './errors.js';

type EssaySaveInput={essayId:string;content:string;baseVersion:number|null};
export async function saveEssayDraft(client:Pick<SupabaseClient<Database>,'rpc'>,recovery:DraftRecovery,input:EssaySaveInput,isCurrent:()=>boolean=()=>true):Promise<number>{
 // Capture the submitted revision before the request; later input is a new draft.
 const {essayId,content,baseVersion}=input;const submitted=recovery.write(essayId,content,baseVersion);
 const result=await client.rpc('save_essay_version',{p_essay_id:essayId,p_expected_version:baseVersion!,p_content:content});
 if(result.error)throw mapError({...result.error,status:result.status});
 const data=result.data;const versionNumber=data&&typeof data==='object'&&!Array.isArray(data)?data.versionNumber:undefined;
 if(typeof versionNumber!=='number'||!Number.isInteger(versionNumber)||versionNumber<1||versionNumber<=(baseVersion??0))throw new AtlasError('UNKNOWN_ERROR','保存结果尚未确认；当前草稿已保留，请重新加载后核对。');
 if(isCurrent())recovery.acknowledge(essayId,submitted,versionNumber);
 return versionNumber;
}
