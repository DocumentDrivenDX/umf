// SPDX-License-Identifier: MIT OR Apache-2.0
// Browser bundle for the installed opt-in WASM package; config is injected by the replay server.
import {declareCoreBit128Field as reference} from '../../../src/model/bit128-field';
import {UmfError} from '../../../src/model/errors';
import {bindCoreBit128FieldRust} from '../../../src/access/rust-core-bit128-field-default';
import {FIELD, uuidDocument} from '../../../tests/helpers/uuid-fixtures';

declare const window:any;
const canonical=(value:unknown)=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const check=(condition:unknown,message:string)=>{if(!condition)throw new Error(message)};
const outcome=(run:()=>unknown)=>{try{return {ok:true,value:JSON.parse(JSON.stringify(run()))}}catch(error){const e=error as {name?:string;code?:string;message?:string;path?:string};return {ok:false,error:{name:e.name,code:e.code,message:e.message,path:e.path??''}}}};

window.runInstalledBit128Field=async(config:any)=>{
 const wasmModule=await import(config.wasmEntry);
 const engine=await wasmModule.initializeCoreBit128FieldWasm(config.resources);
 const api=bindCoreBit128FieldRust(engine,wasmModule.isCoreBit128FieldBindingError);
 for(const item of config.packet.cases){
  const source=structuredClone(item.input.source),before=JSON.stringify(source);
  const observed=outcome(()=>api.declareCoreBit128Field(source,item.input.identity,item.input.scalarType));
  check(canonical(observed)===canonical(item.expected),`frozen field vector mismatch: ${item.name}`);
  check((JSON.stringify(source)===before)===item.sourceUnchangedAfterCall,`source copy mismatch: ${item.name}`);
 }
 const traceProxy=(value:object,label:string,trace:string[])=>new Proxy(value,{
  getPrototypeOf(target){trace.push(`${label}:prototype`);return Reflect.getPrototypeOf(target)},
  ownKeys(target){trace.push(`${label}:keys`);return Reflect.ownKeys(target)},
  getOwnPropertyDescriptor(target,key){trace.push(`${label}:descriptor:${String(key)}`);return Reflect.getOwnPropertyDescriptor(target,key)},
 });
 const traceCall=(run:(source:unknown,identity:unknown)=>unknown)=>{const trace:string[]=[];const source=traceProxy(uuidDocument('binary'),'source',trace);const identity=traceProxy({...FIELD},'identity',trace);const result=outcome(()=>run(source,identity));return {trace,result}};
 const expectedTrace=traceCall((source,identity)=>reference(source as never,identity as never,'uuid'));
 const actualTrace=traceCall((source,identity)=>api.declareCoreBit128Field(source,identity as never,'uuid'));
 check(canonical(actualTrace)===canonical(expectedTrace),'source/identity proxy order differs from TypeScript');
 check(expectedTrace.trace.indexOf('identity:prototype')>expectedTrace.trace.lastIndexOf('source:descriptor:modules'),'identity reflection preceded complete source copy');
 const accessorRun=(run:(source:unknown,identity:unknown)=>unknown)=>{let getterCalls=0;const source=uuidDocument('binary');Object.defineProperty(source,'hostile',{enumerable:true,get(){getterCalls++;return true}});const identityTrace:string[]=[];const identity=new Proxy({...FIELD},{ownKeys(target){identityTrace.push('identity:keys');return Reflect.ownKeys(target)}});return {result:outcome(()=>run(source,identity)),getterCalls,identityTrace}};
 const expectedAccessor=accessorRun((source,identity)=>reference(source as never,identity as never,'uuid'));
 const actualAccessor=accessorRun((source,identity)=>api.declareCoreBit128Field(source,identity as never,'uuid'));
 check(canonical(actualAccessor)===canonical(expectedAccessor),'accessor refusal or identity reflection differs from TypeScript');
 check(actualAccessor.getterCalls===0&&actualAccessor.identityTrace.length===0,'getter or identity trap ran after accessor refusal');
 const sentinel=Object.freeze({hostSentinel:true});
 for(const run of [(source:any,identity:any)=>reference(source,identity,'uuid'),(source:any,identity:any)=>api.declareCoreBit128Field(source,identity,'uuid')]){
  let identityReads=0;const source=new Proxy(uuidDocument('binary'),{ownKeys(){throw sentinel}});const identity=new Proxy({...FIELD},{ownKeys(target){identityReads++;return Reflect.ownKeys(target)}});let thrown:any;
  try{run(source,identity)}catch(error){thrown=error}check(thrown===sentinel,'proxy exception identity changed');check(identityReads===0,'identity touched after source failure');
 }
 let candidateError:any;try{engine.declareCoreBit128Field(uuidDocument('binary'),FIELD,'string' as 'uuid')}catch(error){candidateError=error}
 let mapped:any;try{api.declareCoreBit128Field(uuidDocument('binary'),FIELD,'string' as 'uuid')}catch(error){mapped=error}
 check(wasmModule.isCoreBit128FieldBindingError(candidateError),'binding error was not branded');check(mapped instanceof UmfError,'mapped error lacks TypeScript UmfError identity');check(mapped.code==='BIT128_FIELD','mapped error code differs');
 let unrelatedThrown:any;const unrelated=Object.freeze({unrelated:true});const pass=bindCoreBit128FieldRust({declareCoreBit128Field(){throw unrelated}},wasmModule.isCoreBit128FieldBindingError);try{pass.declareCoreBit128Field({},FIELD,'uuid')}catch(error){unrelatedThrown=error}check(unrelatedThrown===unrelated,'unbranded thrown error identity changed');

 const control=async(kind:'missing'|'corrupt')=>{
  const module=await import(config[`${kind}Entry`]+`?probe=${crypto.randomUUID()}`);
  try{await module.initializeCoreBit128FieldWasm(config.resources);return {refused:false,message:''}}
  catch(error){return {refused:true,message:error instanceof Error?error.message:String(error)}}
 };
 const controls={missing:await control('missing'),corrupt:await control('corrupt')};
 check(controls.missing.refused&&controls.corrupt.refused,'WASM missing/corrupt controls did not fail closed');
 if(typeof process!=='undefined'||typeof Buffer!=='undefined')throw new Error('Node globals leaked into browser candidate');
 return {status:'passed',runtime:navigator.userAgent,frozenCases:config.packet.cases.length,rawHostProxyOrderParity:true,accessorsNotInvoked:true,identityNotTouchedAfterAccessorRefusal:true,originalProxyExceptionIdentity:true,bindingErrorBranded:true,publicUmfErrorIdentity:mapped instanceof UmfError,unrelatedExceptionIdentity:unrelatedThrown===unrelated,missingWasmRefused:controls.missing.refused,corruptWasmRefused:controls.corrupt.refused,missingMessage:controls.missing.message,corruptMessage:controls.corrupt.message,nodeGlobalsAbsent:true};
};
