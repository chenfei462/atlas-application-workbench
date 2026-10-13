import {defineConfig,loadEnv} from 'vite';
import path from 'node:path';
import {validatePublicConfig} from './src/public-config.js';
export default defineConfig(({mode,command})=>{
 const env={...loadEnv(mode,process.cwd(),'VITE_'),...process.env};
 if(command==='build'&&mode!=='local-dev'){
  try{validatePublicConfig(env.VITE_SUPABASE_URL??'',env.VITE_SUPABASE_PUBLISHABLE_KEY??'',{production:true});}
  catch{throw new Error('BLOCKED_PRODUCTION_CONFIGURATION: set a root HTTPS non-loopback VITE_SUPABASE_URL and a public non-placeholder VITE_SUPABASE_PUBLISHABLE_KEY.');}
 }
 return {root:process.cwd(),envDir:process.cwd(),server:{host:'127.0.0.1',port:4189,strictPort:true,fs:{allow:[process.cwd()]}},preview:{host:'127.0.0.1',port:4189,strictPort:true},build:{outDir:path.resolve('dist'),emptyOutDir:true,sourcemap:false,rollupOptions:{input:path.resolve('outputs/index.html')}}};
});

