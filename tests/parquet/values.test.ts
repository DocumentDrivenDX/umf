import {test,expect} from 'bun:test';
import {captureParquet,exportParquetCapture,decodeParquetValues,coreSchema,parquetValuesSchema} from '../../src';
import {createValidator} from '../../src/validation/schema';
const ajv=createValidator();ajv.addSchema(coreSchema);const validate=ajv.compile(parquetValuesSchema);
test('US-019-AC19: bounded logical projections match native values and preserve sources',async()=>{
 const m=await Bun.file('fixtures/parquet/values/results.json').json();expect(m.projected).toBe(44);for(const c of m.results){const input=new Uint8Array(await Bun.file(c.path).arrayBuffer()),r=decodeParquetValues(captureParquet(input,{id:c.id}));expect(r.status).toBe(c.status);expect(validate(r)).toBe(true);expect(exportParquetCapture(r.source)).toEqual(input);expect(r.complete).toBe(false);if(r.rows)expect(r.rows).toEqual(await Bun.file('fixtures/parquet/values/'+c.id+'.json').json());}
},30000);
test('US-019-AC19: logical value constraints block while exact/opaque carriers remain available',async()=>{
 const m=await Bun.file('fixtures/parquet/values/authored/manifest.json').json();expect(m.cases).toHaveLength(10);for(const c of m.cases){const input=new Uint8Array(await Bun.file(c.path).arrayBuffer()),r=decodeParquetValues(captureParquet(input,{id:c.id}));expect(r.status).toBe(c.status);expect(validate(r)).toBe(true);expect(exportParquetCapture(r.source)).toEqual(input);if(c.expectedValue)expect((r.rows![0] as any).fields[0].value).toMatchObject(c.expectedValue);else expect(r.rows).toBeUndefined();}
});
test('US-019-AC19: bounded implementation agrees with the prior native nested-decimal/map experiment',async()=>{
 const m=await Bun.file('fixtures/parquet/values-trial/manifest.json').json();function strip(v:any):any {if(v===null)return null;const {physical,index,duplicateKeys,...rest}=v;void physical;void index;void duplicateKeys;return Object.fromEntries(Object.entries(rest).map(([k,v])=>[k,Array.isArray(v)?v.map(strip):v&&typeof v==='object'?strip(v):v]));}
 for(const c of m.cases){const r=decodeParquetValues(captureParquet(new Uint8Array(await Bun.file(c.path).arrayBuffer()),{id:c.id}));expect(r.status).toBe('projected');expect(r.rows!.map(strip)).toEqual(await Bun.file('fixtures/parquet/values-trial/'+c.id+'.expected.json').json());}
});
test('US-019-AC19: logical floating views retain NaN payloads and signed zero exactly',async()=>{
 for(const type of ['float','double']){const r=decodeParquetValues(captureParquet(new Uint8Array(await Bun.file('fixtures/parquet/physical/authored/'+type+'-plain.parquet').arrayBuffer()),{id:type}));expect(r.status).toBe('projected');const values=r.rows!.map((r:any)=>r.fields[0].value);expect(values.map(v=>v.value)).toEqual(['-0','NaN','Infinity','-Infinity','1.25']);expect(values[1].physical.hex).toBe(type==='float'?'4523c17f':'bc9a78563412f87f');expect(validate(r)).toBe(true);}
});
test('US-019-AC19: JSON syntax validation preserves duplicates/exact text and bounds structure',async()=>{
 const {checkParquetJsonText}=await import('../../src/adapters/parquet/json-text');for(const s of ['{"n":9007199254740993,"n":-0}','[1e9999,true,false,null,"\\ud800"]','{}','[]',' "text" '])expect(()=>checkParquetJsonText(s)).not.toThrow();for(const s of ['[1,]','{"x":1,}','01','"\\q"','[','{"x" 1}','['.repeat(130)+'0'+']'.repeat(130),'['+'0,'.repeat(100000)+'0]'])expect(()=>checkParquetJsonText(s)).toThrow();
});
