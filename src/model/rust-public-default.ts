// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from './errors';
import type {Registry} from '../registry/registry';
import type {ExtensionKindRuntime} from '../registry/kind-runtime';
import type {Document} from './types';
import type {CoreElementQuery,CoreElementSelection} from './selection-types';
import type {CoreRelationshipQuery,CoreRelationshipSelection} from './relationship-selection-types';
import type {CoreEvolutionPolicy} from './evolution-types';

import type {CoreDatasetInput,CoreDatasetValueCheck} from './dataset-values-types';
import type {CoreKeyIdentity,CoreKeyTupleReceipt,CoreKeyTupleValue} from './key-tuple';
type DatasetMethods={
 validateCoreDatasetValues(source:Document,input:CoreDatasetInput):CoreDatasetValueCheck;
 verifyCoreDatasetValues(receipt:CoreDatasetValueCheck,current:Document,expectedInput:CoreDatasetInput):CoreDatasetValueCheck;
};
type EvolutionMethods={
 inspectCoreEvolution(before:Document,after:Document,policy:CoreEvolutionPolicy):unknown;
 verifyCoreEvolution(receipt:unknown,before:Document,after:Document,policy:CoreEvolutionPolicy):unknown;
};
type KeyMethods={
 encodeCoreKeyTuple(input:unknown,identity:CoreKeyIdentity,values:CoreKeyTupleValue[],options?:{profile:CoreKeyTupleReceipt['profile']}):CoreKeyTupleReceipt;
 verifyCoreKeyTuple(input:CoreKeyTupleReceipt,current:unknown):CoreKeyTupleReceipt;
};
type Direct=DatasetMethods & EvolutionMethods;
type EngineMethods<T>={[K in keyof T]:T[K] extends (...args:infer A)=>unknown ? (...args:A)=>unknown : never};
type Registrations=Parameters<ExtensionKindRuntime['listKinds']>[0];
export interface CoreModelPublicEngine extends EngineMethods<Direct> {
 prepareCoreInspection(source:unknown):unknown;
 coreInspectionView(source:unknown,identity:unknown,view:string):unknown;
 selectCoreElements(source:unknown,query:unknown,registry?:Registrations):unknown;
 selectCoreRelationships(source:unknown,query:unknown,registry?:Registrations):unknown;
}
const CONTROL=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
/** Public signatures over the existing Rust model, dataset, evolution and tuple engines. */
export function createCoreModelPublicRustDefault(model:CoreModelPublicEngine,tuples:EngineMethods<KeyMethods>,isNativeError:(error:unknown)=>boolean,createRegistry:()=>Registry):Direct & KeyMethods & {
 selectCoreElements(source:Document,query:CoreElementQuery,registry?:Registry):CoreElementSelection;
 selectCoreRelationships(source:Document,query:CoreRelationshipQuery,registry?:Registry):CoreRelationshipSelection;
}{
 const call=<T>(work:()=>unknown):T=>{try{return work() as T;}catch(error){if(!isNativeError(error))throw error;const e=error as {code?:unknown;message?:unknown;path?:unknown};if(typeof e.code!=='string'||CONTROL.has(e.code))throw error;throw new UmfError(e.code,String(e.message??''),typeof e.path==='string'?e.path:'');}};
 const direct={} as Direct & KeyMethods;
 const names=['validateCoreDatasetValues','verifyCoreDatasetValues','inspectCoreEvolution','verifyCoreEvolution'] as const;
 for(const name of names)Object.defineProperty(direct,name,{enumerable:true,value:(...args:unknown[])=>call(()=>Reflect.apply(model[name],model,args))});
 for(const name of ['encodeCoreKeyTuple','verifyCoreKeyTuple'] as const)Object.defineProperty(direct,name,{enumerable:true,value:(...args:unknown[])=>call(()=>Reflect.apply(tuples[name],tuples,args))});
 return Object.freeze(Object.assign(direct,{
  selectCoreElements(source:Document,query:CoreElementQuery,registry:Registry=createRegistry()):CoreElementSelection{return call(()=>model.selectCoreElements(source,query,registry.registrations()));},
  selectCoreRelationships(source:Document,query:CoreRelationshipQuery,registry:Registry=createRegistry()):CoreRelationshipSelection{return call(()=>model.selectCoreRelationships(source,query,registry.registrations()));},
 }));
}
