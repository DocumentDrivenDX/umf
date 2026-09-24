import {test,expect} from 'bun:test';
import {captureParquet,exportParquetCapture,inspectParquetPages,coreSchema,parquetPagesSchema} from '../../src';
import {createValidator} from '../../src/validation/schema';
const ajv=createValidator();ajv.addSchema(coreSchema);const validate=ajv.compile(parquetPagesSchema);
test('US-019-AC13: page headers and declared budgets match native corpus evidence',async()=>{
 const report=await Bun.file('fixtures/parquet/pages/results.json').json();expect(report.files).toBe(47);expect(report.pages).toBe(2472);
 for(const c of report.results){const bytes=new Uint8Array(await Bun.file(c.path).arrayBuffer()),r=inspectParquetPages(captureParquet(bytes,{id:c.id}));expect(r.status).toBe(c.status);expect(validate(r)).toBe(true);expect(r.pages).toEqual(c.pages);expect(exportParquetCapture(r.source)).toEqual(bytes);expect(r.complete).toBe(false);}
});
test('US-019-AC13: malformed declarations block without decoding payloads; payload corruption remains explicit',async()=>{
 const m=await Bun.file('fixtures/parquet/pages/negative/manifest.json').json();expect(m.cases).toHaveLength(18);
 for(const c of m.cases){const bytes=new Uint8Array(await Bun.file(c.path).arrayBuffer()),r=inspectParquetPages(captureParquet(bytes,{id:c.id}));expect(r.status).toBe(c.expected);expect(validate(r)).toBe(true);expect(exportParquetCapture(r.source)).toEqual(bytes);if(c.expected==='blocked'){expect(r.pages).toBeUndefined();expect(r.diagnostics.some(d=>d.code==='PARQUET_PAGE_BOUNDS')).toBe(true);}if(c.id==='payload-corruption-not-inspected'){expect(c.native).toBe('rejected');expect(r.diagnostics.some(d=>d.code==='PARQUET_PAGE_PAYLOAD_UNVERIFIED')).toBe(true);}}
});
