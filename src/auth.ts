import type {SupabaseClient,Session} from '@supabase/supabase-js';
import type {Database} from '../types/database.types.js';
import {mapError,AtlasError} from './errors.js';
export type AppState='AUTH_LOADING'|'LOGGED_OUT'|'DATA_LOADING'|'READY'|'ERROR';
export function allowsLocalRegistration(mode:string,url:string){return mode==='local-dev'&&['http://127.0.0.1:55421','http://127.0.0.1:55461'].includes(url);}
export class AuthService {
 constructor(private client:SupabaseClient<Database>,private registration:{mode:string;url:string}={mode:'production',url:''}){}
 async restore():Promise<Session|null>{const {data,error}=await this.client.auth.getSession();if(error)throw mapError(error);if(data.session){const checked=await this.client.auth.getUser();if(checked.error)throw new AtlasError('AUTH_ERROR');}return data.session;}
 async signIn(email:string,password:string){const {data,error}=await this.client.auth.signInWithPassword({email,password});if(error)throw new AtlasError('AUTH_ERROR','邮箱或密码错误，或登录服务暂不可用。');return data.session;}
 async signUp(email:string,password:string){
  if(!allowsLocalRegistration(this.registration.mode,this.registration.url))throw new AtlasError('VALIDATION_ERROR','当前仅开放本机个人账号创建。');
  email=email.trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<12)throw new AtlasError('VALIDATION_ERROR','请输入有效邮箱和至少 12 位密码。');
  const {data,error}=await this.client.auth.signUp({email,password});if(error)throw new AtlasError('AUTH_ERROR','账号创建失败，邮箱可能已使用或本地服务暂不可用。');return data.session;
 }
 async signOut(){const {error}=await this.client.auth.signOut();if(error)throw mapError(error);}
 subscribe(callback:(session:Session|null)=>void){return this.client.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>callback(session),0);}).data.subscription;}
}
