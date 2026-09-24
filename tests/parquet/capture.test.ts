import {test,expect} from 'bun:test';
import {captureParquet,exportParquetCapture,inspectParquetFraming,readDocument,writeDocument,coreSchema,parquetFramingSchema} from '../../src';
import {createValidator} from '../../src/validation/schema';
const ajv=createValidator();ajv.addSchema(coreSchema);const check=ajv.compile(parquetFramingSchema);
test('US-019-AC1: bounded binary source copies exact bytes including malformed input and preserves unknown representation',()=>{
 for(const bytes of [new Uint8Array(),new Uint8Array([0,255,80,65,82,49])]){const doc=captureParquet(bytes,{id:'malformed'});for(const f of ['json','yaml'] as const)expect(exportParquetCapture(readDocument(writeDocument(doc,f),f))).toEqual(bytes);const r=inspectParquetFraming(doc);expect(r.status).toBe('invalid');expect(check(r)).toBe(true);}
 const bytes=new Uint8Array([1,2]),doc=captureParquet(bytes,{id:'copy'});bytes[0]=255;expect(exportParquetCapture(doc)[0]).toBe(1);const output=exportParquetCapture(doc);output[0]=255;expect(exportParquetCapture(doc)[0]).toBe(1);
 (doc.modules[0]!.elements[0]!.extensions['umf.parquet'] as any).future=true;expect(()=>exportParquetCapture(doc)).toThrow('Unknown capture');expect(readDocument(writeDocument(doc,'yaml'),'yaml')).toEqual(doc);expect(()=>captureParquet(new Uint8Array(1000001),{id:'large'})).toThrow('1000000');
});
test('US-019-AC2: footer region checks do not imply metadata validity or plaintext columns',()=>{
 function file(magic='PAR1',length=1){const b=new Uint8Array(13);b.set(new TextEncoder().encode(magic));new DataView(b.buffer).setUint32(5,length,true);b.set(new TextEncoder().encode(magic),9);return b;}
 for(const magic of ['PAR1','PARE']){const r=inspectParquetFraming(captureParquet(file(magic),{id:magic}));expect(r.status).toBe('located');expect(r.footerRegion).toEqual({offset:4,length:1,mode:magic==='PARE'?'encrypted':'plaintext-or-signed'});expect(r.complete).toBe(false);expect(check(r)).toBe(true);}
 for(const b of [file('PAR1',0),file('PAR1',2),file('PAR1',4294967295),file('NONE'),(()=>{const b=file();b[12]=69;return b;})()])expect(inspectParquetFraming(captureParquet(b,{id:'invalid'})).status).toBe('invalid');
});
test('US-019-AC3: pinned Parquet source hashes survive both UMF serializations',async()=>{
 const r=await Bun.file('fixtures/parquet/capture-results.json').json();expect(r.files).toBe(39);for(const c of r.results){const doc=captureParquet(new Uint8Array(await Bun.file(c.path).arrayBuffer()),{id:c.id});for(const f of ['json','yaml'] as const)expect(new Bun.CryptoHasher('sha256').update(exportParquetCapture(readDocument(writeDocument(doc,f),f))).digest('hex')).toBe(c.sha256);expect(inspectParquetFraming(doc).footerRegion).toEqual(c.footerRegion);}
},60000);
