// SPDX-License-Identifier: MIT OR Apache-2.0
import type {CoreKeyIdentity,CoreKeyTupleReceipt,CoreKeyTupleValue,PreparedCoreKeyTuples} from '../model/key-tuple';
import type {Json} from '../model/types';
import {UmfError} from '../model/errors';

type NativeCoreErrorGuard=(error:unknown)=>boolean;
export interface CoreKeyTupleDefaultEngine {
 readCoreKeyTupleBytes(receipt:CoreKeyTupleReceipt,current:unknown):Uint8Array;
 prepareCoreKeyTuples(source:unknown):{readonly profile:string;readonly source:unknown;encode(identity:CoreKeyIdentity,values:CoreKeyTupleValue[]):unknown;verify(receipt:CoreKeyTupleReceipt):unknown};
}

function rustCall<T>(operation:()=>T,isNativeUmfCoreError:NativeCoreErrorGuard):T {
 try{return operation();}
 catch(error) {
  if(!isNativeUmfCoreError(error)) throw error;
  const native=error as {code?:unknown;message?:unknown;path?:unknown};
  if(typeof native.code==='string') throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');
  throw error;
 }
}

/** Keep the Rust Key tuple implementations behind the public TypeScript error surface. */
export function bindCoreKeyTupleDefault(engine:CoreKeyTupleDefaultEngine,isNativeUmfCoreError:NativeCoreErrorGuard=()=>false) {
 return Object.freeze({
  readCoreKeyTupleBytes(receipt:CoreKeyTupleReceipt,current:unknown):Uint8Array {
   return rustCall(()=>engine.readCoreKeyTupleBytes(receipt,current),isNativeUmfCoreError);
  },
  prepareCoreKeyTuples(source:unknown):PreparedCoreKeyTuples {
   const prepared=rustCall(()=>engine.prepareCoreKeyTuples(source),isNativeUmfCoreError);
   return Object.freeze({
    profile:'umf.core.key-tuples.prepared/1',
    source:prepared.source as Json,
    encode(identity:CoreKeyIdentity,values:CoreKeyTupleValue[]):CoreKeyTupleReceipt {
     return rustCall(()=>prepared.encode(identity,values),isNativeUmfCoreError) as CoreKeyTupleReceipt;
    },
    verify(receipt:CoreKeyTupleReceipt):CoreKeyTupleReceipt {
     return rustCall(()=>prepared.verify(receipt),isNativeUmfCoreError) as CoreKeyTupleReceipt;
    },
   });
  },
 });
}
