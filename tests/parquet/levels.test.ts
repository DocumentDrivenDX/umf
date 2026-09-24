import {test,expect} from 'bun:test';
import {captureParquet,exportParquetCapture,decodeParquetLevels,coreSchema,parquetLevelsSchema} from '../../src';
import {createValidator} from '../../src/validation/schema';
const ajv=createValidator();ajv.addSchema(coreSchema);const check=ajv.compile(parquetLevelsSchema);
test('US-019-AC16: bounded page-level integration covers existing native files',async()=>{
 const m=await Bun.file('fixtures/parquet/levels/results.json').json();expect(m.decoded).toBe(44);for(const c of m.results){const bytes=new Uint8Array(await Bun.file(c.path).arrayBuffer()),r=decodeParquetLevels(captureParquet(bytes,{id:c.id}));expect(r.status).toBe(c.status);expect(check(r)).toBe(true);expect(exportParquetCapture(r.source)).toEqual(bytes);if(r.pages)expect(r.pages).toEqual(await Bun.file('fixtures/parquet/levels/'+c.id+'.json').json());else expect(r.pages).toBeUndefined();expect(r.complete).toBe(false);}
},30000);
test('US-019-AC16: native-authored required/optional/repeated/list pages and malformed levels',async()=>{
 const m=await Bun.file('fixtures/parquet/levels/authored/manifest.json').json();expect(m.cases).toHaveLength(15);for(const c of m.cases){const bytes=new Uint8Array(await Bun.file(c.path).arrayBuffer()),r=decodeParquetLevels(captureParquet(bytes,{id:c.id}));expect(r.status).toBe(c.status);expect(check(r)).toBe(true);expect(exportParquetCapture(r.source)).toEqual(bytes);if(r.pages){expect(r.pages).toHaveLength(1);expect(r.pages[0]).toMatchObject({repetition:c.repetition,definition:c.definition,valuesOffset:c.valuesOffset,nonNullValues:c.nonNullValues,rowStarts:c.rowStarts});}else expect(r.pages).toBeUndefined();}
});
