// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe,expect,test} from 'bun:test';
import {UmfError} from '../src/model/errors';
import {bindCoreDatasetValuesCompactRust,type CoreDatasetValuesCompactRustEngine} from '../src/access/rust-dataset-values-compact-default';

const doc={} as never;
const input={} as never;
const receipt={} as never;
const thrown=(code:string,path:string,message='frozen refusal')=>Object.assign(new Error(message),{code,path});

describe('Rust compact Dataset default adapter',()=>{
 test('delegates validation and verification without reshaping values',()=>{
  let seen:unknown[]|undefined;
  const engine={
   validateCoreDatasetValuesCompact(source:unknown,request:unknown){seen=[source,request];return receipt;},
   verifyCoreDatasetValuesCompact(value:unknown,current:unknown,request:unknown){seen=[value,current,request];return receipt;},
  } satisfies CoreDatasetValuesCompactRustEngine;
  const api=bindCoreDatasetValuesCompactRust(engine);
  expect(api.validateCoreDatasetValuesCompact(doc,input)).toBe(receipt);
  expect(seen).toEqual([doc,input]);
  expect(api.verifyCoreDatasetValuesCompact(receipt,doc,input)).toBe(receipt);
  expect(seen).toEqual([receipt,doc,input]);
 });

 test('maps compact receipt refusals to the public UmfError shape',()=>{
  const engine={
   validateCoreDatasetValuesCompact(){return receipt;},
   verifyCoreDatasetValuesCompact(){throw thrown('CORE_DATASET_COMPACT_RECEIPT','');},
  } satisfies CoreDatasetValuesCompactRustEngine;
  expect(()=>bindCoreDatasetValuesCompactRust(engine).verifyCoreDatasetValuesCompact(receipt,doc,input)).toThrow(expect.objectContaining({name:'UmfError',code:'CORE_DATASET_COMPACT_RECEIPT',message:'frozen refusal',path:''}));
 });

 test('maps compact structural and work limits to the public error class',()=>{
  for(const [path,message] of [['/context/99998','JSON structural limit exceeded'],['','Compact dataset JSON traversal/copy/semantic budget exceeded']] as const) {
   const engine={validateCoreDatasetValuesCompact(){throw thrown('LIMIT',path,message);}} as unknown as CoreDatasetValuesCompactRustEngine;
   expect(()=>bindCoreDatasetValuesCompactRust(engine).validateCoreDatasetValuesCompact(doc,input)).toThrow(expect.objectContaining({name:'UmfError',code:'LIMIT',message,path}));
  }
 });

 test('maps only top-level source/input wire refusals to public UmfError shape',()=>{
  const sourceEngine={validateCoreDatasetValuesCompact(){throw thrown('CORE_DATASET_SOURCE','/source');}} as unknown as CoreDatasetValuesCompactRustEngine;
  expect(()=>bindCoreDatasetValuesCompactRust(sourceEngine).validateCoreDatasetValuesCompact(doc,input)).toThrow(expect.objectContaining({name:'UmfError',code:'CORE_DATASET_SOURCE',message:'frozen refusal',path:''}));
  const inputEngine={validateCoreDatasetValuesCompact(){throw thrown('CORE_DATASET_INPUT','/input');}} as unknown as CoreDatasetValuesCompactRustEngine;
  expect(()=>bindCoreDatasetValuesCompactRust(inputEngine).validateCoreDatasetValuesCompact(doc,input)).toThrow(expect.objectContaining({name:'UmfError',code:'CORE_DATASET_INPUT',message:'frozen refusal',path:''}));
  const nestedEngine={validateCoreDatasetValuesCompact(){throw thrown('CORE_DATASET_INPUT','/input/records/0');}} as unknown as CoreDatasetValuesCompactRustEngine;
  try { bindCoreDatasetValuesCompactRust(nestedEngine).validateCoreDatasetValuesCompact(doc,input); throw new Error('expected refusal'); }
  catch(error) { expect(error).toBeInstanceOf(UmfError); expect(error).toMatchObject({code:'CORE_DATASET_INPUT',message:'frozen refusal',path:'/input/records/0'}); }
 });

 test('rethrows host controls and unrelated engine refusals unchanged',()=>{
  for(const control of [thrown('CANCELLED',''),thrown('DEADLINE',''),thrown('RESOURCE_LIMIT','')]) {
   const engine={validateCoreDatasetValuesCompact(){throw control;}} as unknown as CoreDatasetValuesCompactRustEngine;
   try { bindCoreDatasetValuesCompactRust(engine).validateCoreDatasetValuesCompact(doc,input); throw new Error('expected refusal'); }
   catch(error) { expect(error).toBe(control); }
  }
 });
});
