// SPDX-License-Identifier: MIT OR Apache-2.0
import {LIMITS} from '../model/json';
import {UmfError,type Json} from '../model/types';
/** Count compact JSON text without allocating an oversized retained-source serialization. */
export function assertBit128OutputBudget(value:Json):void{
 let used=0;
 const add=(n:number)=>{used+=n;if(used>LIMITS.maxTextLength)throw new UmfError('LIMIT','Native proposal exceeds aggregate JSON text limit');};
 const text=(s:string)=>{
  add(s.length+2);
  for(let i=0;i<s.length;i++){
   const c=s.charCodeAt(i);
   if(c===34||c===92)add(1);
   else if(c<32)add([8,9,10,12,13].includes(c)?1:5);
   else if(c>=0xd800&&c<=0xdbff){const low=s.charCodeAt(i+1);if(low>=0xdc00&&low<=0xdfff)i++;else add(5);}
   else if(c>=0xdc00&&c<=0xdfff)add(5);
  }
 };
 const visit=(v:Json):void=>{
  if(typeof v==='string'){text(v);return;}
  if(v===null||typeof v!=='object'){add(JSON.stringify(v).length);return;}
  const keys=Object.keys(v);add(2+Math.max(0,keys.length-1));
  if(Array.isArray(v)){for(const child of v)visit(child);}
  else for(const key of keys){text(key);add(1);visit(v[key]!);}
 };
 visit(value);
}
