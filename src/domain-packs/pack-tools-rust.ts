// SPDX-License-Identifier: MIT OR Apache-2.0
import type {PackToolsRequest,PackToolsResult} from './pack-tools-types';

export interface PackToolsRustEngine {
 generatePackTools(request:PackToolsRequest):unknown;
}

export function createPackToolsRustDefault(engine:PackToolsRustEngine,isNativeUmfCoreError:(error:unknown)=>boolean=()=>false){
 if(!engine||typeof engine.generatePackTools!=='function')throw new TypeError('Rust pack-tools binding is required');
 return Object.freeze({generatePackTools(request:PackToolsRequest):PackToolsResult{
  try{return engine.generatePackTools(request) as PackToolsResult;}
  catch(error){if(isNativeUmfCoreError(error)){const native=error as Error&{code?:string;path?:string};throw Object.assign(new Error(native.message),{name:'UmfPackToolsError',code:native.code,path:native.path});}throw error;}
 }});
}
