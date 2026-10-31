// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../../../model/errors';
import type {inspectProtectionFunction,evaluateProtectionValue} from './functions';
import type {inspectProtectionQueryProperties} from './queries';

export interface ProtectionNativeEngine {
 inspectProtectionFunction(policy:unknown,catalog:unknown,closure:unknown,selection:unknown):unknown;
 evaluateProtectionValue(policy:unknown,catalog:unknown,closure:unknown,selection:unknown):unknown;
 inspectProtectionQueryProperties(policy:unknown,catalog:unknown,closure:unknown,use:unknown):unknown;
}

function freezeReport(value:unknown):unknown{
 if(value!==null&&typeof value==='object'&&!Object.isFrozen(value)){
  for(const child of Object.values(value))freezeReport(child);
  Object.freeze(value);
 }
 return value;
}

/** Present Rust's protection reports through the existing public API. */
export function createProtectionRustDefault(engine:ProtectionNativeEngine,isNativeError:(error:unknown)=>boolean){
 const call=<T>(operation:()=>unknown):T=>{
  try{return freezeReport(operation()) as T;}
  catch(error){
   if(!isNativeError(error))throw error;
   const native=error as {code?:unknown;message?:unknown;path?:unknown};
   if(typeof native.code==='string'&&(native.code.startsWith('PROTECTION_')||native.code==='REQUEST'))
    throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');
   throw error;
  }
 };
 return Object.freeze({
  inspectProtectionFunction(...args:Parameters<typeof inspectProtectionFunction>):ReturnType<typeof inspectProtectionFunction>{return call(()=>engine.inspectProtectionFunction(...args));},
  evaluateProtectionValue(...args:Parameters<typeof evaluateProtectionValue>):ReturnType<typeof evaluateProtectionValue>{return call(()=>engine.evaluateProtectionValue(...args));},
  inspectProtectionQueryProperties(...args:Parameters<typeof inspectProtectionQueryProperties>):ReturnType<typeof inspectProtectionQueryProperties>{return call(()=>engine.inspectProtectionQueryProperties(...args));},
 });
}
