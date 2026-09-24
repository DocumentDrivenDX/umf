import {test,expect} from 'bun:test';
import {Builder} from 'flatbuffers';
import {decodeArrowFlatbuffer,exportArrowFlatbufferModel,exportArrowIpcCapture,type ArrowFlatbufferRoot} from '../../src';
const base='fixtures/arrow/metadata/';const manifest=await Bun.file(base+'manifest.json').json();
test('US-016-AC7: all real metadata roots decode with exact source retention',async()=>{
 expect(manifest.cases.length).toBe(70);expect([...new Set(manifest.cases.map((c:any)=>c.rootType))].sort()).toEqual(['Footer','Message','Schema','SparseTensor','Tensor']);
 for(const c of manifest.cases){const bytes=new Uint8Array(await Bun.file(base+c.file).arrayBuffer());const result=decodeArrowFlatbuffer(bytes,{id:c.file,rootType:c.rootType as ArrowFlatbufferRoot});
  expect(result.status).toBe('decoded');expect(result.complete).toBe(false);expect(JSON.parse(exportArrowFlatbufferModel(result.model!))).toEqual(await Bun.file(base+c.file+'.umf.json').json());expect(exportArrowIpcCapture(result.source)).toEqual(bytes);
 }
},20000);
test('US-016-AC7: unknown table slots survive in source and produce explicit diagnostics',()=>{
 const builder=new Builder(64);builder.startObject(5);builder.addFieldInt32(4,123,0);const root=builder.endObject();builder.finish(root);const bytes=builder.asUint8Array();
 const result=decodeArrowFlatbuffer(bytes,{id:'future',rootType:'Schema'});expect(result.status).toBe('decoded');expect(result.diagnostics.some(d=>d.code==='ARROW_FLATBUFFER_UNKNOWN_SLOT')).toBe(true);expect(exportArrowIpcCapture(result.source)).toEqual(bytes);expect(()=>exportArrowFlatbufferModel(result.model!)).toThrow('Unknown wire fields');
});
test('US-016-AC7: unknown enums, invalid offsets, malformed vtables and truncated bytes expose no partial model',()=>{
 const builder=new Builder(64);builder.startObject(4);builder.addFieldInt16(0,99,0);builder.finish(builder.endObject());
 const bad=[builder.asUint8Array(),new Uint8Array(),new Uint8Array([255,255,255,255]),new Uint8Array([4,0,0,0,0,0,0,0])];
 for(const bytes of bad){const result=decodeArrowFlatbuffer(bytes,{id:'invalid',rootType:'Schema'});expect(result.status).toBe('uninterpreted');expect(result.model).toBeUndefined();expect(exportArrowIpcCapture(result.source)).toEqual(bytes);}
});
test('US-016-AC7: length and forward-pointer corruption fail without unbounded traversal',async()=>{
 const original=new Uint8Array(await Bun.file(base+manifest.cases[0].file).arrayBuffer());
 for(let length=0;length<original.length;length+=7){const bytes=original.slice(0,length);const result=decodeArrowFlatbuffer(bytes,{id:'truncated',rootType:'Message'});expect(result.complete).toBe(false);expect(exportArrowIpcCapture(result.source)).toEqual(bytes);if(result.status==='uninterpreted')expect(result.model).toBeUndefined();}
 const bytes=original.slice();new DataView(bytes.buffer).setUint32(0,0xffffffff,true);expect(decodeArrowFlatbuffer(bytes,{id:'pointer',rootType:'Message'}).status).toBe('uninterpreted');
});
test('US-016-AC7: corrupt vector count is bounded before allocation',()=>{
 const builder=new Builder(64);builder.startVector(4,0,4);const vector=builder.endVector();builder.startObject(4);builder.addFieldOffset(1,vector,0);builder.finish(builder.endObject());
 const bytes=new Uint8Array(builder.asUint8Array()),view=new DataView(bytes.buffer);const table=view.getUint32(0,true),vt=table-view.getInt32(table,true),field=table+view.getUint16(vt+6,true),target=field+view.getUint32(field,true);view.setUint32(target,0xffffffff,true);
 const result=decodeArrowFlatbuffer(bytes,{id:'vector-count',rootType:'Schema'});expect(result.status).toBe('uninterpreted');expect(result.diagnostics.at(-1)!.message).toContain('traversal limit');expect(exportArrowIpcCapture(result.source)).toEqual(bytes);
});
