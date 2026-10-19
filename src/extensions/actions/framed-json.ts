// SPDX-License-Identifier: MIT OR Apache-2.0
import {copyJson} from '../../model/json';
import type {Json} from '../../model/types';
import {planError,validUnicode} from './plan-artifacts';
/** Separate finite JSON framing budget; scalar admission remains original core JSON. */
export function copyFramedJson(input:unknown,maximumNodes=1000000,maximumDepth=64):Json {
 let nodes=0;const active=new Set<object>();
 function visit(value:unknown,depth:number):Json {
  if(++nodes>maximumNodes||depth>maximumDepth)planError('PAP_LIMIT','Framed JSON node/depth bound exceeded');
  if(value===null||typeof value!=='object'){const scalar=copyJson(value);if(typeof scalar==='string')validUnicode(scalar);return scalar;}
  const array=Array.isArray(value),prototype=Object.getPrototypeOf(value);if((array?prototype!==Array.prototype:prototype!==Object.prototype&&prototype!==null)||Object.getOwnPropertySymbols(value).length||active.has(value))planError('PAP_INVALID','Non-JSON framed value');
  if(array&&value.length>maximumNodes)planError('PAP_LIMIT','Framed array bound exceeded');active.add(value);
  const descriptors=Object.getOwnPropertyDescriptors(value),result:Json[]|Record<string,Json>=array?[]:Object.create(null);
  if(array&&Object.keys(descriptors).length!==value.length+1)planError('PAP_INVALID','Exact dense array required');
  for(const [key,descriptor] of Object.entries(descriptors)){
   if(array&&key==='length')continue;if(!descriptor.enumerable||!('value' in descriptor))planError('PAP_INVALID','Accessors/hidden fields refuse');
   if(array&&(!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=value.length))planError('PAP_INVALID','Non-index array member');validUnicode(key);
   Object.defineProperty(result,key,{value:visit(descriptor.value,depth+1),enumerable:true,writable:true,configurable:true});
  }
  active.delete(value);return result;
 }
 return visit(input,0);
}
