import {test,expect} from 'bun:test';
import {captureParquet,exportParquetCapture,decodeParquetFooter,encodeParquetWire,appendParquetKeyValueMetadata,inspectParquetMetadata,parquetMetadataTransformSchema,coreSchema,type ParquetWireValue} from '../../src';
import {createValidator} from '../../src/validation/schema';
const ajv=createValidator();ajv.addSchema(coreSchema);const check=ajv.compile(parquetMetadataTransformSchema);
function wrap(footer:Uint8Array,trailer=new Uint8Array()){const bytes=new Uint8Array(footer.length+trailer.length+12);bytes.set([80,65,82,49]);bytes.set(footer,4);bytes.set(trailer,footer.length+4);new DataView(bytes.buffer).setUint32(bytes.length-8,footer.length+trailer.length,true);bytes.set([80,65,82,49],bytes.length-4);return captureParquet(bytes,{id:'test'});}
test('US-019-AC10: encoding preserves all native wire observations and guarded metadata transforms preserve data',async()=>{
 const report=await Bun.file('fixtures/parquet/transforms/results.json').json();expect(report.results).toHaveLength(40);
 for(const c of report.results){const bytes=new Uint8Array(await Bun.file(c.path).arrayBuffer()),doc=captureParquet(bytes,{id:c.id}),before=JSON.stringify(doc),wire=decodeParquetFooter(doc).value!,encoded=encodeParquetWire(wire);expect(decodeParquetFooter(wrap(encoded)).value).toEqual(wire);expect(encoded).toEqual(new Uint8Array(await Bun.file('fixtures/parquet/transforms/wire/'+c.id+'.compact').arrayBuffer()));
  if(c.wireOnly)continue;const r=appendParquetKeyValueMetadata(doc,report.additions);expect(r.status).toBe('transformed');expect(check(r)).toBe(true);expect(JSON.stringify(doc)).toBe(before);expect(exportParquetCapture(r.source)).toEqual(bytes);expect(exportParquetCapture(r.output!).subarray(0,r.unchangedPrefixBytes)).toEqual(bytes.subarray(0,r.unchangedPrefixBytes));expect(exportParquetCapture(r.output!)).toEqual(new Uint8Array(await Bun.file('fixtures/parquet/transforms/exports/'+c.id+'.parquet').arrayBuffer()));
  const metadata=inspectParquetMetadata(r.output!).metadata as any;expect(metadata.key_value_metadata.slice(-report.additions.length)).toEqual(report.additions);expect(r.complete).toBe(false);
 }
},30000);
test('US-019-AC10: unsafe metadata edits fail without losing source or publishing output',async()=>{
 const doc=captureParquet(new Uint8Array(await Bun.file('fixtures/parquet/logical/string.parquet').arrayBuffer()),{id:'base'}),tree=decodeParquetFooter(doc).value!;
 const cases:any[][]=[[],[{key:'a'},{key:'a'}],[{key:'bad',value:'\ud800'}],[{key:'unknown',extra:true}],[{key:'undefined',value:undefined}],[{key:'large',value:'x'.repeat(1_000_000)}]];
 for(const entries of cases){const r=appendParquetKeyValueMetadata(doc,entries);expect(r.status).toBe('blocked');expect(r.output).toBeUndefined();expect(check(r)).toBe(true);expect(r.source).toEqual(doc);}
 const first=appendParquetKeyValueMetadata(doc,[{key:'existing',value:'one'}]);expect(first.status).toBe('transformed');expect(appendParquetKeyValueMetadata(first.output!,[{key:'existing',value:'two'}]).status).toBe('blocked');
 for(const field of [{id:777,value:{kind:'binary',hex:'00'}},{id:9,value:{kind:'binary',hex:'00'}}]){const copy=structuredClone(tree);if(copy.kind!=='struct')throw Error();copy.fields.push(field as any);const source=wrap(encodeParquetWire(copy)),r=appendParquetKeyValueMetadata(source,[{key:'a'}]);expect(r.status).toBe('blocked');expect(r.source).toEqual(source);expect(r.output).toBeUndefined();}
 const signed=wrap(encodeParquetWire(tree),new Uint8Array([1,2,3]));expect(appendParquetKeyValueMetadata(signed,[{key:'a'}]).status).toBe('blocked');
 const kept=structuredClone(doc);kept.vocabularies['future.annotation']={version:'1.0.0'};kept.modules[0]!.elements[0]!.extensions['future.annotation']={meaning:'preserve'};const r=appendParquetKeyValueMetadata(kept,[{key:'a'}]);expect(r.output!.modules[0]!.elements[0]!.extensions['future.annotation']).toEqual({meaning:'preserve'});
});
test('US-019-AC10: encoder rejects lossy or oversized wire inputs and preserves UUID bits',()=>{
 const bad:any[]=[{kind:'i64',value:'9223372036854775808'},{kind:'i8',value:'-129'},{kind:'i16',value:'01'},{kind:'binary',hex:'f'},{kind:'double',bits:'00'},{kind:'map',entries:[],keyType:'i32'},{kind:'bool',value:true,extra:1},{kind:'list',elementType:'i32',items:[{kind:'i64',value:'1'}]},{kind:'binary',hex:'00'.repeat(1_000_001)},{kind:'list',elementType:'bool',items:Array.from({length:50000},()=>({kind:'bool',value:true}))}];
 for(const input of bad)expect(()=>encodeParquetWire(input)).toThrow();
 let deep:ParquetWireValue={kind:'bool',value:true};for(let i=0;i<66;i++)deep={kind:'list',elementType:deep.kind,items:[deep]};expect(()=>encodeParquetWire(deep)).toThrow();
 const uuid:ParquetWireValue={kind:'struct',fields:[{id:300,value:{kind:'uuid',hex:'00112233445566778899aabbccddeeff'}}]};expect(decodeParquetFooter(wrap(encodeParquetWire(uuid))).value).toEqual(uuid);
});
