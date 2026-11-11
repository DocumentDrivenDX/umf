// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import logicalSource from '../../fixtures/binding/raw-profiles/logical.json';
import lakebase from '../../fixtures/binding/raw-profiles/lakebase.json';
import unity from '../../fixtures/binding/raw-profiles/unity-catalog.json';
import spark from '../../fixtures/binding/raw-profiles/spark-delta.json';
import {inspectRawTableBinding} from '../../src/index-node-v4';
import type {Document} from '../../src/model/types';
import {rawProfileExpectedReceipts} from './raw-profiles-receipts';

const sources=[lakebase,unity,spark] as const;
const expected=(name:string)=>rawProfileExpectedReceipts.find(receipt=>receipt.name===name)!.result;
function setup(source:any,missingMembers=false){
 const binding=structuredClone(source) as unknown as Document;
 const logical=structuredClone(logicalSource) as unknown as Document;
 if(missingMembers)delete (logical.modules[0]!.elements[1] as any).members;
 const profile=binding.extensions!['umf.binding'] as any;
 return {binding,logical,target:{platform:profile.target.system,majorVersion:profile.target.version}};
}

test('V4 Node raw-profile Rust route matches all nine captured baseline receipts',()=>{
 for(const source of sources){
  const ordinary=setup(source);
  expect(inspectRawTableBinding(ordinary.binding,ordinary.logical,ordinary.target,'sales')).toEqual(expected('ordinary'));
  const absent=setup(source,true);
  expect(inspectRawTableBinding(absent.binding,absent.logical,absent.target,'sales')).toEqual(expected('absent-members'));
  const wrong=setup(source);
  wrong.target.majorVersion=wrong.target.majorVersion+'.1';
  expect(inspectRawTableBinding(wrong.binding,wrong.logical,wrong.target,'sales')).toEqual(expected('wrong-target'));
 }
});

test('V4 Node raw-profile admission preserves getter refusal without invocation',()=>{
 const source=setup(lakebase);let reads=0;
 Object.defineProperty(source.binding,'future',{enumerable:true,get(){reads++;throw new Error('getter invoked');}});
 expect(inspectRawTableBinding(source.binding,source.logical,source.target,'sales')).toEqual({
  valid:false,complete:false,diagnostics:[{code:'NON_JSON',path:'/future',message:'Hidden fields and accessors cannot be serialized faithfully',severity:'error'}],
 });
 expect(reads).toBe(0);
 const fresh=setup(lakebase);
 Object.defineProperty(fresh.target,'platform',{enumerable:true,get(){reads++;throw new Error('getter invoked');}});
 expect(inspectRawTableBinding(fresh.binding,fresh.logical,fresh.target,'sales')).toEqual({
  valid:false,complete:false,diagnostics:[{code:'NON_JSON',path:'/platform',message:'Hidden fields and accessors cannot be serialized faithfully',severity:'error'}],
 });
 expect(reads).toBe(0);
});
