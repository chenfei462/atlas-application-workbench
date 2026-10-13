export function zonedInstant(date:string,time:string,zone:string){
 const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date);const clock=/^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/.exec(time);
 if(!match||!clock)throw new Error('Invalid official deadline date/time');
 const expected=Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]),Number(clock[1]),Number(clock[2]),Number(clock[3]??0));
 const format=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 const local=(instant:number)=>{const parts=Object.fromEntries(format.formatToParts(new Date(instant)).map(part=>[part.type,part.value]));return Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute),Number(parts.second));};
 let guess=expected;for(let i=0;i<4;i++)guess+=expected-local(guess);
 if(local(guess)!==expected)throw new Error('Official deadline time is invalid for the timezone');
 const matches=[guess-3600000,guess,guess+3600000].filter(candidate=>local(candidate)===expected);if(matches.length!==1)throw new Error('Official deadline time is ambiguous');
 const milliseconds=Number(`0.${clock[4]??'0'}`)*1000;return new Date(guess+milliseconds).toISOString();
}
