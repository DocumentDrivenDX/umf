import {describe,expect,test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {captureArrowIpc as captureTs,exportArrowIpcCapture as exportTs,inspectArrowIpcCapture as inspectTs,ARROW_IPC_MAX_BYTES} from '../../src/adapters/arrow/capture.ts';
import * as v4 from '../../src/index-node-v4.ts';

const root=resolve(import.meta.dir,'../..');
const manifest=JSON.parse(await readFile(resolve(root,'fixtures/arrow/ipc-inputs/manifest.json'),'utf8'));
const outcome=fn=>{try{return{kind:'return',value:fn()};}catch(error){return{kind:'throw',error};}};
const errorView=error=>({constructor:error?.constructor?.name,name:error?.name,code:error?.code??null,path:error?.path??null,message:String(error?.message??error)});

describe('V4 Node Arrow IPC Rust source selection',()=>{
 test('selects Rust for exact capture, inspection, and export across the frozen corpus',async()=>{
  expect(manifest.cases).toHaveLength(18);
  for(const row of manifest.cases){
   const bytes=new Uint8Array(await readFile(resolve(root,'fixtures/arrow/ipc-inputs',row.file)));
   const expected=captureTs(bytes,{id:row.file});
   const actual=v4.captureArrowIpc(bytes,{id:row.file});
   expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
   expect(v4.inspectArrowIpcCapture(actual)).toEqual(inspectTs(expected));
   expect([...v4.exportArrowIpcCapture(actual)]).toEqual([...exportTs(expected)]);
   bytes.fill(0);
   expect([...v4.exportArrowIpcCapture(actual)]).toEqual([...exportTs(expected)]);
  }
 },120000);

 test('preserves predecessor host admission, error class, and caller exception identity',()=>{
  const cases=[
   ['wrong-class',[],{get id(){throw Error('must not read id');}}],
   ['cross-realm',vm.runInNewContext('new Uint8Array([1])'),{get id(){throw Error('must not read id');}}],
   ['oversize',new Uint8Array(ARROW_IPC_MAX_BYTES+1),{get id(){throw Error('must not read id');}}],
   ['invalid-id',new Uint8Array([1]),{id:3}],
  ];
  for(const [name,bytes,options] of cases){
   const expected=outcome(()=>captureTs(bytes,options)),actual=outcome(()=>v4.captureArrowIpc(bytes,options));
   expect(expected.kind,name).toBe('throw');expect(actual.kind,name).toBe('throw');
   expect(errorView(actual.error),name).toEqual(errorView(expected.error));
   expect(actual.error).toBeInstanceOf(v4.UmfError);
  }
  expect(v4.inspectArrowIpcCapture({})).toEqual(inspectTs({}));
  for(const [name,reference,selected] of [
   ['export-invalid-document',()=>exportTs({}),()=>v4.exportArrowIpcCapture({})],
  ]){
   const expected=outcome(reference),actual=outcome(selected);
   expect(expected.kind,name).toBe('throw');expect(actual.kind,name).toBe('throw');
   expect(errorView(actual.error),name).toEqual(errorView(expected.error));
   expect(actual.error,name).toBeInstanceOf(v4.UmfError);
  }
  const iteratorSentinel={source:'iterator'};
  class ThrowingBytes extends Uint8Array{[Symbol.iterator](){throw iteratorSentinel;}}
  for(const capture of [captureTs,v4.captureArrowIpc]){
   const result=outcome(()=>capture(new ThrowingBytes([1]),{id:'iterator'}));
   expect(result.error).toBe(iteratorSentinel);
  }
  const getterSentinel={source:'id getter'};
  for(const capture of [captureTs,v4.captureArrowIpc]){
   const result=outcome(()=>capture(new Uint8Array([1]),{get id(){throw getterSentinel;}}));
   expect(result.error).toBe(getterSentinel);
  }
  const eventLog=[];
  class OrderedBytes extends Uint8Array{[Symbol.iterator](){eventLog.push('iterate');return super[Symbol.iterator]();}}
  v4.captureArrowIpc(new OrderedBytes([1]),{get id(){eventLog.push('id');return'ordered';}});
  expect(eventLog).toEqual(['iterate','id']);
 });

 test('keeps caller-owned capture data detached through mutation',()=>{
  const input=new Uint8Array([1,2,3]);
  const captured=v4.captureArrowIpc(input,{id:'copy'});input.fill(0);
  expect([...v4.exportArrowIpcCapture(captured)]).toEqual([1,2,3]);
  const exported=v4.exportArrowIpcCapture(captured);exported.fill(0);
  expect([...v4.exportArrowIpcCapture(captured)]).toEqual([1,2,3]);
 });
});
