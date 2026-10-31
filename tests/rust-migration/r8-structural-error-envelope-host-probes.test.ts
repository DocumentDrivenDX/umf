// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {bindCoreDatasetValuesCompactRust} from '../../src/access/rust-dataset-values-compact-default';
import {bindBit128Rust} from '../../src/access/rust-bit128-default';
import {UmfError} from '../../src/model/errors';
import {createBit128Engine,createCoreModelRootEngine,isBit128EngineError,isNativeUmfCoreError} from '../../bindings/core/node/index.js';
import {CORE_MODEL_RESOURCES} from '../../src/access/core-model-resources';

// The ignored Node addon may predate this worktree. These probes use it only
// to exercise installed Node bindings; both hostile failures happen in JS
// host admission before a native request is sent.
const datasetFixture=await Bun.file('tests/rust-core/fixtures/r5-dataset-values-compact/frozen-commerce.json').json();

test('compact Dataset facade preserves the caller Proxy trap error by identity',()=>{
 const sentinel=Object.assign(new Error('caller proxy failure'),{
  name:'UmfCoreError',code:'CORE_DATASET_INPUT',path:'/input',
 });
 const input=new Proxy(datasetFixture.input as object,{
  ownKeys(){throw sentinel;},
 });
 const engine=createCoreModelRootEngine(CORE_MODEL_RESOURCES);
 const api=bindCoreDatasetValuesCompactRust(engine,isNativeUmfCoreError);
 let caught:unknown;
 try{api.validateCoreDatasetValuesCompact(datasetFixture.source as any,input as any);}
 catch(error){caught=error;}
 expect(caught).toBe(sentinel);
});

test('compact Dataset facade still maps a genuine native input refusal',()=>{
 const engine=createCoreModelRootEngine(CORE_MODEL_RESOURCES);
 const api=bindCoreDatasetValuesCompactRust(engine,isNativeUmfCoreError);
 let caught:unknown;
 try{api.validateCoreDatasetValuesCompact(datasetFixture.source as any,null as any);}
 catch(error){caught=error;}
 expect(caught).toBeInstanceOf(UmfError);
 expect(caught).toMatchObject({name:'UmfError',code:'CORE_DATASET_INPUT'});
});

test('Bit128 binding preserves a caller Proxy trap that spoofs AdmissionError',()=>{
 const sentinel=Object.assign(new Error('caller proxy failure'),{
  name:'AdmissionError',code:'ACCESSOR_PROPERTY',path:'/args/words/high',
 });
 const words=new Proxy({high:'0'.repeat(16),low:'0'.repeat(16)},{
  ownKeys(){throw sentinel;},
 });
 const api=bindBit128Rust(createBit128Engine(),isBit128EngineError);
 let caught:unknown;
 try{api.bits128FromWords(words as any,false);}
 catch(error){caught=error;}
 expect(caught).toBe(sentinel);
});

test('Bit128 facade preserves a caller Proxy trap that spoofs UmfCoreError',()=>{
 let reads=0;
 const sentinel=Object.assign(new Error('caller proxy failure'),{
  name:'UmfCoreError',code:'BIT128_TYPE',path:'/words',
 });
 const callerError=new Proxy(sentinel,{get(target,key,receiver){reads++;return Reflect.get(target,key,receiver);}});
 const words=new Proxy({high:'0'.repeat(16),low:'0'.repeat(16)},{
  ownKeys(){throw callerError;},
 });
 const api=bindBit128Rust(createBit128Engine(),isBit128EngineError);
 let caught:unknown;
 try{api.bits128FromWords(words as any,false);}
 catch(error){caught=error;}
 expect(caught).toBe(callerError);
 expect(reads).toBe(0);
});

test('Bit128 binding maps a genuine accessor admission refusal',()=>{
 const words={low:'0'.repeat(16)} as {high:string;low:string};
 Object.defineProperty(words,'high',{enumerable:true,get(){throw new Error('must not invoke getter');}});
 const api=bindBit128Rust(createBit128Engine(),isBit128EngineError);
 let caught:unknown;
 try{api.bits128FromWords(words,false);}
 catch(error){caught=error;}
 expect(caught).toBeInstanceOf(UmfError);
 expect(caught).toMatchObject({name:'UmfError',code:'BIT128_TYPE'});
});
