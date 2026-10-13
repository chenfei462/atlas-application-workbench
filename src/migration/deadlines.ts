/** Parse legacy deadlines without ever consulting the host timezone. */
export function normalizeRoundDeadline(deadline:unknown, timezone:unknown, id:string) {
 const zone=timezone==null?null:String(timezone);
 let formatter:Intl.DateTimeFormat|null=null;
 if(zone){try{if(/^[+-]/.test(zone))throw new Error();formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});}catch{throw new Error(`Invalid IANA timezone for round ${id}`);}}
 if(deadline==null||deadline==='')return {deadline_date:null,deadline_time:null,timezone:zone,deadline_precision:'UNKNOWN_TIME'};
 if(typeof deadline!=='string')throw new Error(`Invalid round deadline ${id}`);
 const m=/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(deadline);
 if(!m)throw new Error(`Invalid round deadline ${id}`);
 const [year,month,date,hour,minute,second]=[m[1],m[2],m[3],m[4]??'00',m[5]??'00',m[6]??'00'].map(Number);
 const base=Date.UTC(year,month-1,date,hour,minute,second);const check=new Date(base);
 if(check.getUTCFullYear()!==year||check.getUTCMonth()!==month-1||check.getUTCDate()!==date||hour>23||minute>59||second>59)throw new Error(`Invalid round deadline ${id}`);
 if(m[4]===undefined)return {deadline_date:deadline,deadline_time:null,timezone:zone,deadline_precision:'DATE_ONLY'};
 const fraction=m[7]??'';const localTime=`${m[4]}:${m[5]}:${m[6]??'00'}${fraction}`;
 const parts=(instant:number)=>Object.fromEntries(formatter!.formatToParts(new Date(instant)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
 const matches=(instant:number)=>{const p=parts(instant);return p.year===year&&p.month===month&&p.day===date&&p.hour===hour&&p.minute===minute&&p.second===second;};
 if(m[8]){
  const offset=m[8]==='Z'?'Z':m[8].includes(':')?m[8]:`${m[8].slice(0,3)}:${m[8].slice(3)}`;
  const instant=Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]??'00'}${offset}`);
  if(Number.isNaN(instant)||zone&&!matches(instant))throw new Error(`Invalid round deadline offset/timezone ${id}`);
  if(zone)return {deadline_date:deadline.slice(0,10),deadline_time:localTime,timezone:zone,deadline_precision:'EXACT_TIME'};
  const utc=new Date(instant).toISOString();return {deadline_date:utc.slice(0,10),deadline_time:utc.slice(11,19)+fraction,timezone:'UTC',deadline_precision:'EXACT_TIME'};
 }
 if(!zone)throw new Error(`Round ${id} exact deadline requires an explicit offset or IANA timezone`);
 // Sample zone offsets around the calendar day, then round-trip every candidate.
 // Gaps produce zero candidates; DST folds produce two. Neither is guessed.
 const offsets=new Set<number>();for(let h=-48;h<=48;h+=6){const probe=base+h*3600000;const p=parts(probe);offsets.add(Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second)-probe);}
 const candidates=[...offsets].map(offset=>base-offset).filter(matches);
 if(candidates.length===0)throw new Error(`Nonexistent or invalid round local time ${id}`);
 if(candidates.length!==1)throw new Error(`Ambiguous round local time ${id}; provide an explicit offset`);
 return {deadline_date:deadline.slice(0,10),deadline_time:localTime,timezone:zone,deadline_precision:'EXACT_TIME'};
}
