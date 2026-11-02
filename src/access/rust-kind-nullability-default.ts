// SPDX-License-Identifier: MIT OR Apache-2.0
import type {CoreKindDeclaration, CoreKindIdentity, CoreKindInspection} from '../model/field-kind';
import type {CoreNullabilityDeclaration, CoreNullabilityIdentity, CoreNullabilityInspection} from '../model/nullability';
import type {Document, ElementKind, Nullability} from '../model/types';
import {UmfError} from '../model/errors';

/** Rust-owned staged host-input operations adapted to the public V4 signatures. */
export interface CoreKindNullabilityRustEngine {
 inspectCoreElementKind(source:unknown,identity:unknown):unknown;
 declareCoreElementKind(source:unknown,identity:unknown,kind:unknown):unknown;
 verifyCoreKindDeclaration(receipt:unknown,current:unknown):unknown;
 inspectCoreNullability(source:unknown,identity:unknown):unknown;
 declareCoreNullability(source:unknown,identity:unknown,nullability:unknown):unknown;
 verifyCoreNullabilityDeclaration(receipt:unknown,current:unknown):unknown;
}

function rustCall<T>(operation:()=>T,isHostJsonResponseError:(error:unknown)=>boolean):T {
 try{return operation();}
 catch(error) {
  const value=error as {code?:unknown;message?:unknown;path?:unknown};
  if(isHostJsonResponseError(error)&&typeof value?.code==='string'&&value.code!=='RESOURCE_LIMIT')
   throw new UmfError(value.code,String(value.message??''),typeof value.path==='string'?value.path:'');
  throw error;
 }
}

/** Preserve public operation types and the staged host engine's admission order. */
export function bindCoreKindNullabilityRust(
 engine:CoreKindNullabilityRustEngine,
 isHostJsonResponseError:(error:unknown)=>boolean=()=>false,
) {
 return Object.freeze({
  inspectCoreElementKind(source:Document,identity:CoreKindIdentity) {
   return rustCall(()=>engine.inspectCoreElementKind(source,identity),isHostJsonResponseError) as CoreKindInspection;
  },
  declareCoreElementKind(source:Document,identity:CoreKindIdentity,kind:ElementKind) {
   return rustCall(()=>engine.declareCoreElementKind(source,identity,kind),isHostJsonResponseError) as CoreKindDeclaration;
  },
  verifyCoreKindDeclaration(receipt:CoreKindDeclaration,current:Document) {
   return rustCall(()=>engine.verifyCoreKindDeclaration(receipt,current),isHostJsonResponseError) as CoreKindDeclaration;
  },
  inspectCoreNullability(source:Document,identity:CoreNullabilityIdentity) {
   return rustCall(()=>engine.inspectCoreNullability(source,identity),isHostJsonResponseError) as CoreNullabilityInspection;
  },
  declareCoreNullability(source:Document,identity:CoreNullabilityIdentity,nullability:Nullability) {
   return rustCall(()=>engine.declareCoreNullability(source,identity,nullability),isHostJsonResponseError) as CoreNullabilityDeclaration;
  },
  verifyCoreNullabilityDeclaration(receipt:CoreNullabilityDeclaration,current:Document) {
   return rustCall(()=>engine.verifyCoreNullabilityDeclaration(receipt,current),isHostJsonResponseError) as CoreNullabilityDeclaration;
  },
 });
}
