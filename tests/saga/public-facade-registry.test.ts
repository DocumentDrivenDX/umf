// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import actionsPackage from '../../spec/extensions/actions/package.json';
import {Registry,type Registration} from '../../src/registry/registry';
import type {Document} from '../../src/model/types';
import {registerSagas,sagaPackage,type SagaRuntime,type SagaDefinition,type SagaCapabilities} from '../../src/extensions/actions/saga';
import {createSagaRustDefault,type SagaRustEngine} from '../../src/extensions/actions/saga-rust-default';

// Host dispatch controls only; actual Saga semantics remain in the native/WASM gates.
const source={umf:'0.10.0',id:'urn:test:facade',modules:[]} as Document;
const definition={} as SagaDefinition;
const identity={module:'module',saga:'saga'};
const capabilities={} as SagaCapabilities;
function backend(label:string,calls:string[]):SagaRuntime&SagaRustEngine {
 const result=(operation:string)=>{calls.push(operation);return {backend:label};};
 return {
  sagaRegistryProfile:()=>({actionsPackage,sagaPackage}),
  inspectSagas:()=>result('inspect'),declareSaga:()=>result('declare'),
  editSaga:()=>result('edit'),assessSaga:()=>result('assess'),
 };
}
function operations(facade:ReturnType<typeof createSagaRustDefault>,registry?:Registry){
 return [()=>facade.inspectSagas(source,registry),()=>facade.declareSaga(source,'module',definition,registry),
  ()=>facade.editSaga(source,identity,definition,registry),()=>facade.assessSaga(source,identity,capabilities,registry)];
}
function hostRegistry(){
 const entries:Registration[]=[];
 const registry={kindRuntime:{},registrations:()=>entries.map(entry=>({manifest:entry.manifest})),
  get:(id:string,version:string)=>entries.find(entry=>entry.manifest.id===id&&entry.manifest.version===version),
  register:(manifest:Registration['manifest'],semantics:Registration['semantics'])=>{entries.push({manifest,semantics} as Registration);},
 } as unknown as Registry;
 return {registry,entries};
}
test('Saga defaults retain the Rust backend when no registry is supplied',()=>{
 const calls:string[]=[],facade=createSagaRustDefault(backend('default',calls),()=>false);
 for(const operation of operations(facade)){const result=operation();expect(result).toEqual({backend:'default'});expect(Object.isFrozen(result)).toBe(true);}
 expect(calls).toEqual(['inspect','declare','edit','assess']);
});
test('all public Saga operations reject an unbound explicit registry before default dispatch',()=>{
 const calls:string[]=[],facade=createSagaRustDefault(backend('default',calls),()=>false);
 for(const operation of operations(facade,new Registry()))expect(operation).toThrow(expect.objectContaining({code:'SAGA_RUNTIME_REQUIRED'}));
 expect(calls).toEqual([]);
});
test('explicit Saga registry selects its bound engine and refuses later profile changes',()=>{
 for(const mutation of ['add','replace'] as const){
  const defaultCalls:string[]=[],boundCalls:string[]=[],facade=createSagaRustDefault(backend('default',defaultCalls),()=>false);
  const {registry,entries}=hostRegistry();registerSagas(registry,backend('bound',boundCalls));
  for(const operation of operations(facade,registry))expect(operation()).toEqual({backend:'bound'});
  expect(defaultCalls).toEqual([]);expect(boundCalls).toEqual(['inspect','declare','edit','assess']);
  if(mutation==='add')entries.push({...entries[0]!,manifest:{...entries[0]!.manifest,id:'test.extra'}});
  else entries[0]={...entries[0]!};
  for(const operation of operations(facade,registry))expect(operation).toThrow(expect.objectContaining({code:'SAGA_REGISTRY_UNSUPPORTED'}));
  expect(boundCalls).toHaveLength(4);expect(defaultCalls).toEqual([]);
 }
});
