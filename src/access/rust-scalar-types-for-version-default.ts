// SPDX-License-Identifier: MIT OR Apache-2.0
export interface ScalarTypesForVersionRustEngine {
 scalarTypesForVersion(version:string):readonly string[];
}

/** Preserve the predecessor's shared current value and fresh empty results around the Rust wire result. */
export function bindScalarTypesForVersionRust(engine:ScalarTypesForVersionRustEngine,currentVersion:string,scalarTypes:readonly string[]){
 return function scalarTypesForVersion(version:string):readonly string[]{
  if(typeof version!=='string')return [];
  const result=engine.scalarTypesForVersion(version);
  if(!Array.isArray(result))throw new Error('Rust scalarTypesForVersion returned a non-array result');
  if(version===currentVersion){
   if(result.length!==scalarTypes.length||result.some((value,index)=>value!==scalarTypes[index]))
    throw new Error('Rust scalarTypesForVersion diverged from the current scalar vocabulary');
   return scalarTypes;
  }
  if(result.length!==0)throw new Error('Rust scalarTypesForVersion returned values for an unsupported version');
  return [];
 };
}
