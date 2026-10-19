import {describe,expect,test} from 'bun:test';
import {checkConstraintProgram,executeConstraints} from '../../src/validation/constraint-kernel';
import {CURRENT_CORE_VERSION} from '../../src/generated/core-model';
import type {Diagnostic,Document} from '../../src/model/types';
const document:Document={umf:CURRENT_CORE_VERSION,id:'kernel-review',vocabularies:{},modules:[]};
const diagnostic:Diagnostic={code:'PROBE',path:'',message:'Probe assertion',severity:'warning'};
const program=(steps:unknown[])=>({profile:'umf.constraints/1',steps});
const op=(name:string,...args:unknown[])=>({op:name,args});
const emit={op:'emit',diagnostic};
// @covers US-089-AC19 @covers US-089-AC20 @covers US-089-AC24
describe('independent constraint boundary review',()=>{
 test('unknown and malformed operators reject before an untaken branch or empty loop',()=>{
  for(const expression of [op('constructor'),op('toString'),op('__proto__'),{op:'get',args:[]},{op:'get',args:[{},[]],extra:true}]){
   expect(()=>checkConstraintProgram(program([{op:'if',test:false,then:[{op:'let',name:'x',value:expression}]}]))).toThrow();
   expect(()=>checkConstraintProgram(program([{op:'for',as:'x',each:[],body:[{op:'let',name:'value',value:expression}]}]))).toThrow();
  }
 });
 test('non-JSON values, accessors and cycles reject without executing getters',()=>{
  for(const value of [undefined,()=>true,Symbol('expression'),NaN,Infinity,-0])expect(()=>checkConstraintProgram(program([{op:'let',name:'x',value}]))).toThrow();
  let calls=0;const instruction=Object.defineProperty({},'op',{get(){calls++;return 'emit';},enumerable:true});
  expect(()=>checkConstraintProgram(program([instruction]))).toThrow();expect(calls).toBe(0);
  const cyclic:any={};cyclic.child=cyclic;expect(()=>checkConstraintProgram(program([{op:'let',name:'x',value:cyclic}]))).toThrow();
 });
 test('path traversal sees only own properties and retains hostile keys as data',()=>{
  const inspect=(value:unknown)=>executeConstraints(document,program([{op:'if',test:op('has',value,['__proto__','constructor']),then:[emit]}]),{});
  expect(inspect({})).toEqual([]);
  expect(inspect(JSON.parse('{"__proto__":{"constructor":true}}'))).toEqual([diagnostic]);
 });
 test('binding names never inherit prototypes or mutate lexical environments',()=>{
  expect(()=>executeConstraints(document,program([{op:'if',test:{var:'toString'},then:[emit]}]),{})).toThrow('Unbound');
  expect(executeConstraints(document,program([{op:'if',test:true,then:[{op:'let',name:'__proto__',value:true},{op:'if',test:{var:'__proto__'},then:[emit]}]}]),{})).toEqual([diagnostic]);
 });
});
