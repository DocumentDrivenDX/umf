import {describe,expect,test} from 'bun:test';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import vm from 'node:vm';
import * as v4 from '../../src/index-node-v4.ts';

const root=resolve(import.meta.dir,'../..');
const manifest=JSON.parse(await readFile(resolve(root,'fixtures/arrow/ipc-inputs/manifest.json'),'utf8'));
const outcome=fn=>{try{return{kind:'return',value:fn()};}catch(error){return{kind:'throw',error};}};

describe('V4 Node Arrow IPC Rust ownership',()=>{
 test('preserves exact source bytes and incomplete validity across the frozen corpus',async()=>{
  expect(manifest.cases).toHaveLength(18);
  for(const row of manifest.cases){
   const bytes=new Uint8Array(await readFile(resolve(root,'fixtures/arrow/ipc-inputs',row.file))),original=bytes.slice();
   const captured=v4.captureArrowIpc(bytes,{id:row.file});
   expect(captured.id).toBe(row.file);
   expect(captured.vocabularies['umf.arrow.ipc']?.version).toBe('0.1.0');
   expect(v4.inspectArrowIpcCapture(captured)).toMatchObject({valid:true,complete:false});
   expect([...v4.exportArrowIpcCapture(captured)]).toEqual([...original]);
   bytes.fill(0);
   expect([...v4.exportArrowIpcCapture(captured)]).toEqual([...original]);
  }
 },120000);

 test('retains host admission refusals, error class, and caller exception identity',()=>{
  const cases=[
   ['wrong-class',[],{get id(){throw Error('must not read id');}}],
   ['cross-realm',vm.runInNewContext('new Uint8Array([1])'),{get id(){throw Error('must not read id');}}],
   ['oversize',new Uint8Array(1_000_001),{get id(){throw Error('must not read id');}}],
   ['invalid-id',new Uint8Array([1]),{id:3}],
  ];
  for(const [name,bytes,options] of cases){
   const actual=outcome(()=>v4.captureArrowIpc(bytes,options));
   expect(actual.kind,name).toBe('throw');
   expect(actual.error,name).toBeInstanceOf(v4.UmfError);
   expect(actual.error.code,name).toBe(name==='invalid-id'?'ARROW_IPC_CAPTURE':'ARROW_IPC_LIMIT');
  }
  expect(v4.inspectArrowIpcCapture({})).toMatchObject({valid:false,complete:false});
  const invalidExport=outcome(()=>v4.exportArrowIpcCapture({}));
  expect(invalidExport.kind).toBe('throw');expect(invalidExport.error).toBeInstanceOf(v4.UmfError);expect(invalidExport.error.code).toBe('ARROW_IPC_CAPTURE');

  const iteratorSentinel={source:'iterator'};
  class ThrowingBytes extends Uint8Array{[Symbol.iterator](){throw iteratorSentinel;}}
  expect(outcome(()=>v4.captureArrowIpc(new ThrowingBytes([1]),{id:'iterator'})).error).toBe(iteratorSentinel);
  const getterSentinel={source:'id getter'};
  expect(outcome(()=>v4.captureArrowIpc(new Uint8Array([1]),{get id(){throw getterSentinel;}})).error).toBe(getterSentinel);
  const eventLog=[];
  class OrderedBytes extends Uint8Array{[Symbol.iterator](){eventLog.push('iterate');return super[Symbol.iterator]();}}
  v4.captureArrowIpc(new OrderedBytes([1]),{get id(){eventLog.push('id');return'ordered';}});
  expect(eventLog).toEqual(['iterate','id']);
 });

 test('recovers invalid native input without changing its authoritative bytes',()=>{
  const invalid=new Uint8Array([0,1,2,3,255]),captured=v4.captureArrowIpc(invalid,{id:'invalid-source'});
  expect(v4.inspectArrowIpcCapture(captured)).toMatchObject({valid:true,complete:false});
  expect([...v4.exportArrowIpcCapture(captured)]).toEqual([...invalid]);
 });

 test('detaches both capture input and exported byte buffers',()=>{
  const input=new Uint8Array([1,2,3]),captured=v4.captureArrowIpc(input,{id:'copy'});input.fill(0);
  expect([...v4.exportArrowIpcCapture(captured)]).toEqual([1,2,3]);
  const exported=v4.exportArrowIpcCapture(captured);exported.fill(0);
  expect([...v4.exportArrowIpcCapture(captured)]).toEqual([1,2,3]);
 });
});
