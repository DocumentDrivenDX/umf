// SPDX-License-Identifier: MIT OR Apache-2.0
/** Typed presentation only. The explicitly initialized shared Rust engine owns semantics. */
import trustedActionsPackage from '../../../spec/extensions/actions/package.json';
import generatedPackage from '../../../spec/extensions/saga/package.json';
import type {Document, Diagnostic, Validation, ExtensionPackage} from '../../model/types';
import {UmfError} from '../../model/types';
import {Registry, type Registration} from '../../registry/registry';
import {canonicalSchemaJson} from '../../model/schema-literals';
import type {ActionParameter} from './types';
export const sagaPackage = generatedPackage as unknown as ExtensionPackage;
export interface SagaIdentity {module:string; saga:string}
export interface SagaActionReference {module:string; action:string}
export type SagaSource = {input:string} | {step:string; output:string};
export interface SagaMapping {parameter:string; from:SagaSource}
export type SagaCompensation = {kind:'action';action:SagaActionReference;binding:string;inputs:SagaMapping[]} | {kind:'unnecessary';profile:{id:string;version:string}} | {kind:'irreversible';reason:string} | {kind:string;[key:string]:unknown};
export interface SagaStep {id:string;action:SagaActionReference;binding:string;inputs:SagaMapping[];compensation:SagaCompensation}
export interface SagaDefinition {id:string;name:string;description:string;profile:{id:string;version:string};parameters:ActionParameter[];outputs:ActionParameter[];outputBindings:SagaMapping[];steps:SagaStep[]}
export interface SagaObligation {id:string;path:string;kind:'model'|'binding'|'action'|'coordination'|'recovery'|'unknown';status:'checked'|'unchecked'}
export interface SagaInspection {source:Document;validation:Validation;entries:{module:string;path:string;definition:SagaDefinition;obligations:SagaObligation[]}[]}
export type SagaClaimStatus = 'supported'|'unsupported'|'unknown';
export interface SagaClaim {obligation:string;status:SagaClaimStatus;evidence:string[]}
export interface SagaCapabilities {id:string;version:string;coreVersion:'0.10.0';sagaVersion:'0.1.0';coordination:SagaClaimStatus;claims:SagaClaim[];source:Document;identity:SagaIdentity}
export interface SagaAssessment {valid:boolean;complete:boolean;declarationCompatible:boolean;executionVerified:false;coordination:SagaClaimStatus;outcomes:SagaClaim[];diagnostics:Diagnostic[]}
/** Implemented by createCodegenEngine with an explicitly installed sagaPackage. */
export interface SagaRuntime {
 sagaRegistryProfile():{actionsPackage:unknown;sagaPackage:unknown};
 inspectSagas(source:unknown):unknown;
 declareSaga(source:unknown,module:string,definition:unknown):unknown;
 editSaga(source:unknown,identity:unknown,replacement:unknown):unknown;
 assessSaga(source:unknown,identity:unknown,capabilities:unknown):unknown;
}
interface BoundRuntime {engine:SagaRuntime; registrations:Registration[]}
const runtimes = new WeakMap<Registry,BoundRuntime>();
function registryEntries(registry:Registry):Registration[] {
 return registry.registrations().map(r=>registry.get(r.manifest.id,r.manifest.version)!);
}
function runtime(registry:Registry):SagaRuntime {
 const bound=runtimes.get(registry);
 if(!bound)throw new UmfError('SAGA_RUNTIME_REQUIRED','Initialize the shared native/WASM engine and call registerSagas on a fresh registry');
 const current=registryEntries(registry);
 if(current.length!==bound.registrations.length||current.some((entry,i)=>entry!==bound.registrations[i]))throw new UmfError('SAGA_REGISTRY_UNSUPPORTED','Saga runtime requires its original immutable registration profile');
 return bound.engine;
}
/** Explicit opt-in to the engine-owned action/saga interpretation profile. */
export function registerSagas(registry:Registry,engine:SagaRuntime):Registry {
 if(!registry.kindRuntime)throw new UmfError('SAGA_RUNTIME_REQUIRED','Construct Registry with the shared native/WASM core runtime before registering sagas');
 if(registryEntries(registry).length)throw new UmfError('SAGA_REGISTRY_UNSUPPORTED','Use a fresh registry for the shared saga interpretation profile; arbitrary semantic callbacks are unsupported');
 const profile=engine.sagaRegistryProfile();
 if(canonicalSchemaJson(profile.sagaPackage)!==canonicalSchemaJson(sagaPackage))throw new UmfError('SAGA_REGISTRY_UNSUPPORTED','Engine saga package differs from the distributed exact package');
 const actions=profile.actionsPackage as ExtensionPackage;
 if(canonicalSchemaJson(actions)!==canonicalSchemaJson(trustedActionsPackage))throw new UmfError('SAGA_REGISTRY_UNSUPPORTED','Engine action profile is unsupported');
 for(const manifest of [actions,sagaPackage])registry.register(manifest,(_payload,context)=>{
  const result=engine.inspectSagas(context.document) as SagaInspection;
  return result.validation.diagnostics.filter(d=>d.path===context.path||d.path.startsWith(context.path+'/'));
 });
 runtimes.set(registry,{engine,registrations:registryEntries(registry)});
 return registry;
}
export function inspectSagas(source:Document,registry:Registry):SagaInspection {return runtime(registry).inspectSagas(source) as SagaInspection;}
export function declareSaga(source:Document,module:string,definition:SagaDefinition,registry:Registry):Document {return runtime(registry).declareSaga(source,module,definition) as Document;}
export function editSaga(source:Document,identity:SagaIdentity,replacement:SagaDefinition,registry:Registry):Document {return runtime(registry).editSaga(source,identity,replacement) as Document;}
export function assessSaga(source:Document,identity:SagaIdentity,capabilities:SagaCapabilities,registry:Registry):SagaAssessment {return runtime(registry).assessSaga(source,identity,capabilities) as SagaAssessment;}
