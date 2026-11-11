// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../model/errors';
import type {TableDeploymentBundle,TableDeploymentRequest,TableDeploymentResult} from './types';

export interface TableDeploymentNativeEngine {
 compileTableDeployment(request:unknown):unknown;
 verifyTableDeployment(bundle:unknown):unknown;
}
const CONTROL_CODES=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);

/** Preserve the public compiler API while Rust owns compilation and verification. */
export function createTableDeploymentRustDefault(
 createEngine:()=>TableDeploymentNativeEngine,
 isNativeError:(error:unknown)=>boolean,
){
 let engine:TableDeploymentNativeEngine|undefined;
 const getEngine=()=>engine??=createEngine();
 const call=<T>(operation:(engine:TableDeploymentNativeEngine)=>unknown):T=>{
  try{return operation(getEngine()) as T;}
  catch(error){
   if(!isNativeError(error))throw error;
   const native=error as {code?:unknown;message?:unknown;path?:unknown;pointer?:unknown};
   if(typeof native.code!=='string'||CONTROL_CODES.has(native.code))throw error;
   throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:typeof native.pointer==='string'?native.pointer:'');
  }
 };
 return Object.freeze({
  compileTableDeployment(request:TableDeploymentRequest):TableDeploymentResult{return call(engine=>engine.compileTableDeployment(request));},
  verifyTableDeployment(bundle:unknown):TableDeploymentBundle{return call(engine=>engine.verifyTableDeployment(bundle));},
 });
}
