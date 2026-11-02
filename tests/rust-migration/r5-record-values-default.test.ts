// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {validateCoreRecordValues as predecessor} from '../../src/model/record-values';
import {validateCoreRecordValues as rustDefault} from '../../src/index-node-v4';

const root=resolve(import.meta.dir,'../..');
const packet=JSON.parse(await readFile(resolve(root,'tests/rust-core/fixtures/r5-record-values/frozen-typescript.json'),'utf8'));
const capture=(run:()=>unknown)=>{try{return{ok:true,value:run()};}catch(error:any){return{ok:false,error:{name:error?.name??'Error',code:error?.code??'',message:error?.message??String(error),path:error?.path??''}};}};

test('V4 Record Values default matches every frozen TypeScript result and refusal',()=>{
 expect(rustDefault.name).toBe(predecessor.name);
 expect(rustDefault.length).toBe(predecessor.length);
 for(const c of packet.cases){
  const expected=c.thrown?{ok:false,error:{name:c.thrown.name,code:c.thrown.code,message:c.thrown.message,path:c.thrown.path}}:{ok:true,value:c.result};
  const actual=capture(()=>rustDefault(c.source,c.identity,c.values));
  if(c.thrown&&!Object.hasOwn(c.thrown,'name'))delete actual.error?.name;
  expect(actual).toEqual(expected);
  expect(capture(()=>rustDefault(c.source,c.identity,c.values))).toEqual(capture(()=>predecessor(c.source,c.identity,c.values)));
 }
},60_000);

test('V4 host admission refuses accessors before invoking them and preserves unknown content',()=>{
 const fixture=packet.cases.find((row:any)=>row.id==='valid-present')!;
 const {source,identity,values}=fixture;let s=0,i=0,v=0;
 const sourceAccessor={...source};Object.defineProperty(sourceAccessor,'future',{enumerable:true,get(){s++;return true;}});
 const identityAccessor={get module(){i++;return 'fixture';},element:'item'};
 const valuesAccessor=[{field:{module:'fixture',element:'label'},state:'present',get value(){v++;return{string:'x'};}}];
 expect(capture(()=>rustDefault(sourceAccessor as any,identityAccessor as any,valuesAccessor as any)).ok).toBe(false);
 expect({s,i,v}).toEqual({s:0,i:0,v:0});
 s=i=v=0;
 expect(capture(()=>rustDefault(source as any,identityAccessor as any,valuesAccessor as any)).ok).toBe(false);
 expect({s,i,v}).toEqual({s:0,i:0,v:0});
 const input=structuredClone(source);input['x-future-assertion']={opaque:'retained'};
 expect(rustDefault(input as any,identity as any,values as any).source['x-future-assertion']).toEqual(input['x-future-assertion']);
});
