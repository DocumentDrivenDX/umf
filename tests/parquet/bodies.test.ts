import {test,expect} from 'bun:test';
import {captureParquet,exportParquetCapture,decodeParquetPageBodies,coreSchema,parquetPageBodiesSchema} from '../../src';
import {decodeSnappyBounded} from '../../src/adapters/parquet/snappy';
import {createValidator} from '../../src/validation/schema';
const ajv=createValidator();ajv.addSchema(coreSchema);const validate=ajv.compile(parquetPageBodiesSchema),bytes=(s:string)=>Uint8Array.from(s.match(/../g)??[],h=>parseInt(h,16));
test('US-019-AC14: bounded physical page bodies and CRCs match independent native decompression',async()=>{
 const base='fixtures/parquet/bodies/',report=await Bun.file(base+'results.json').json();expect(report.decoded).toBe(44);
 for(const c of report.results){const original=new Uint8Array(await Bun.file(c.path).arrayBuffer()),r=decodeParquetPageBodies(captureParquet(original,{id:c.id}));expect(r.status).toBe(c.status);expect(validate(r)).toBe(true);expect(exportParquetCapture(r.source)).toEqual(original);expect(r.complete).toBe(false);if(r.pages){expect(r.pages).toEqual(await Bun.file(base+c.id+'.json').json());expect(r.decodedBytes).toBe(c.decodedBytes);}else expect(r.decodedBytes).toBeUndefined();}
},30000);
test('US-019-AC14: Snappy copy/literal variants match native vectors and malformed blocks fail',async()=>{
 const m=await Bun.file('fixtures/parquet/bodies/snappy-vectors.json').json();expect(m.cases).toHaveLength(25);
 for(const c of m.cases){const input=bytes(c.input),before=input.slice(),expected=bytes(c.output);expect(decodeSnappyBounded(input,expected.length)).toEqual(expected);expect(input).toEqual(before);}
 const cases:[string,number][]=[['',0],['ffffffff0f',0],['808080808000',0],['010061',0],['00ff',0],['010100',1],['0500610102',5],['020061',2],['01046162',1],['01fc',1],['05fcffffffff',5],['01',1]];for(const [hex,length] of cases)expect(()=>decodeSnappyBounded(bytes(hex),length)).toThrow();expect(()=>decodeSnappyBounded(bytes('00'),8388609)).toThrow();
});
test('US-019-AC14: actual corrupted bodies fail without publishing partial pages',async()=>{
 const p='fixtures/parquet/pages/negative/payload-corruption-not-inspected.parquet',original=new Uint8Array(await Bun.file(p).arrayBuffer()),r=decodeParquetPageBodies(captureParquet(original,{id:'crc'}));expect(r.status).toBe('blocked');expect(r.diagnostics.at(-1)!.message).toContain('CRC32');expect(r.pages).toBeUndefined();expect(exportParquetCapture(r.source)).toEqual(original);
 const report=await Bun.file('fixtures/parquet/bodies/results.json').json(),c=report.results.find((c:any)=>c.status==='decoded'&&c.id.startsWith('page-')),pages=await Bun.file('fixtures/parquet/bodies/'+c.id+'.json').json(),page=pages.find((p:any)=>p.bodyBytes>0&&p.header.crc===undefined);const input=new Uint8Array(await Bun.file(c.path).arrayBuffer());input[page.bodyOffset]=input[page.bodyOffset]!^1;const corrupt=decodeParquetPageBodies(captureParquet(input,{id:'snappy'}));expect(corrupt.status).toBe('blocked');expect(corrupt.pages).toBeUndefined();expect(corrupt.diagnostics.at(-1)!.message).toContain('Snappy');
});
