// SPDX-License-Identifier: MIT OR Apache-2.0
import {Registry as BaseRegistry} from './registry';
import type {ExtensionKindRuntime} from './kind-runtime';
import {UmfError} from '../model/errors';
import {validateDocument as validateWithRegistry} from '../validation/document';
import type {readDocument as ReadDocument,writeDocument as WriteDocument} from '../model/document';
import {registerActions} from '../extensions/actions';

const CONTROL_CODES=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE']);

interface RegistryRustEngine extends ExtensionKindRuntime {
 validateExtensionPayload(id:string,version:string,payload:unknown,registry?:Parameters<ExtensionKindRuntime['listKinds']>[0]):unknown;
 readDocument(source:string,format:'json'|'yaml'):unknown;
 writeDocument(document:unknown,format:'json'|'yaml'):string;
}

/** Host registry storage and callbacks over the initialized shared Rust engine. */
export function createRegistryRustDefault(engine:RegistryRustEngine,isNativeUmfCoreError:(error:unknown)=>boolean){
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
 const Registry:typeof BaseRegistry=class Registry extends BaseRegistry {
  constructor(kindRuntime:ExtensionKindRuntime=runtime){super(kindRuntime);}
 };
 const validateDocument:typeof validateWithRegistry=(input,registry=new Registry(),meter)=>validateWithRegistry(input,registry,meter);
 const readDocument:typeof ReadDocument=(source,format='yaml')=>invoke(()=>engine.readDocument(source,format)) as ReturnType<typeof ReadDocument>;
 const writeDocument:typeof WriteDocument=(document,format='yaml')=>invoke(()=>engine.writeDocument(document,format));
 return Object.freeze({Registry,validateDocument,readDocument,writeDocument,createUmfRegistry:()=>registerActions(new Registry())});
}
