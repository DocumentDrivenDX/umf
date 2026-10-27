// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../model/errors';
import type {CoreSemanticTypeDeclaration,CoreSemanticTypeIdentity,CoreSemanticTypeInspection} from '../model/semantic-types';
import type {CoreSemanticTypeReference,Document} from '../model/types';

type NativeCoreErrorGuard=(error:unknown)=>boolean;
export interface CoreSemanticTypesRustEngine {
 inspectCoreSemanticTypes(source:unknown,identity:{module:string;element:string}):unknown;
 getCoreSemanticTypes(source:unknown,identity:{module:string;element:string}):unknown[]|undefined;
 declareCoreSemanticTypes(source:unknown,identity:{module:string;element:string},types?:unknown[]|null):unknown;
 verifyCoreSemanticTypeDeclaration(receipt:unknown,current:unknown):unknown;
}

function invoke<T>(operation:()=>T,isNativeUmfCoreError:NativeCoreErrorGuard):T {
 try{return operation();}
 catch(error){
  if(!isNativeUmfCoreError(error))throw error;
  const candidate=error as {name?:unknown;code?:unknown;message?:unknown;path?:unknown};
  if(candidate.name==='UmfCoreError'&&typeof candidate.code==='string')
   throw new UmfError(candidate.code,String(candidate.message??''),typeof candidate.path==='string'?candidate.path:'');
  throw error;
 }
}

/** Restore the reference public error class around the shared Rust operations. */
export function bindCoreSemanticTypesRust(engine:CoreSemanticTypesRustEngine,isNativeUmfCoreError:NativeCoreErrorGuard=()=>false){
 return Object.freeze({
  inspectCoreSemanticTypes(source:Document,identity:CoreSemanticTypeIdentity):CoreSemanticTypeInspection {
   return invoke(()=>engine.inspectCoreSemanticTypes(source,identity),isNativeUmfCoreError) as CoreSemanticTypeInspection;
  },
  getCoreSemanticTypes(source:Document,identity:CoreSemanticTypeIdentity):CoreSemanticTypeReference[]|undefined {
   return invoke(()=>engine.getCoreSemanticTypes(source,identity),isNativeUmfCoreError) as CoreSemanticTypeReference[]|undefined;
  },
  declareCoreSemanticTypes(source:Document,identity:CoreSemanticTypeIdentity,types:CoreSemanticTypeReference[]|null):CoreSemanticTypeDeclaration {
   return invoke(()=>engine.declareCoreSemanticTypes(source,identity,types),isNativeUmfCoreError) as CoreSemanticTypeDeclaration;
  },
  verifyCoreSemanticTypeDeclaration(receipt:CoreSemanticTypeDeclaration,current:Document):CoreSemanticTypeDeclaration {
   return invoke(()=>engine.verifyCoreSemanticTypeDeclaration(receipt,current),isNativeUmfCoreError) as CoreSemanticTypeDeclaration;
  },
 });
}
