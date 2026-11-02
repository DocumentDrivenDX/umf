import {describe,expect,test} from 'bun:test';
import {createNativeFamilyOperations,NATIVE_FAMILY_PROFILE} from '../src/native-family.js';
import {encodeWire,fromWire} from '../src/wire.js';

const document={umf:'0.10.0',id:'family-wire',modules:[]};
const ok=value=>JSON.stringify({profile:'umf.core-wire/1',status:'ok',wire:encodeWire(value)});
const refused=(code='REQUEST')=>JSON.stringify({profile:'umf.core-wire/1',status:'error',code,pathUnits:[47],messageUnits:[114,101,102,117,115,101,100]});

describe('native family Node capability',()=>{
 test('routes one established OpenAPI operation to exactly its Rust family',()=>{
  const calls=[];
  const operations=createNativeFamilyOperations((family,wire)=>{
   const request=fromWire(JSON.parse(wire));calls.push({family,request});return ok(document);
  },undefined,undefined,failure=>Object.assign(new Error(failure.message),failure));
  expect(operations.openapi.import({source:'{}',id:'family-wire'})).toEqual(document);
  expect(calls).toHaveLength(1);
  expect(calls[0].family).toBe('openapi');
  expect(calls[0].request).toMatchObject({profile:'umf.openapi-wire/1',op:'openapi.import',source:'{}',id:'family-wire'});
  expect(NATIVE_FAMILY_PROFILE).toBe('umf.native-family-dispatch/1');
 });

 test('preserves native malformed-request and host-control refusals',()=>{
  let receivedControl;
  let shouldCancel=false;
  const control=()=>refused('CANCELLED');
  const operations=createNativeFamilyOperations((family,_wire,dispatcher)=>{
   receivedControl=dispatcher;
   if(shouldCancel&&dispatcher?.(1))return refused('CANCELLED');
   return refused('REQUEST');
  },control,undefined,failure=>Object.assign(new Error(failure.message),failure));
  let malformed, cancelled;
  try{operations.openapi.import({futureMember:true});}catch(error){malformed=error;}
  shouldCancel=true;
  try{operations.openapi.import({source:'{}',id:'x'});}catch(error){cancelled=error;}
  expect(malformed.code).toBe('REQUEST');
  expect(malformed.path).toBe('/');
  expect(cancelled.code).toBe('CANCELLED');
  expect(cancelled.path).toBe('/');
  expect(receivedControl).toBe(control);
 });

 test('closed facade rejects unknown family, operation, and accessor inputs before native dispatch',()=>{
  let calls=0;
  const operations=createNativeFamilyOperations(()=>{calls++;return ok(document);});
  expect(operations.graphql).toBeUndefined();
  expect(()=>operations.openapi.notAnOperation({})).toThrow(TypeError);
  const input={};Object.defineProperty(input,'source',{enumerable:true,get(){throw new Error('getter ran');}});
  expect(()=>operations.openapi.import(input)).toThrow(TypeError);
  expect(calls).toBe(0);
 });
});
