// SPDX-License-Identifier: MIT OR Apache-2.0
/** Native-backed Action package registration for the V4 shared runtime. */
import {UmfError} from '../../model/errors';
import {canonicalSchemaJson} from '../../model/canonical-schema-json';
import type {Diagnostic,Document} from '../../model/types';
import type {Registry,SemanticValidator} from '../../registry/registry';
import {actionsPackage} from './package';
import {actionSemanticParts,composeRustOwnedActionSemanticValidator} from './native-semantic-owner';

interface ActionValidationEngine {inspectActions(source:unknown):unknown}
interface ActionInspectionResult {validation:{diagnostics:Diagnostic[]}}
const CONTROL=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);

/** Registers the exact package with Rust meaning and keeps caller validators composed. */
export function createActionRegistryRustDefault(createEngine:()=>ActionValidationEngine,isNativeError:(error:unknown)=>boolean) {
 let engine:ActionValidationEngine|undefined;
 const get=()=>engine??=createEngine();
 const nativeSemantic:SemanticValidator=(_payload,context)=>{
  let result:ActionInspectionResult;
  try {result=get().inspectActions(context.document) as ActionInspectionResult;}
  catch(error) {
   if(!isNativeError(error))throw error;
   const native=error as {code?:unknown;message?:unknown;path?:unknown};
   if(typeof native.code!=='string'||CONTROL.has(native.code))throw error;
   throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');
  }
  if(!result||!result.validation||!Array.isArray(result.validation.diagnostics))throw new UmfError('ACTION_STRUCTURE','Rust Action inspection returned a malformed validation report');
  return result.validation.diagnostics.filter(item=>item.path===context.path||item.path.startsWith(context.path+'/'));
 };
 return Object.freeze({
  registerActions(registry:Registry):Registry {
   const existing=registry.get(actionsPackage.id,actionsPackage.version);
   if(existing&&canonicalSchemaJson(existing.manifest)!==canonicalSchemaJson(actionsPackage))throw new UmfError('ACTION_STRUCTURE','Existing Action registration differs from the distributed package');
   const owner={id:actionsPackage.id,version:actionsPackage.version};
   const callers=actionSemanticParts(existing?.semantics,owner).callers;
   return registry.register(actionsPackage,composeRustOwnedActionSemanticValidator(owner,nativeSemantic,callers),{replaceActions:true});
  },
 });
}
