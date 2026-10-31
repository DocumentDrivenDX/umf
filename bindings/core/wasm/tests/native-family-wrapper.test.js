import {describe,expect,test} from 'bun:test';
import {createNativeFamilyOperations} from '../src/native-family.js';
import {encodeWire,fromWire} from '../src/wire.js';

const document={umf:'0.10.0',id:'browser-family-wire',modules:[]};
const ok=value=>JSON.stringify({profile:'umf.core-wire/1',status:'ok',wire:encodeWire(value)});
const refused=(code='REQUEST')=>JSON.stringify({profile:'umf.core-wire/1',status:'error',code,pathUnits:[],messageUnits:[114,101,102,117,115,101,100]});

describe('native family browser capability',()=>{
 test('routes one established JSON-LD operation through the browser WASM executor',()=>{
  const calls=[];
  const wasmModule={executeNativeFamilyWire(family,wire,controlDispatcher){
   const request=fromWire(JSON.parse(wire));calls.push({family,request,controlDispatcher});return ok(document);
  }};
  const operations=createNativeFamilyOperations((family,wire,control)=>wasmModule.executeNativeFamilyWire(family,wire,control),undefined,undefined,failure=>Object.assign(new Error(failure.message),failure));
  expect(operations.jsonld.import({source:'{}',id:'browser-family-wire'})).toEqual(document);
  expect(calls).toHaveLength(1);
  expect(calls[0].family).toBe('jsonld');
  expect(calls[0].request).toMatchObject({profile:'umf.jsonld-wire/1',op:'jsonld.import',source:'{}',id:'browser-family-wire'});
 });

 test('browser execution preserves a cancellation refusal from the native control hook',()=>{
  let seen;
  const control=()=>refused('CANCELLED');
  const wasmModule={executeNativeFamilyWire(family,wire,dispatcher){seen=dispatcher;if(dispatcher?.(1))return refused('CANCELLED');return ok(null);}};
  const operations=createNativeFamilyOperations((family,wire,dispatcher)=>wasmModule.executeNativeFamilyWire(family,wire,dispatcher),control,undefined,failure=>Object.assign(new Error(failure.message),failure));
  let thrown;
  try{operations.jsonld.import({source:'{}',id:'cancelled'});}catch(error){thrown=error;}
  expect(seen).toBe(control);
  expect(thrown).toMatchObject({code:'CANCELLED'});
 });
});
