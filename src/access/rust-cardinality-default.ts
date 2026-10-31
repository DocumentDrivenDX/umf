// SPDX-License-Identifier: MIT OR Apache-2.0
import type {
 CoreCardinalityDeclaration,
 CoreCardinalityIdentity,
 CoreCardinalityInspection,
 CoreCardinalityRequest,
} from '../model/cardinality';
import type {Document} from '../model/types';
import {UmfError} from '../model/errors';

/** The Rust-owned host-input engine surface adapted to the TypeScript public signatures. */
export interface CoreCardinalityRustEngine {
 inspectCoreCardinality(source:Document,identity:CoreCardinalityIdentity):unknown;
 declareCoreCardinality(source:Document,identity:CoreCardinalityIdentity,request:CoreCardinalityRequest):unknown;
 verifyCoreCardinalityDeclaration(receipt:CoreCardinalityDeclaration,current:Document):unknown;
}

function rustCall<T>(operation:()=>T,isHostJsonResponseError:(error:unknown)=>boolean):T {
 try{return operation();}
 catch(error) {
  const value=error as {name?:unknown;code?:unknown;message?:unknown;path?:unknown};
  if(isHostJsonResponseError(error)&&typeof value?.code==='string')
   throw new UmfError(value.code,String(value.message??''),typeof value.path==='string'?value.path:'');
  throw error;
 }
}

/** Keep the public identity object and function signatures identical to the reference API. */
export function bindCoreCardinalityRust(engine:CoreCardinalityRustEngine,isHostJsonResponseError:(error:unknown)=>boolean=()=>false) {
 return Object.freeze({
  inspectCoreCardinality(source:Document,identity:CoreCardinalityIdentity) {
   return rustCall(()=>engine.inspectCoreCardinality(source,identity),isHostJsonResponseError) as CoreCardinalityInspection;
  },
  declareCoreCardinality(source:Document,identity:CoreCardinalityIdentity,request:CoreCardinalityRequest) {
   return rustCall(()=>engine.declareCoreCardinality(source,identity,request),isHostJsonResponseError) as CoreCardinalityDeclaration;
  },
  verifyCoreCardinalityDeclaration(receipt:CoreCardinalityDeclaration,current:Document) {
   return rustCall(()=>engine.verifyCoreCardinalityDeclaration(receipt,current),isHostJsonResponseError) as CoreCardinalityDeclaration;
  },
 });
}
