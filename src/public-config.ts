const publishablePrefix='sb_publishable_';

function isLoopback(hostname:string){
  const host=hostname.toLowerCase().replace(/\.+$/,'');
  if(host==='localhost'||host.endsWith('.localhost')||host==='[::1]'||/^127\./.test(host))return true;
  // URL canonicalizes IPv4 spelling and expanded IPv6 before this check.
  const mapped=host.match(/^\[::ffff:([a-f0-9]{1,4}):[a-f0-9]{1,4}\]$/);
  return !!mapped&&(Number.parseInt(mapped[1],16)>>>8)===127;
}

function isPublicKey(key:string,production:boolean){
  if(key.startsWith(publishablePrefix)){
    if(!production)return true;
    const suffix=key.slice(publishablePrefix.length);
    return /^[A-Za-z0-9_-]+$/.test(suffix)&&!/(?:placeholder|^example(?:$|[_-])|^your(?:$|[_-])|^change[_-]?me$|^replace[_-]?me$|^todo$)/i.test(suffix);
  }
  if(key.split('.').length!==3)return false;
  try{
    const payload=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    return payload.role==='anon';
  }catch{return false;}
}

/** Pure public configuration validation, shared by Vite and the browser. */
export function validatePublicConfig(url:string,key:string,{production=false}:{production?:boolean}={}){
  if(!url||!key)throw new Error('Supabase 公开配置缺失。请配置项目 URL 和 publishable/anon 公钥。');
  let parsed:URL;
  try{parsed=new URL(url);}catch{throw new Error('项目 URL 格式错误。');}
  const localHttp=['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)&&parsed.protocol==='http:';
  if(parsed.protocol!=='https:'&&!(localHttp&&!production))throw new Error('远程 Supabase 必须使用 HTTPS。');
  // URL drops an empty userinfo marker and exposes empty query/fragment as ''.
  const authority=url.trim().match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i)?.[1];
  if(parsed.username||parsed.password||authority?.includes('@')||parsed.href.includes('?')||parsed.href.includes('#')||!['','/'].includes(parsed.pathname))throw new Error('项目 URL 格式错误。');
  if(production&&isLoopback(parsed.hostname))throw new Error('生产 Supabase URL 不能使用本机回环地址。');
  if(!isPublicKey(key,production))throw new Error('浏览器只能使用 public 公开 publishable/anon key，生产配置不能使用占位值。');
  return {url:parsed.origin,key};
}
