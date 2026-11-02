// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic,ExtensionPackage,Json,Scope,Validation} from '../../model/types';
import type {Registry} from '../../registry/registry';
import {UmfError} from '../../model/errors';
import bindingManifest from '../../../spec/extensions/binding/package.json';
import stableManifest from '../../../spec/extensions/binding-stable/package.json';
import type {BindingIndexProjection,BindingMigrationResult,BindingPayload,BindingRollbackResult} from './index';
import type {Bit128DatasetRecord} from './model-dataset';

type Operation=(input?:Record<string,unknown>)=>unknown;
export type BindingRustEngine={['binding-public']:Record<'inspectBinding'|'getBinding'|'readBindingDocument'|'writeBindingDocument'|'projectBindingIndexes'|'migrateBindingRelationships'|'rollbackBindingRelationships'|'validateBindingSemantics'|'validateBit128Dataset',Operation>};
const CONTROL=new Set(['RESOURCE_LIMIT','LIMIT','CAPACITY','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
export function createBindingRustDefault(engine:BindingRustEngine,isNativeError:(error:unknown)=>boolean,createRegistry:()=>Registry){
 const call=<T>(operation:keyof BindingRustEngine['binding-public'],fields:Record<string,unknown>):T=>{
  try{return engine['binding-public'][operation](fields) as T;}
  catch(error){if(!isNativeError(error))throw error;const e=error as {code?:unknown;message?:unknown;path?:unknown};if(typeof e.code!=='string'||CONTROL.has(e.code))throw error;throw new UmfError(e.code,String(e.message??''),typeof e.path==='string'?e.path:'');}
 };
 const semantic=(payload:Json,context:{document:Document;path:string;scope:Scope}):Diagnostic[]=>call('validateBindingSemantics',{payload,document:context.document,path:context.path,scope:context.scope}) as Diagnostic[];
 const registry=()=>createRegistry().register(bindingManifest as unknown as ExtensionPackage,semantic).register(stableManifest as unknown as ExtensionPackage,semantic);
 return Object.freeze({
  bindingRegistry:registry,
  inspectBinding(binding:Document,logical:Document):Validation{return call('inspectBinding',{binding,logical}) as Validation;},
  getBinding(binding:Document,logical:Document):BindingPayload{return call('getBinding',{binding,logical}) as BindingPayload;},
  readBindingDocument(source:string,logical:Document,format:'json'|'yaml'='yaml'):Document{return call('readBindingDocument',{source,logical,format}) as Document;},
  writeBindingDocument(binding:Document,logical:Document,format:'json'|'yaml'='yaml'):string{return call('writeBindingDocument',{binding,logical,format}) as string;},
  projectBindingIndexes(binding:Document,logical:Document,lossPolicy:'strict'|'report'):BindingIndexProjection{return call('projectBindingIndexes',{binding,logical,lossPolicy}) as BindingIndexProjection;},
  migrateBindingRelationships(binding:Document,logical:Document):BindingMigrationResult{return call('migrateBindingRelationships',{binding,logical}) as BindingMigrationResult;},
  rollbackBindingRelationships(current:Document,logical:Document,receipt:BindingMigrationResult['receipt']):BindingRollbackResult{return call('rollbackBindingRelationships',{current,logical,receipt}) as BindingRollbackResult;},
  validateBit128Dataset(binding:Document,source:Document,input:Bit128DatasetRecord[]):Bit128DatasetRecord[]{return call('validateBit128Dataset',{binding,source,input}) as Bit128DatasetRecord[];},
 });
}
