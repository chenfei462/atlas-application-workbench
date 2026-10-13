export type ErrorKind='AUTH_ERROR'|'PERMISSION_DENIED'|'NOT_FOUND'|'CONFLICT'|'NETWORK_ERROR'|'VALIDATION_ERROR'|'UNKNOWN_ERROR';
const messages:Record<ErrorKind,string>={AUTH_ERROR:'登录已失效，请重新登录；当前草稿已保留。',PERMISSION_DENIED:'没有操作权限。',NOT_FOUND:'记录不存在或已删除。',CONFLICT:'记录已被另一页面修改，请重新加载后比较；当前草稿已保留。',NETWORK_ERROR:'网络连接失败，请恢复连接后重试。',VALIDATION_ERROR:'数据不符合要求，请检查关联和填写内容。',UNKNOWN_ERROR:'操作失败，请重试。'};
export class AtlasError extends Error {constructor(public kind:ErrorKind,message=messages[kind]){super(message);this.name='AtlasError';}}
export function mapError(error:unknown):AtlasError {
  if(error instanceof AtlasError)return error;
  const e=error as {code?:string;status?:number;message?:string;name?:string}|null;
  if(e?.status===401 || e?.code?.startsWith('PGRST30') || e?.name==='AuthSessionMissingError')return new AtlasError('AUTH_ERROR');
  if(e?.code==='23505' || e?.code==='40001')return new AtlasError('CONFLICT');
  if(e?.code==='42501' || e?.status===403)return new AtlasError('PERMISSION_DENIED');
  if(e?.code==='PGRST116' || e?.status===404)return new AtlasError('NOT_FOUND');
  if(e?.code?.startsWith('23') || e?.status===400)return new AtlasError('VALIDATION_ERROR');
  if(error instanceof TypeError || (e?.status??0)>=500 || /fetch|network|offline|bad gateway|service unavailable|upstream|name resolution|ECONNREFUSED/i.test(e?.message??''))return new AtlasError('NETWORK_ERROR');
  return new AtlasError('UNKNOWN_ERROR');
}
