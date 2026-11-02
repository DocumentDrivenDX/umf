import {expect,test} from 'bun:test';
import {bindCoreInspectorsRust} from '../../src/access/rust-core-inspectors-default';
import {UmfError} from '../../src/model/errors';
import {AdmissionError,encodeRequestWire} from '../../bindings/core/node/src/wire.js';
import {isNativeUmfCoreError,isWireAdmissionError,UmfCoreError} from '../../bindings/core/node/index.js';

const operations=['inspectCoreScalarType','inspectCoreRecordMembers','inspectCoreReferenceLinks'] as const;
type Operation=typeof operations[number];

function internalAdmissionError(shape:string){
 const source:any={},identity:any={module:'m',element:'field'};
 if(shape==='accessor_source')Object.defineProperty(source,'probe',{enumerable:true,get(){throw new Error('getter invoked');}});
 else if(shape==='accessor_identity')Object.defineProperty(identity,'module',{enumerable:true,get(){throw new Error('getter invoked');}});
 else if(shape==='hidden_source')Object.defineProperty(source,'probe',{enumerable:false,value:true});
 else source[Symbol('probe')]=true;
 try{encodeRequestWire({source,identity});}catch(error){return error;}
 throw new Error('expected a wire admission error');
}

function bind(failure:Error,predicate=(error:unknown)=>isWireAdmissionError(error),nativeGuard=(error:unknown)=>isNativeUmfCoreError(error)){
 const engine=Object.fromEntries(operations.map(operation=>[operation,()=>{throw failure;}])) as Record<Operation,()=>never>;
 return bindCoreInspectorsRust(engine as any,predicate,nativeGuard);
}

const calls=(api:ReturnType<typeof bind>)=>[
 ()=>api.inspectCoreScalarType({} as any,{} as any),
 ()=>api.inspectCoreRecordMembers({} as any,{} as any),
 ()=>api.inspectCoreReferenceLinks({} as any,{} as any),
];

test('all default Core inspectors restore reference NON_JSON host-error envelopes',()=>{
 const cases=[
  {code:'ACCESSOR_PROPERTY',path:'/source/probe',message:'Hidden fields and accessors cannot be serialized faithfully',localPath:'/probe'},
  {code:'ACCESSOR_PROPERTY',path:'/identity/module',message:'Hidden fields and accessors cannot be serialized faithfully',localPath:'/module'},
  {code:'NON_ENUMERABLE_PROPERTY',path:'/source/probe',message:'Hidden fields and accessors cannot be serialized faithfully',localPath:'/probe'},
  {code:'UNSUPPORTED_KEY',path:'/source',message:'Symbol keys are not JSON-compatible',localPath:''},
 ];
 for(const operation of operations){
  for(const [index,item] of cases.entries()){
   const internal=internalAdmissionError(['accessor_source','accessor_identity','hidden_source','symbol_source'][index]!);
   expect(isWireAdmissionError(internal)).toBe(true);
   const api=bind(internal as Error);
   let caught:unknown;
   try{calls(api)[operations.indexOf(operation)]!();}catch(error){caught=error;}
   expect(caught).toBeInstanceOf(UmfError);
   expect(caught).toMatchObject({name:'UmfError',code:'NON_JSON',message:item.message,path:item.localPath});
  }
 }
});

test('Core inspector semantic failures normalize only when created from a native response',()=>{
 const native=Object.assign(new (UmfCoreError as any)('CORE_SCHEMA_PROPERTIES','native semantic failure','/source/properties'),{path:'/source/properties'});
 // The exported constructor alone does not confer native response provenance.
 expect(isNativeUmfCoreError(native)).toBe(false);
 const api=bind(native,()=>false);
 expect(()=>api.inspectCoreScalarType({} as any,{} as any)).toThrow(native);
 const branded=Object.create(UmfCoreError.prototype) as Error & {code:string;path:string};
 branded.name='UmfCoreError';branded.message='native semantic failure';branded.code='CORE_SCHEMA_PROPERTIES';branded.path='/source/properties';
 expect(isNativeUmfCoreError(branded)).toBe(false);
});

test('host accessor refusals do not invoke getters while translating the envelope',()=>{
 let reads=0;
 const source={};
 Object.defineProperty(source,'probe',{enumerable:true,get(){reads++;return true;}});
 const hidden={};
 Object.defineProperty(hidden,'probe',{enumerable:false,value:true});
 const withSymbol={ [Symbol('future')]:true };
 const probes=[
  {input:source,error:internalAdmissionError('accessor_source')},
  {input:hidden,error:internalAdmissionError('hidden_source')},
  {input:withSymbol,error:internalAdmissionError('symbol_source')},
 ];
 for(const {input,error} of probes){
  const api=bind(error as Error);
  expect(()=>api.inspectCoreScalarType(input as any,{} as any)).toThrow(UmfError);
 }
 expect(reads).toBe(0);
});

test('admission errors outside source and identity inputs retain the Rust envelope',()=>{
 const forged=Object.assign(new Error('caller proxy failure'),{name:'AdmissionError',code:'ACCESSOR_PROPERTY',path:'/source/probe'});
 const constructed=new (AdmissionError as any)('ACCESSOR_PROPERTY','caller constructed error','/source/probe') as Error&{path:string};
 expect(isWireAdmissionError(forged)).toBe(false);
 expect(isWireAdmissionError(constructed)).toBe(false);
 for(const failure of [forged,constructed])for(const operation of operations){
  const api=bind(failure);
  let caught:unknown;try{calls(api)[operations.indexOf(operation)]!();}catch(error){caught=error;}
  expect(caught).toBe(failure);
 }
});

test('unbranded proxy errors are rethrown without reading their properties',()=>{
 let reads=0;
 const failure=new Proxy(new Error('caller proxy failure'),{get(target,key,receiver){reads++;return Reflect.get(target,key,receiver);},getOwnPropertyDescriptor(target,key){reads++;return Reflect.getOwnPropertyDescriptor(target,key);}});
 for(const operation of operations){
  const api=bind(failure as Error);
  let caught:unknown;try{calls(api)[operations.indexOf(operation)]!();}catch(error){caught=error;}
  expect(caught).toBe(failure);
 }
 expect(reads).toBe(0);
});

test('provenance checks survive WeakSet prototype poisoning after module initialization',()=>{
 const internal=internalAdmissionError('accessor_source');
 const originalHas=WeakSet.prototype.has;const originalAdd=WeakSet.prototype.add;
 try{
  WeakSet.prototype.has=function(){throw new Error('poisoned has');};
  WeakSet.prototype.add=function(){throw new Error('poisoned add');};
  expect(isWireAdmissionError(internal)).toBe(true);
  expect(isWireAdmissionError(internalAdmissionError('hidden_source'))).toBe(true);
  expect(isNativeUmfCoreError(internal)).toBe(false);
 }finally{WeakSet.prototype.has=originalHas;WeakSet.prototype.add=originalAdd;}
});
