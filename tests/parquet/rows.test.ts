import {test,expect} from 'bun:test';
import {captureParquet,exportParquetCapture,assembleParquetRows,decodeParquetPhysical,coreSchema,parquetRowsSchema} from '../../src';
import {createValidator} from '../../src/validation/schema';
const ajv=createValidator();ajv.addSchema(coreSchema);const validate=ajv.compile(parquetRowsSchema);
test('US-019-AC18: assembled corpus rows match native-value evidence without source changes',async()=>{
 const m=await Bun.file('fixtures/parquet/rows/results.json').json();expect(m.assembled).toBe(44);for(const c of m.results){const input=new Uint8Array(await Bun.file(c.path).arrayBuffer()),r=assembleParquetRows(captureParquet(input,{id:c.id}));expect(r.status).toBe(c.status);expect(validate(r)).toBe(true);expect(exportParquetCapture(r.source)).toEqual(input);if(r.rows)expect(r.rows).toEqual(await Bun.file('fixtures/parquet/rows/'+c.id+'.json').json());expect(r.complete).toBe(false);}
},30000);
test('US-019-AC18: inconsistent shared columns and row-node expansion cannot publish partial rows',async()=>{
 const m=await Bun.file('fixtures/parquet/rows/authored/manifest.json').json();expect(m.cases).toHaveLength(7);
 function native(v:any):any {return v===null?null:v.kind==='physical'?Number(v.value.value):v.kind==='repeated'?v.items.map(native):Object.fromEntries(v.fields.map((f:any)=>[f.name,native(f.value)]));}
 for(const c of m.cases){const input=new Uint8Array(await Bun.file(c.path).arrayBuffer()),source=captureParquet(input,{id:c.id});expect(decodeParquetPhysical(source).status).toBe('decoded');const r=assembleParquetRows(source);expect(r.status).toBe(c.status);expect(validate(r)).toBe(true);expect(exportParquetCapture(r.source)).toEqual(input);if(r.rows)expect(r.rows.map(native)).toEqual(c.nativeRows);else{expect(r.rows).toBeUndefined();expect(r.diagnostics.at(-1)!.code).toBe('PARQUET_ROW_ASSEMBLY');}}
},30000);
