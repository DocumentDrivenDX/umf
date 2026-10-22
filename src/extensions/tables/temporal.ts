// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../../model/types';
const temporalError=(message:string):never=>{throw new UmfError('TABLES_NATIVE_CAPACITY',message);};
const leap=(y:number)=>y%4===0&&(y%100!==0||y%400===0);
const days=(y:number,m:number)=>m===2?(leap(y)?29:28):[4,6,9,11].includes(m)?30:31;
function components(text:string):[number,number,number]{
 if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(text))temporalError('Finite ISO date required');
 const [y,m,d]=text.split('-').map(Number) as [number,number,number];
 if(y<1||y>9999||m<1||m>12||d<1||d>days(y,m))temporalError('Gregorian date outside native profile');
 return [y,m,d];
}
export function nativeDate(text:string):string{components(text);return text;}
/** Exact UTC normalization: only the calendar and integer seconds move. */
export function nativeInstant(text:string):string{
 const match=/^([0-9]{4}-[0-9]{2}-[0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]+))?(Z|[+-][0-9]{2}:[0-9]{2})$/.exec(text);
 if(!match||text.length>128)temporalError('Explicit bounded ISO instant required');
 let [y,m,d]=components(match![1]!);
 const h=Number(match![2]),min=Number(match![3]),sec=Number(match![4]),fraction=match![5]??'',zone=match![6]!;
 if(h>23||min>59||sec>59||fraction.length>6&&/[1-9]/.test(fraction.slice(6)))temporalError('Instant would round or exceed native clock profile');
 let offset=0;
 if(zone!=='Z'){
  const h=Number(zone.slice(1,3)),m=Number(zone.slice(4));
  if(h>23||m>59||zone==='-00:00')temporalError('Unknown or invalid instant offset');
  offset=(h*3600+m*60)*(zone[0]==='-'?-1:1);
 }
 let seconds=h*3600+min*60+sec-offset;
 if(seconds<0){seconds+=86400;d--;if(d===0){m--;if(m===0){y--;m=12;}d=days(y,m);}}
 else if(seconds>=86400){seconds-=86400;d++;if(d>days(y,m)){d=1;m++;if(m===13){y++;m=1;}}}
 if(y<1||y>9999)temporalError('UTC instant outside finite native year profile');
 const pad=(n:number,width=2)=>String(n).padStart(width,'0');
 return `${pad(y,4)}-${pad(m)}-${pad(d)}T${pad(Math.floor(seconds/3600))}:${pad(Math.floor(seconds%3600/60))}:${pad(seconds%60)}.${fraction.slice(0,6).padEnd(6,'0')}Z`;
}
