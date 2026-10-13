import {createClient} from '@supabase/supabase-js';
import type {Database} from '../types/database.types.js';
import {validatePublicConfig} from './public-config.js';
export {validatePublicConfig} from './public-config.js';
export function makeClient(url:string,key:string){const config=validatePublicConfig(url,key);return createClient<Database>(config.url,config.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:`atlas-auth:${new URL(config.url).host}`}});}
