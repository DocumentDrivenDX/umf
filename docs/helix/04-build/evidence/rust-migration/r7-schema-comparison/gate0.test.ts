// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {compareDocumentsPredecessor as compareDocuments} from './predecessor-oracle';
import cases from './predecessor-cases.json';

test('Gate 0 matches independent structural comparison expectations',()=>{
 for(const item of cases.cases){
  expect(compareDocuments(item.before,item.after),item.id).toEqual(item.expected);
 }
});

test('Gate 0 compares keyed-array shared order before walking IDs',()=>{
 const before=[{id:'a',v:1},{id:'b',v:2},{id:'c',v:3}];
 const after=[{id:'b',v:2},{id:'c',v:3},{id:'a',v:4}];
 expect(compareDocuments(before,after)).toEqual([
  {path:'/order',status:'changed',before:['a','b','c'],after:['b','c','a']},
  {path:'/id:a/v',status:'changed',before:1,after:4},
 ]);
});

test('Gate 0 preserves the NUL-join collision in keyed-array order comparison',()=>{
 const before=[{id:'a',v:'first'},{id:'a\u0000a',v:'second'}];
 const after=[{id:'a\u0000a',v:'second'},{id:'a',v:'first'}];
 expect(compareDocuments(before,after)).toEqual([]);
});

test('Gate 0 walks ordinary object keys in before insertion order',()=>{
 const before={first:1,second:2};
 const after={second:3,first:4};
 expect(compareDocuments(before,after)).toEqual([
  {path:'/first',status:'changed',before:1,after:4},
  {path:'/second',status:'changed',before:2,after:3},
 ]);
});

test('Gate 0 treats ordinary object property-order-only changes as equal',()=>{
 const before={first:1,second:2};
 const after={second:2,first:1};
 expect(compareDocuments(before,after)).toEqual([]);
});

test('Gate 0 cannot observe original JSON number spelling after host parsing',()=>{
 expect(compareDocuments(JSON.parse('{"n":1.0}'),JSON.parse('{"n":1}'))).toEqual([]);
 expect(()=>compareDocuments(JSON.parse('{"n":9007199254740993}'),{})).toThrow(expect.objectContaining({
  name:'UmfError',code:'NUMBER',message:'Number outside the core interoperable numeric profile',path:'/n',
 }));
});

test('Gate 0 runs copyJson on before before after and preserves exact first refusal',()=>{
 const before=Object.defineProperty({},'hidden',{value:1,enumerable:false});
 let afterInspected=false;
 const after=new Proxy({}, {ownKeys(){afterInspected=true;return ['alsoHidden'];}});
 expect(()=>compareDocuments(before,after)).toThrow(expect.objectContaining({
  name:'UmfError',code:'NON_JSON',message:'Hidden fields and accessors cannot be serialized faithfully',path:'/hidden',
 }));
 expect(afterInspected).toBe(false);
 const invalidAfter=Object.defineProperty({},'alsoHidden',{value:2,enumerable:false});
 expect(()=>compareDocuments({},invalidAfter)).toThrow(expect.objectContaining({
  name:'UmfError',code:'NON_JSON',message:'Hidden fields and accessors cannot be serialized faithfully',path:'/alsoHidden',
 }));
});

test('Gate 0 retains detached leaf values in results',()=>{
 const before={nested:[1,2]};
 const after={nested:[1,3]};
 const changes=compareDocuments(before,after);
 expect(changes).toEqual([{path:'/nested',status:'changed',before:[1,2],after:[1,3]}]);
 expect(changes[0]!.before).not.toBe(before.nested);
 expect(changes[0]!.after).not.toBe(after.nested);
 before.nested[0]=99;
 after.nested[0]=99;
 expect(changes[0]!.before).toEqual([1,2]);
 expect(changes[0]!.after).toEqual([1,3]);
});

test('Gate 0 pins common copyJson refusal classes and traversal paths',()=>{
 const cyclic:any={};cyclic.self=cyclic;
 const cases:[unknown,string,string,string][]=[
  [cyclic,'CYCLE','Cyclic value','/self'],
  [{bad:()=>0},'NON_JSON','Value is not JSON-compatible','/bad'],
  [Object.create({inherited:true}),'NON_JSON','Custom object prototype',''],
  [Object.defineProperty({},'field',{get(){return 1},enumerable:true}),'NON_JSON','Hidden fields and accessors cannot be serialized faithfully','/field'],
  [Object.assign([1],{extra:2}),'NON_JSON','Non-index array property',''],
  [[,],'NON_JSON','Sparse arrays are not JSON values',''],
  [{bad:-0},'NUMBER','Number outside the core interoperable numeric profile','/bad'],
  [{bad:Number.POSITIVE_INFINITY},'NUMBER','Number outside the core interoperable numeric profile','/bad'],
 ];
 for(const [value,code,message,path] of cases){
  expect(()=>compareDocuments(value,{})).toThrow(expect.objectContaining({name:'UmfError',code,message,path}));
 }
});
