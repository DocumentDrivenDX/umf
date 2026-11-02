// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from './errors';
import type {Document,Json} from './types';
import type {Registry} from '../registry/registry';

const CONTROL=new Set(['LIMIT','CAPACITY','RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
/** Rust validates both sides of the host updater; the host only invokes it. */
export function createEditExtensionRustDefault(engine:unknown,isNativeError:(error:unknown)=>boolean){
  const method=engine!==null&&typeof engine==='object'?Reflect.get(engine,'editExtension'):undefined;
  if(typeof method!=='function')throw new TypeError('A Rust Core Model extension editor is required');
  return Object.freeze({editExtension(input:Document,registry:Registry,module:string,element:string,extension:string,update:(payload:Json)=>Json):Document{
    const callbackFailure:{thrown:boolean;value:unknown}={thrown:false,value:undefined};
    const wrapped=(payload:Json):Json=>{try{return update(payload);}catch(error){callbackFailure.thrown=true;callbackFailure.value=error;throw error;}};
    try{return Reflect.apply(method,engine,[input,module,element,extension,wrapped,registry.registrations()]) as Document;}
    catch(error){
      if(callbackFailure.thrown&&error===callbackFailure.value)throw error;
      if(!isNativeError(error))throw error;
      const value=error as {code?:unknown;message?:unknown;path?:unknown};
      if(typeof value.code!=='string'||CONTROL.has(value.code))throw error;
      throw new UmfError(value.code,String(value.message??''),typeof value.path==='string'?value.path:'');
    }
  }});
}
