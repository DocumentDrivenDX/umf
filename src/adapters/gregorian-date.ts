// SPDX-License-Identifier: MIT OR Apache-2.0
/** Explicit civil-date recipe; does not select semantics for a bare core date. */
export const GREGORIAN_DATE_PROFILE='umf-gregorian-date/1.0.0' as const;
export interface GregorianDate {
 readonly profile:typeof GREGORIAN_DATE_PROFILE;
 readonly originalText:string;
 readonly year:number;
 readonly month:number;
 readonly day:number;
}
export type GregorianDateUnit='year'|'quarter'|'month'|'day';

export function parseGregorianDate(token:string):GregorianDate {
 if(typeof token!=='string')throw new TypeError('Gregorian date requires text');
 if(token.length!==10)throw new RangeError('Gregorian date requires ten ASCII characters');
 const match=/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(token);
 if(!match||match[0]!==token)throw new RangeError('Gregorian date syntax');
 const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
 const leap=year%4===0&&(year%100!==0||year%400===0);
 const lengths=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 if(year<1||month<1||month>12||day<1||day>lengths[month-1]!)throw new RangeError('Gregorian date calendar');
 return Object.freeze({profile:GREGORIAN_DATE_PROFILE,originalText:token,year,month,day});
}

export function truncateGregorianDate(token:string,unit:string):string {
 const source=parseGregorianDate(token);
 if(!['year','quarter','month','day'].includes(unit))throw new RangeError('Gregorian date truncation unit');
 if(unit==='day')return source.originalText;
 const month=unit==='year'?1:unit==='quarter'?1+3*Math.floor((source.month-1)/3):source.month;
 const result=String(source.year).padStart(4,'0')+'-'+String(month).padStart(2,'0')+'-01';
 // The same explicit recipe owns output validity; never defer to a host Date.
 return parseGregorianDate(result).originalText;
}
