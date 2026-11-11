// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError,type Document,type Validation} from '../../model/types';
import {copyJson} from '../../model/json';
import {RegistryBase} from '../../registry/base';
import type {KindRegistration} from '../../registry/kind-runtime';
import {actionCallerSemanticValidator} from './native-semantic-owner';
import type {Action,ActionAssessment,ActionIdentity,ActionInspection,ActionExecutorProfile} from './types';

type Engine = {
 inspectActions(source:Document):unknown;
 declareAction(source:Document,module:string,action:Action):unknown;
 editAction(source:Document,identity:ActionIdentity,replacement:Action):unknown;
 assessAction(source:Document,identity:ActionIdentity,profile:ActionExecutorProfile):unknown;
};
type ValidateRegistry=(source:Document,registrations:KindRegistration[])=>Validation;
const CONTROL = new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
function actionRegistryDiagnostics(source:Document,registry:RegistryBase,validateWithRuntime:ValidateRegistry) {
 if (!(registry instanceof RegistryBase)) throw new UmfError('ACTION_STRUCTURE','Explicit action semantic registration is required');
 const registrations=registry.registrations().map(registration=>{
  const semantics=actionCallerSemanticValidator(registration.semantics,registration.manifest);
  return {manifest:registration.manifest,...(registration.kinds===undefined?{}:{kinds:registration.kinds}),...(semantics?{semantics:semantics as NonNullable<KindRegistration['semantics']>}:{})};
 });
 const runtime=registry.kindRuntime;
 return (runtime?runtime.validateDocument(source,registrations):validateWithRuntime(source,registrations)).diagnostics;
}
function translate<T>(isNative:(error:unknown)=>boolean,operation:()=>T):T {
 try{return operation();}catch(error){
  if(!isNative(error))throw error;
  const native=error as {code?:unknown;message?:unknown;path?:unknown};
  if(typeof native.code!=='string'||!native.code.startsWith('ACTION_')&&!['LIMIT','INVALID_DOCUMENT','REFERENCE'].includes(native.code))throw error;
  throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');
 }
}
export function createActionAuthoringRustDefault(createEngine:()=>Engine,isNative:(error:unknown)=>boolean,validateWithRuntime:ValidateRegistry) {
 let engine:Engine|undefined;
 const get=()=>engine??=createEngine();
 const hostValid=(source:Document,registry:RegistryBase):void=>{
  const failure=actionRegistryDiagnostics(source,registry,validateWithRuntime).find(d=>d.severity==='error');
  if(failure)throw new UmfError(failure.code,failure.message,failure.path);
 };
 const mergeHostValidation=(inspection:ActionInspection,registry:RegistryBase):ActionInspection=>{
  const out=copyJson(inspection) as unknown as ActionInspection;
  const existing=new Set(out.validation.diagnostics.map(d=>`${d.code}\0${d.path}\0${d.severity}`));
  for(const diagnostic of actionRegistryDiagnostics(out.source,registry,validateWithRuntime))if(!existing.has(`${diagnostic.code}\0${diagnostic.path}\0${diagnostic.severity}`))out.validation.diagnostics.push(diagnostic);
  out.validation.valid=!out.validation.diagnostics.some(d=>d.severity==='error');
  out.validation.complete=out.validation.valid&&!out.validation.diagnostics.some(d=>d.severity==='warning');
  return out;
 };
 const requireRegistry=(registry:RegistryBase)=>{
  if(!(registry instanceof RegistryBase)||!registry.get('umf.actions','0.1.0')?.semantics) throw new UmfError('ACTION_STRUCTURE','Explicit action semantic registration is required');
 };
 return Object.freeze({
  inspectActions:(source:Document,registry:RegistryBase)=>translate(isNative,()=>{requireRegistry(registry);return mergeHostValidation(get().inspectActions(source) as ActionInspection,registry);}),
  declareAction:(source:Document,module:string,action:Action,registry:RegistryBase)=>translate(isNative,()=>{requireRegistry(registry);hostValid(source,registry);const next=get().declareAction(source,module,action) as Document;hostValid(next,registry);return next;}),
  editAction:(source:Document,identity:ActionIdentity,replacement:Action,registry:RegistryBase)=>translate(isNative,()=>{requireRegistry(registry);hostValid(source,registry);const next=get().editAction(source,identity,replacement) as Document;hostValid(next,registry);return next;}),
  assessAction:(source:Document,identity:ActionIdentity,profile:ActionExecutorProfile,registry:RegistryBase)=>translate(isNative,()=>{requireRegistry(registry);hostValid(source,registry);return get().assessAction(source,identity,profile) as ActionAssessment;}),
 });
}
