import {test,expect} from 'bun:test';
import {captureArrowIpc,exportArrowIpcCapture,observeArrowIpcCapture,inspectArrowIpcCapture,readDocument,writeDocument,ARROW_IPC_MAX_BYTES} from '../../src';
import {observationBackend} from '../../native/arrow/runtime';
const manifest=await Bun.file('fixtures/arrow/ipc-inputs/manifest.json').json();
test('US-016-AC5: every native IPC fixture survives both serializations, including unsupported types',async()=>{
 let observed=0;
 for(const c of manifest.cases){const bytes=new Uint8Array(await Bun.file('fixtures/arrow/ipc-inputs/'+c.file).arrayBuffer());const doc=captureArrowIpc(bytes,{id:c.file});
  expect(inspectArrowIpcCapture(doc).valid).toBe(true);expect(inspectArrowIpcCapture(doc).complete).toBe(false);
  for(const format of ['json','yaml'] as const)expect(exportArrowIpcCapture(readDocument(writeDocument(doc,format),format))).toEqual(bytes);
  const observation=observeArrowIpcCapture(doc,observationBackend);expect(observation.complete).toBe(false);expect(exportArrowIpcCapture(observation.source)).toEqual(bytes);
  if(['listview','largelistview','runendencoded'].includes(c.name))expect(observation.status).toBe('uninterpreted');else {expect(observation.status).toBe('observed');observed++;}
 }
 expect(observed).toBe(12);
},20000);
test('US-016-AC5: invalid input and trailing bytes survive without a native-validity claim',async()=>{
 const valid=new Uint8Array(await Bun.file('fixtures/arrow/ipc-inputs/int64.stream.arrow').arrayBuffer());
 const trailing=new Uint8Array(valid.length+3);trailing.set(valid);trailing.set([0,255,7],valid.length);
 for(const bytes of [new Uint8Array(),new Uint8Array([0,255,0]),valid.slice(0,20),trailing]){
  const doc=captureArrowIpc(bytes,{id:'uninterpreted'});expect(exportArrowIpcCapture(doc)).toEqual(bytes);expect(inspectArrowIpcCapture(doc).complete).toBe(false);
  const observation=observeArrowIpcCapture(doc,observationBackend);expect(exportArrowIpcCapture(observation.source)).toEqual(bytes);
  expect(observation.status).toBe(bytes===trailing?'observed':'uninterpreted');
 }
});
test('US-016-AC5: input, output and backend mutations cannot alter authoritative captured bytes',()=>{
 const input=new Uint8Array([1,2,3]);const doc=captureArrowIpc(input,{id:'copy'});input.fill(0);
 const output=exportArrowIpcCapture(doc);output.fill(0);expect(exportArrowIpcCapture(doc)).toEqual(new Uint8Array([1,2,3]));
 const result=observeArrowIpcCapture(doc,{identity:'apache-arrow@21.2.0',observe(bytes){bytes.fill(0);throw Error('decoder failed');}});
 expect(result.status).toBe('uninterpreted');expect(exportArrowIpcCapture(result.source)).toEqual(new Uint8Array([1,2,3]));
 (result.source.modules[0]!.elements[0]!.extensions['umf.arrow.ipc'] as any).bytes='ff';expect(exportArrowIpcCapture(doc)).toEqual(new Uint8Array([1,2,3]));
});
test('US-016-AC5: invalid envelopes and unknown representation content cannot silently export',()=>{
 const doc=captureArrowIpc(new Uint8Array([1]),{id:'guard'});const p=doc.modules[0]!.elements[0]!.extensions['umf.arrow.ipc'] as any;
 for(const hex of ['f','xz','FF']){p.bytes=hex;expect(()=>exportArrowIpcCapture(doc)).toThrow();}p.bytes='01';p.future={retain:true};
 expect(readDocument(writeDocument(doc,'yaml'),'yaml')).toEqual(doc);expect(()=>exportArrowIpcCapture(doc)).toThrow('Unknown capture');
 expect(()=>captureArrowIpc(new Uint8Array(ARROW_IPC_MAX_BYTES+1),{id:'oversized'})).toThrow();
});
