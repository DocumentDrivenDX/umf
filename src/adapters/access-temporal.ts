// SPDX-License-Identifier: MIT OR Apache-2.0
import {parseGregorianDate} from './gregorian-date';
import {parseRfc3339ExactInstant} from './rfc3339-exact-instant';

/** Explicit typed-access profile; never selected by a bare core scalar label. */
export const ACCESS_TEMPORAL_PROFILE='umf-access-temporal/0.1.0' as const;
export type AccessTemporalKind='date'|'instant'|'local';
interface AccessTemporalBase {
 readonly profile:typeof ACCESS_TEMPORAL_PROFILE;
 readonly originalText:string;
 readonly canonicalText:string;
}
export interface AccessDate extends AccessTemporalBase {readonly kind:'date'}
export interface AccessLocal extends AccessTemporalBase {readonly kind:'local';readonly microsecond:number}
export interface AccessInstant extends AccessTemporalBase {
 readonly kind:'instant'; readonly microsecond:number;
 /** Whole UTC seconds since Unix epoch, rounding toward negative infinity. */
 readonly utcSeconds:string;
 readonly originalOffset:string;
}
export type AccessTemporal=AccessDate|AccessLocal|AccessInstant;
const datetime=/^([0-9]{4}-[0-9]{2}-[0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]{1,6}))?(Z|[+-][0-9]{2}:[0-9]{2})?$/;
const pad=(n:number,width=2)=>String(n).padStart(width,'0');
const priorDays=(year:number)=>{const y=year-1;return 365*y+Math.floor(y/4)-Math.floor(y/100)+Math.floor(y/400);};
function utcText(seconds:number,microsecond:number):string {
 // All arithmetic stays within exact bounded integers; no host Date or timezone.
 const day=Math.floor(seconds/86400)+719162;
 let lo=1,hi=10000;
 while(lo+1<hi){const middle=Math.floor((lo+hi)/2);if(priorDays(middle)<=day)lo=middle;else hi=middle;}
 let remaining=day-priorDays(lo);
 const leap=lo%4===0&&(lo%100!==0||lo%400===0);
 const lengths=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 let month=0;while(remaining>=lengths[month]!){remaining-=lengths[month]!;month++;}
 const time=seconds-Math.floor(seconds/86400)*86400;
 return `${pad(lo,4)}-${pad(month+1)}-${pad(remaining+1)}T${pad(Math.floor(time/3600))}:${pad(Math.floor(time%3600/60))}:${pad(time%60)}.${pad(microsecond,6)}Z`;
}

export function parseAccessTemporal(kind:AccessTemporalKind,token:string):AccessTemporal {
 if(typeof token!=='string')throw new TypeError('Access temporal requires text');
 if(kind!=='date'&&kind!=='instant'&&kind!=='local')throw new RangeError('Access temporal kind');
 if(token.length>32)throw new RangeError('Access temporal token limit');
 if(kind==='date'){
  const date=parseGregorianDate(token);
  return Object.freeze({profile:ACCESS_TEMPORAL_PROFILE,kind,originalText:token,canonicalText:date.originalText});
 }
 const m=datetime.exec(token);
 if(!m||m[0]!==token)throw new RangeError('Access temporal syntax or precision');
 parseGregorianDate(m[1]!);
 if(Number(m[2])>23||Number(m[3])>59||Number(m[4])>59)throw new RangeError('Access temporal clock');
 const microsecond=Number((m[5]??'').padEnd(6,'0'));
 if(kind==='local'){
  if(m[6]!==undefined)throw new RangeError('Access local requires no offset');
  return Object.freeze({profile:ACCESS_TEMPORAL_PROFILE,kind,originalText:token,
   canonicalText:token.slice(0,19)+'.'+pad(microsecond,6),microsecond});
 }
 if(m[6]===undefined||m[6]==='-00:00')throw new RangeError('Access instant requires known offset');
 const instant=parseRfc3339ExactInstant(token);
 const seconds=Number(instant.utcSeconds);
 if(seconds< -62135596800||seconds>253402300799)throw new RangeError('Access instant UTC year range');
 return Object.freeze({profile:ACCESS_TEMPORAL_PROFILE,kind,originalText:token,
  canonicalText:utcText(seconds,microsecond),microsecond,utcSeconds:instant.utcSeconds,originalOffset:instant.originalOffset});
}
