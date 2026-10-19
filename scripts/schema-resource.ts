// SPDX-License-Identifier: MIT OR Apache-2.0
/** Copy a generated schema fragment without changing its resource-relative references. */
export function copySchemaFragment<T>(resourceId:string,fragment:T):T {
 const copy=structuredClone(fragment);
 function visit(value:unknown):void {
  if(!value||typeof value!=='object')return;
  if(Array.isArray(value)){value.forEach(visit);return;}
  const node=value as Record<string,unknown>;
  if(typeof node.$ref==='string'&&node.$ref.startsWith('#'))node.$ref=resourceId+node.$ref;
  Object.values(node).forEach(visit);
 }
 visit(copy);return copy;
}
