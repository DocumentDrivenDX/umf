// SPDX-License-Identifier: MIT OR Apache-2.0
import type {CoreDatasetInput} from '../model/dataset-values';
import type {CoreDatasetCompactValueCheck} from '../model/dataset-values-compact';
import type {Document} from '../model/types';
import {UmfError} from '../model/errors';

type NativeCoreErrorGuard=(error:unknown)=>boolean;

/** The existing tagged-wire operations, adapted to the TypeScript public surface. */
export interface CoreDatasetValuesCompactRustEngine {
 validateCoreDatasetValuesCompact(source:unknown,input:unknown):unknown;
 verifyCoreDatasetValuesCompact(receipt:unknown,current:unknown,expectedInput:unknown):unknown;
}

function invoke<T>(operation:()=>unknown,isNativeUmfCoreError:NativeCoreErrorGuard):T {
 try { return operation() as T; }
 catch(error) {
  if(!isNativeUmfCoreError(error))throw error;
  const code=error!==null&&typeof error==='object'&&'code' in error?String((error as {code:unknown}).code):'';
  const message=error!==null&&typeof error==='object'&&'message' in error?String((error as {message:unknown}).message):String(error);
  const path=error!==null&&typeof error==='object'&&'path' in error?String((error as {path:unknown}).path):'';
  // The tagged transport adds its argument root to these two operation-level
  // refusals. The public TypeScript functions expose neither that prefix nor
  // the binding's UmfCoreError class. Preserve unrelated host/control errors.
  if((code==='CORE_DATASET_SOURCE'&&path==='/source')||(code==='CORE_DATASET_INPUT'&&path==='/input')) {
   throw new UmfError(code,message);
  }
  if(['CORE_DATASET_SOURCE','CORE_DATASET_INPUT','CORE_DATASET_COMPACT_RESULT','CORE_DATASET_COMPACT_RECEIPT','LIMIT','NUMBER','NON_JSON','CYCLE'].includes(code)) {
   throw new UmfError(code,message,path);
  }
  throw error;
 }
}

/** Preserve direct TypeScript signatures while delegating to the selected Rust engine. */
export function bindCoreDatasetValuesCompactRust(engine:CoreDatasetValuesCompactRustEngine,isNativeUmfCoreError:NativeCoreErrorGuard=()=>false) {
 return Object.freeze({
  validateCoreDatasetValuesCompact(source:Document,input:CoreDatasetInput):CoreDatasetCompactValueCheck {
   return invoke(()=>engine.validateCoreDatasetValuesCompact(source,input),isNativeUmfCoreError);
  },
  verifyCoreDatasetValuesCompact(receipt:CoreDatasetCompactValueCheck,current:Document,expectedInput:CoreDatasetInput):CoreDatasetCompactValueCheck {
   return invoke(()=>engine.verifyCoreDatasetValuesCompact(receipt,current,expectedInput),isNativeUmfCoreError);
  },
 });
}
