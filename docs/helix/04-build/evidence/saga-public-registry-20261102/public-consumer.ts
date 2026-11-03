import {Registry,registerSagas,inspectSagas,declareSaga,editSaga,assessSaga,createSagaResources,readDocument,writeDocument} from '@umf/core';
import type {Document,SagaDefinition,SagaCapabilities,SagaIdentity} from '@umf/core';
import {initializeCodegenWasm,initializeWasm} from '@umf/core/runtime/wasm';
export async function publicSagaConsumer(source:Document,definition:SagaDefinition,identity:SagaIdentity,capabilities:SagaCapabilities){
 const resources=createSagaResources();
 const engine=await initializeCodegenWasm(undefined,globalThis,resources);
 const core=await initializeWasm(undefined,globalThis,resources);
 const registry=registerSagas(new Registry(core),engine);
 const inspection=inspectSagas(source,registry);
 const declared=declareSaga(source,'equipment',definition,registry);
 const edited=editSaga(declared,identity,definition,registry);
 const text=writeDocument(edited,'yaml');
 const exchanged=readDocument(text,'yaml');
 return {inspection,assessment:assessSaga(exchanged,identity,capabilities,registry)};
}
