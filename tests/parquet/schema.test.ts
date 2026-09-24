import {test,expect} from 'bun:test';
import {captureParquet,exportParquetCapture,inspectParquetSchema,coreSchema,parquetSchemaInspectionSchema} from '../../src';
import {createValidator} from '../../src/validation/schema';
const ajv=createValidator();ajv.addSchema(coreSchema);const check=ajv.compile(parquetSchemaInspectionSchema);
test('US-019-AC7: physical schema trees and levels match native columns',async()=>{
 const base='fixtures/parquet/schema/',m=await Bun.file(base+'manifest.json').json();let leaves=0,rootWarnings=0;
 for(const c of m.results){const bytes=new Uint8Array(await Bun.file(c.path).arrayBuffer()),r=inspectParquetSchema(captureParquet(bytes,{id:c.id}));expect(r.status).toBe('checked');expect(check(r)).toBe(true);const expected=await Bun.file(base+c.id+'.expected.json').json();expect(r.leaves!.map(({index,path,...v})=>({...v,pathString:path.join('.')}))).toEqual(expected.leaves);expect(exportParquetCapture(r.source)).toEqual(bytes);expect(r.complete).toBe(false);leaves+=r.leaves!.length;rootWarnings+=r.diagnostics.filter(d=>d.code==='PARQUET_ROOT_REPETITION').length;}
 expect(leaves).toBe(1813);expect(rootWarnings).toBe(4);
});
test('US-019-AC7: inconsistent topology/links block; literal dots remain path components',async()=>{
 const m=await Bun.file('fixtures/parquet/schema/negative/manifest.json').json();expect(m.cases).toHaveLength(13);for(const c of m.cases){const bytes=new Uint8Array(await Bun.file(c.path).arrayBuffer()),r=inspectParquetSchema(captureParquet(bytes,{id:c.id}));expect(r.status).toBe(c.expected);expect(check(r)).toBe(true);expect(exportParquetCapture(r.source)).toEqual(bytes);if(c.expected==='blocked'){expect(r.tree).toBeUndefined();expect(r.leaves).toBeUndefined();expect(r.diagnostics.some(d=>d.code==='PARQUET_SCHEMA_STRUCTURE')).toBe(true);}else expect(r.leaves![0]!.path).toEqual(['stats','value.with.dot']);}
});
