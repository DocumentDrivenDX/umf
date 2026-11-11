// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../../model/types';
import type {TableLifecycleInspection} from './types';
const CONTROL_CODES=new Set(['LIMIT','CAPACITY','RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);

type TableLifecycleNativeEngine={inspectTableLifecycle(source:unknown):unknown};

/** Route public lifecycle inspection through the Rust codegen engine. */
export function createTableLifecycleRustDefault(
 createEngine:()=>TableLifecycleNativeEngine,
 isNativeError:(error:unknown)=>boolean,
){
 let engine:TableLifecycleNativeEngine|undefined;
 const getEngine=()=>engine??=createEngine();
 return Object.freeze({
  inspectTableLifecycle(source:unknown):TableLifecycleInspection{
   try{return getEngine().inspectTableLifecycle(source) as TableLifecycleInspection;}
   catch(error){
    if(!isNativeError(error))throw error;
    const native=error as {code?:unknown;message?:unknown;path?:unknown;pointer?:unknown};
    if(typeof native.code!=='string'||CONTROL_CODES.has(native.code))throw error;
    throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:typeof native.pointer==='string'?native.pointer:'');
   }
  },
 });
}
