// SPDX-License-Identifier: MIT OR Apache-2.0
/** JSON equality never calls prototypes, getters, valueOf or toJSON. Admission
 * has already rejected accessors; hostile property names remain ordinary data. */
export function canonicalJson(value:unknown):string {
 if(Array.isArray(value))return 'a['+value.map(canonicalJson).join(',')+']';
 if(value!==null&&typeof value==='object')return 'o{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonicalJson((value as Record<string,unknown>)[key])).join(',')+'}';
 return JSON.stringify(value);
}
