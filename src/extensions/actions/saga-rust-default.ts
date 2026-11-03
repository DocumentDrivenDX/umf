// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../../model/errors';
import type {Document} from '../../model/types';
import type {Registry} from '../../registry/registry';
import {inspectSagas as inspectBoundSagas,declareSaga as declareBoundSaga,editSaga as editBoundSaga,assessSaga as assessBoundSaga} from './saga';
import type {SagaAssessment,SagaCapabilities,SagaDefinition,SagaIdentity,SagaInspection} from './saga';
export interface SagaRustEngine {inspectSagas(source:unknown):unknown;declareSaga(source:unknown,module:string,definition:unknown):unknown;editSaga(source:unknown,identity:unknown,replacement:unknown):unknown;assessSaga(source:unknown,identity:unknown,capabilities:unknown):unknown;}
function freezeReport(value:unknown):unknown {if(value!==null&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freezeReport(child);Object.freeze(value);}return value;}
/** Typed V4 defaults over the Rust-owned saga kernels. */
export function createSagaRustDefault(engine:SagaRustEngine,isNativeError:(error:unknown)=>boolean) {
 const call=<T>(operation:()=>unknown):T=>{try{return freezeReport(operation()) as T;}catch(error){if(isNativeError(error)){const native=error as {code?:unknown;message?:unknown;path?:unknown};if(typeof native.code==='string'&&(native.code.startsWith('SAGA_')||native.code==='REQUEST'))throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');}throw error;}};
 return Object.freeze({
  inspectSagas(source:Document,registry?:Registry):SagaInspection{return call(()=>registry===undefined?engine.inspectSagas(source):inspectBoundSagas(source,registry));},
  declareSaga(source:Document,module:string,definition:SagaDefinition,registry?:Registry):Document{return call(()=>registry===undefined?engine.declareSaga(source,module,definition):declareBoundSaga(source,module,definition,registry));},
  editSaga(source:Document,identity:SagaIdentity,replacement:SagaDefinition,registry?:Registry):Document{return call(()=>registry===undefined?engine.editSaga(source,identity,replacement):editBoundSaga(source,identity,replacement,registry));},
  assessSaga(source:Document,identity:SagaIdentity,capabilities:SagaCapabilities,registry?:Registry):SagaAssessment{return call(()=>registry===undefined?engine.assessSaga(source,identity,capabilities):assessBoundSaga(source,identity,capabilities,registry));},
 });
}
