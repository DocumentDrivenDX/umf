import {test,expect} from 'bun:test';
import {captureParquet,exportParquetCapture,inspectParquetLogicalTypes,coreSchema,parquetLogicalInspectionSchema} from '../../src';
import {createValidator} from '../../src/validation/schema';
const ajv=createValidator();ajv.addSchema(coreSchema);const check=ajv.compile(parquetLogicalInspectionSchema);
test('US-019-AC8: scalar annotations match native acceptance while preserving all sources',async()=>{
 const base='fixtures/parquet/logical/',m=await Bun.file(base+'manifest.json').json(),existing=await Bun.file('fixtures/parquet/capture-results.json').json();expect(m.cases).toHaveLength(30);
 for(const c of [...m.cases,...existing.results.map((c:any)=>({...c,expected:'checked'}))]){const bytes=new Uint8Array(await Bun.file(c.path).arrayBuffer()),r=inspectParquetLogicalTypes(captureParquet(bytes,{id:c.id}));expect(r.status).toBe(c.expected);expect(check(r)).toBe(true);expect(exportParquetCapture(r.source)).toEqual(bytes);expect(r.complete).toBe(false);if(c.native)expect(r.status==='checked').toBe(c.native.status==='accepted');}
});
test('US-019-AC8: local time meaning, legacy defaults/conflicts and incomplete containers remain explicit',async()=>{
 async function inspect(id:string){return inspectParquetLogicalTypes(captureParquet(new Uint8Array(await Bun.file('fixtures/parquet/logical/'+id+'.parquet').arrayBuffer()),{id}));}
 const local=await inspect('timestamp-local');expect((local.annotations![0]!.parameters as any).isAdjustedToUTC).toBe(false);expect(local.annotations![0]!.validation).toBe('checked');
 const legacy=await inspect('decimal-legacy-default');expect((legacy.annotations![0]!.parameters as any).scale).toBe('0');expect((legacy.metadata as any).schema[1].scale).toBeUndefined();
 const conflict=await inspect('decimal-legacy-conflict');expect(conflict.status).toBe('checked');expect(conflict.diagnostics.some(d=>d.code==='PARQUET_LEGACY_ANNOTATION_CONFLICT')).toBe(true);expect((conflict.annotations![0]!.parameters as any).precision).toBe('5');expect((conflict.metadata as any).schema[1].precision).toBe('4');
 const invalid=await inspect('decimal-fixed-over');expect(invalid.annotations![0]!.validation).toBe('invalid');
 const corpus=await Bun.file('fixtures/parquet/logical/results.json').json();expect(corpus.results.some((r:any)=>r.annotations.some((a:any)=>a.name==='MAP'&&a.validation==='uninterpreted'))).toBe(true);
});
