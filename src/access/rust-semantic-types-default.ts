// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../model/errors';
import type {CoreSemanticTypeIdentity,CoreSemanticTypeValueResult} from '../model/semantic-types';
import type {Document,Json,JsonObject} from '../model/types';
import type {SemanticTypeReference,SemanticTypeCheck,SemanticTypeValueResult} from '../extensions/semantic-types';

type SemanticValidator = (value:Json,definition:JsonObject)=>SemanticTypeCheck;
type RegistryEngine = {
 register(reference:unknown,definition:unknown,validator?:SemanticValidator):unknown;
 lookup(reference:unknown):JsonObject|undefined;
 check(reference:unknown,value:unknown):SemanticTypeValueResult;
 validateCoreSemanticTypeValue(resources:unknown,source:unknown,identity:unknown,value:unknown):unknown;
};
export type SemanticTypeRegistryEngineFactory=()=>unknown;

function defaultFailure(error:unknown):never {
 if(error&&typeof error==='object'&&(error as {name?:unknown}).name==='UmfCoreError'&&typeof (error as {code?:unknown}).code==='string') {
  const failure=error as {code:string;message?:string;path?:string};
  throw new UmfError(failure.code,failure.message??failure.code,failure.path??'');
 }
 throw error;
}

/** Bind the Rust value engine while retaining the TypeScript registry's public JS class shape. */
export function bindSemanticTypesRust(createEngine:SemanticTypeRegistryEngineFactory,resources:unknown) {
 const engines=new WeakMap<SemanticTypeRegistry,RegistryEngine>();
 class SemanticTypeRegistry {
  constructor(){
   try {engines.set(this,createEngine() as RegistryEngine);} catch(error) {defaultFailure(error);}
  }
  register(reference:SemanticTypeReference,definition:JsonObject,validator?:SemanticValidator):this {
   try {engines.get(this)!.register(reference,definition,validator);return this;} catch(error) {defaultFailure(error);}
  }
  lookup(reference:SemanticTypeReference):JsonObject|undefined {
   try {return engines.get(this)!.lookup(reference);} catch(error) {defaultFailure(error);}
  }
  check(reference:SemanticTypeReference,value:Json):SemanticTypeValueResult {
   try {return engines.get(this)!.check(reference,value);} catch(error) {defaultFailure(error);}
  }
  validateCoreSemanticTypeValue(source:Document,identity:CoreSemanticTypeIdentity,value:Json):CoreSemanticTypeValueResult {
   try {return engines.get(this)!.validateCoreSemanticTypeValue(resources,source,identity,value) as CoreSemanticTypeValueResult;} catch(error) {defaultFailure(error);}
  }
 }
 const validateSemanticTypeValue=(reference:SemanticTypeReference,value:Json,registry:SemanticTypeRegistry):SemanticTypeValueResult=>registry.check(reference,value);
 const validateCoreSemanticTypeValue=(source:Document,identity:CoreSemanticTypeIdentity,value:Json,registry:SemanticTypeRegistry):CoreSemanticTypeValueResult=>registry.validateCoreSemanticTypeValue(source,identity,value);
 return {SemanticTypeRegistry,validateSemanticTypeValue,validateCoreSemanticTypeValue};
}
