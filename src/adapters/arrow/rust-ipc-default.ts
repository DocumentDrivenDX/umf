// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../../model/errors';
import type {captureArrowIpc,exportArrowIpcCapture,inspectArrowIpcCapture} from './capture';

type NativeCoreErrorGuard=(error:unknown)=>boolean;
type BindingUmfErrorGuard=(error:unknown)=>boolean;

export interface ArrowIpcRustEngine {
 captureArrowIpc(bytes:Uint8Array,options:{id:string}):unknown;
 exportArrowIpcCapture(document:unknown):Uint8Array;
 inspectArrowIpcCapture(document:unknown):unknown;
}

function publicError(error:unknown,isNativeUmfCoreError:NativeCoreErrorGuard,isBindingUmfError:BindingUmfErrorGuard):never {
 const candidate=error as {name?:unknown;code?:unknown;message?:unknown;path?:unknown}|null;
 if(isNativeUmfCoreError(error)&&candidate?.name==='UmfCoreError'&&
  typeof candidate.code==='string'&&candidate.code.startsWith('ARROW_IPC_'))
  throw new UmfError(candidate.code,String(candidate.message??''),typeof candidate.path==='string'?candidate.path:'');
 if(isBindingUmfError(error)&&candidate?.name==='UmfError'&&typeof candidate.code==='string')
  throw new UmfError(candidate.code,String(candidate.message??''),typeof candidate.path==='string'?candidate.path:'');
 throw error;
}

/** Bind the three exact-source Arrow IPC operations to the public V4 error type. */
export function bindArrowIpcRust(
 engine:ArrowIpcRustEngine,
 isNativeUmfCoreError:NativeCoreErrorGuard=()=>false,
 isBindingUmfError:BindingUmfErrorGuard=()=>false,
){
 const call=<T>(operation:()=>T):T=>{
  try{return operation();}
  catch(error){return publicError(error,isNativeUmfCoreError,isBindingUmfError);}
 };
 return Object.freeze({
  captureArrowIpc(bytes:Uint8Array,options:{id:string}):ReturnType<typeof captureArrowIpc>{
   return call(()=>engine.captureArrowIpc(bytes,options)) as ReturnType<typeof captureArrowIpc>;
  },
  exportArrowIpcCapture(document:unknown):ReturnType<typeof exportArrowIpcCapture>{
   return call(()=>engine.exportArrowIpcCapture(document)) as ReturnType<typeof exportArrowIpcCapture>;
  },
  inspectArrowIpcCapture(document:unknown):ReturnType<typeof inspectArrowIpcCapture>{
   return call(()=>engine.inspectArrowIpcCapture(document)) as ReturnType<typeof inspectArrowIpcCapture>;
  },
 });
}
