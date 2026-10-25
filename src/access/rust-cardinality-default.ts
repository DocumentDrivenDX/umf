// SPDX-License-Identifier: MIT OR Apache-2.0
import type {
 CoreCardinalityDeclaration,
 CoreCardinalityIdentity,
 CoreCardinalityInspection,
 CoreCardinalityRequest,
} from '../model/cardinality';
import type {Document} from '../model/types';
import {UmfError} from '../model/errors';
import {copyJson} from '../model/json';

/** The existing tagged-wire engine surface, adapted to the TypeScript public signatures. */
export interface CoreCardinalityRustEngine {
 inspectCoreCardinalityIdentity(source:Document,identity:unknown):unknown;
 declareCoreCardinalityIdentity(source:Document,identity:unknown,request:CoreCardinalityRequest):unknown;
 verifyCoreCardinalityDeclaration(receipt:CoreCardinalityDeclaration,current:Document):unknown;
 admitCoreCardinalityRequest(request:unknown):unknown;
 prepareCoreCardinalityVerification(receipt:unknown):unknown;
 finishCoreCardinalityVerification(handle:unknown,current:Document):unknown;
}

function rustCall<T>(operation:()=>T):T {
 try{return operation();}
 catch(error) {
  const value=error as {name?:unknown;code?:unknown;message?:unknown;path?:unknown};
  if(value?.name==='UmfCoreError'&&typeof value.code==='string'&&value.code.startsWith('CORE_CARDINALITY_'))
   throw new UmfError(value.code,String(value.message??''),typeof value.path==='string'?value.path:'');
  throw error;
 }
}

/** Keep the public identity object and function signatures identical to the reference API. */
export function bindCoreCardinalityRust(engine:CoreCardinalityRustEngine) {
 return Object.freeze({
  inspectCoreCardinality(source:Document,identity:CoreCardinalityIdentity) {
   const copiedSource=copyJson(source) as unknown as Document;
   const copiedIdentity=copyJson(identity) as unknown as CoreCardinalityIdentity;
   return rustCall(()=>engine.inspectCoreCardinalityIdentity(copiedSource,copiedIdentity)) as CoreCardinalityInspection;
  },
  declareCoreCardinality(source:Document,identity:CoreCardinalityIdentity,request:CoreCardinalityRequest) {
   // Keep the predecessor's exact host-admission order until Rust-driven host
   // admission can report the same paths and refusal classes.
   const copiedRequest=copyJson(request) as unknown as CoreCardinalityRequest;
   const admittedRequest=rustCall(()=>engine.admitCoreCardinalityRequest(copiedRequest));
   const copiedSource=copyJson(source) as unknown as Document;
   const copiedIdentity=copyJson(identity) as unknown as CoreCardinalityIdentity;
   return rustCall(()=>engine.declareCoreCardinalityIdentity(copiedSource,copiedIdentity,admittedRequest as CoreCardinalityRequest)) as CoreCardinalityDeclaration;
  },
  verifyCoreCardinalityDeclaration(receipt:CoreCardinalityDeclaration,current:Document) {
   const copiedReceipt=copyJson(receipt) as unknown as CoreCardinalityDeclaration;
   const prepared=rustCall(()=>engine.prepareCoreCardinalityVerification(copiedReceipt));
   const copiedCurrent=copyJson(current) as unknown as Document;
   return rustCall(()=>engine.finishCoreCardinalityVerification(prepared,copiedCurrent)) as CoreCardinalityDeclaration;
  },
 });
}
