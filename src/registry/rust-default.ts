// SPDX-License-Identifier: MIT OR Apache-2.0
import {RegistryBase as BaseRegistry} from './base';
import type {ExtensionKindRuntime} from './kind-runtime';
import {UmfError} from '../model/errors';
import type {KindRegistration} from './kind-runtime';
import type {Document,Validation} from '../model/types';

type ConstraintMeter=(category:string,visits:number)=>void;

const CONTROL_CODES=new Set(['RESOURCE_LIMIT','LIMIT','CAPACITY','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);

interface RegistryRustEngine extends ExtensionKindRuntime {
 validateExtensionPayload(id:string,version:string,payload:unknown,registry?:Parameters<ExtensionKindRuntime['listKinds']>[0]):unknown;
 readDocument(source:string,format:'json'|'yaml'):unknown;
 writeDocument(document:unknown,format:'json'|'yaml'):string;
 registryPolicy?:{decide(input:Record<string,unknown>):unknown};
}

/** Host registry storage and callbacks over the initialized shared Rust engine. */
export function createRegistryRustDefault(engine:RegistryRustEngine,isNativeUmfCoreError:(error:unknown)=>boolean,registerActionsNative:(registry:BaseRegistry)=>BaseRegistry,registryPolicy?:{decide(input:Record<string,unknown>):unknown}){
 const invoke=<T>(operation:()=>T):T=>{
  try{return operation();}
  catch(error){
   if(!isNativeUmfCoreError(error))throw error;
   const native=error as {code:string;message:string;path:string};
   if(CONTROL_CODES.has(native.code))throw error;
   throw new UmfError(native.code,native.message,native.path);
  }
 };
 const runtime:ExtensionKindRuntime={
  validatePackagePayload:(manifest,payload)=>invoke(()=>engine.validateExtensionPayload(manifest.id,manifest.version,payload,[{manifest}])) as ReturnType<NonNullable<ExtensionKindRuntime['validatePackagePayload']>>,
  listKinds:(registry)=>invoke(()=>engine.listKinds(registry)),
  getKind:(reference,registry)=>invoke(()=>engine.getKind(reference,registry)),
  inspectExtensionKinds:(document,registry)=>invoke(()=>engine.inspectExtensionKinds(document,registry)),
  validateDocument:(document,registry)=>invoke(()=>engine.validateDocument(document,registry)),
 };
 Object.freeze(runtime);
 const Registry:new (kindRuntime?:ExtensionKindRuntime)=>BaseRegistry=class Registry extends BaseRegistry {
  constructor(kindRuntime:ExtensionKindRuntime=runtime){super(kindRuntime,input=>{
   if(!registryPolicy)throw new UmfError('EXTENSION_KIND_RUNTIME_REQUIRED','Rust registry policy operation is unavailable');
   return invoke(()=>registryPolicy.decide(input)) as {decision:'admit'|'replace';callbacks:string[]};
  });}
 };
 const validateDocument=(input:unknown,registry:BaseRegistry=new Registry(),meter?:ConstraintMeter):Validation=>{
  if(meter)throw new UmfError('EXTENSION_KIND_RUNTIME_CONTROLS','Use the shared engine controls for native work metering');
  return invoke(()=>engine.validateDocument(input,registry.registrations()));
 };
 const validateRegistrations=(input:unknown,registrations:KindRegistration[])=>invoke(()=>engine.validateDocument(input,registrations));
 const readDocument=(source:string,format:'json'|'yaml'='yaml'):Document=>invoke(()=>engine.readDocument(source,format)) as Document;
 const writeDocument=(document:Document,format:'json'|'yaml'='yaml'):string=>invoke(()=>engine.writeDocument(document,format));
 return Object.freeze({Registry,validateDocument,validateRegistrations,readDocument,writeDocument,createUmfRegistry:()=>registerActionsNative(new Registry())});
}
