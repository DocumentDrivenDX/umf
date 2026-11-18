// SPDX-License-Identifier: MIT OR Apache-2.0
import * as wasm from '../../bindings/core/wasm/pkg/umf_core_wasm.js';
import {createCodegenEngine,createNativeFamilyDispatcher,initializeCoreModelRootKindNullabilityWasm,isNativeUmfCoreError,isWireAdmissionError} from '../../bindings/core/wasm/index.js';
import {CODEGEN_RESOURCES} from '../../src/access/codegen-resources';
import {CORE_MODEL_RESOURCES} from '../../src/access/core-model-resources';
import {createActionAuthoringRustDefault} from '../../src/extensions/actions/rust-authoring-default';
import {createActionRegistryRustDefault} from '../../src/extensions/actions/rust-registry';
import {createRegistryRustDefault} from '../../src/registry/rust-default';
import {runPortableInspection} from './portable-inspection';

async function initializeRuntime(){
 await wasm.default({module_or_path:new URL('../reference/assets/workbench-core.wasm',import.meta.url)});
 const model=await initializeCoreModelRootKindNullabilityWasm(CORE_MODEL_RESOURCES,async()=>wasm,globalThis);
 const createEngine=()=>createCodegenEngine(wasm,CODEGEN_RESOURCES);
 const {registerActions}=createActionRegistryRustDefault(createEngine,isNativeUmfCoreError);
 const policy=createNativeFamilyDispatcher(wasm)['registry-policy'];
 const registry=createRegistryRustDefault(model,isNativeUmfCoreError,registerActions,policy);
 const actions=createActionAuthoringRustDefault(createEngine,error=>isNativeUmfCoreError(error)||isWireAdmissionError(error),registry.validateRegistrations);
 return {...registry,...actions};
}
let runtime:Awaited<ReturnType<typeof initializeRuntime>>|undefined;

const button=document.querySelector<HTMLButtonElement>('#inspect-action')!;
const result=document.querySelector('#action-result')!;
button.addEventListener('click',async()=>{
 button.disabled=true;
 result.textContent='Inspecting the declaration…';
 try{
  runtime??=await initializeRuntime();
  result.textContent=JSON.stringify(runPortableInspection(runtime),null,2);
 }catch(error){
  result.textContent='Inspection refused. '+(error instanceof Error?error.message:String(error));
 }finally{button.disabled=false;}
});
