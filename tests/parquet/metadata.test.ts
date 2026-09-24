import {test,expect} from 'bun:test';
import {captureParquet,exportParquetCapture,inspectParquetMetadata,parquetMetadataInspectionSchema,coreSchema} from '../../src';
import {createValidator} from '../../src/validation/schema';
const ajv=createValidator();ajv.addSchema(coreSchema);const check=ajv.compile(parquetMetadataInspectionSchema);
function wrap(footer:number[]){const b=new Uint8Array(footer.length+12);b.set([80,65,82,49]);b.set(footer,4);new DataView(b.buffer).setUint32(b.length-8,footer.length,true);b.set([80,65,82,49],b.length-4);return b;}
const body=[0x15,2,0x19,0x1c,0x15,0xa4,0x13,0x38,1,97,0,0x16,0,0x19,0x0c];
test('US-019-AC6: named metadata matches native generated IDL classes for every fixture',async()=>{
 const base='fixtures/parquet/metadata/',m=await Bun.file(base+'manifest.json').json();expect(m.files).toBe(39);for(const c of m.results){const bytes=new Uint8Array(await Bun.file(c.path).arrayBuffer()),r=inspectParquetMetadata(captureParquet(bytes,{id:c.id}));expect(r.status).toBe('mapped');expect(r.metadata).toEqual(await Bun.file(base+c.id+'.expected.json').json());expect(check(r)).toBe(true);expect(exportParquetCapture(r.source)).toEqual(bytes);expect(r.complete).toBe(false);}
});
test('US-019-AC6: future enum codes and repeated unknown fields survive the named view',()=>{
 const bytes=wrap([...body,0x08,0xc6,1,1,255,0x08,0xc6,1,1,128,0]),r=inspectParquetMetadata(captureParquet(bytes,{id:'unknown'}));expect(r.status).toBe('mapped');expect(r.diagnostics.some(d=>d.code==='PARQUET_ENUM_UNKNOWN')).toBe(true);expect((r.metadata as any).schema[0].type).toBe('1234');expect((r.metadata as any).$unknown).toEqual([{id:99,value:{kind:'binary',hex:'ff'}},{id:99,value:{kind:'binary',hex:'80'}}]);expect(check(r)).toBe(true);expect(exportParquetCapture(r.source)).toEqual(bytes);
});
test('US-019-AC6: missing, duplicate or mistyped known fields block mapping while retaining wire/source',()=>{
 const invalidUtf8=[...body];invalidUtf8[9]=255;const wrongEmptyList=[...body];wrongEmptyList[14]=0x05;
 for(const footer of [[...body,0x05,2,4,0],[0x29,...body.slice(3),0], [...invalidUtf8,0],[...wrongEmptyList,0]]){const bytes=wrap(footer),r=inspectParquetMetadata(captureParquet(bytes,{id:'blocked'}));expect(r.status).toBe('blocked');expect(r.metadata).toBeUndefined();expect(r.wire).toBeDefined();expect(r.diagnostics.some(d=>d.code==='PARQUET_METADATA_SHAPE')).toBe(true);expect(exportParquetCapture(r.source)).toEqual(bytes);expect(check(r)).toBe(true);}
});
