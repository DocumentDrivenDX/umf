// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {captureParquet,exportParquetCapture,decodeParquetPhysical,coreSchema,parquetPhysicalSchema} from '../../src/index-node-v4';
import {createValidator} from '../../src/validation/schema';
const ajv=createValidator();ajv.addSchema(coreSchema);const check=ajv.compile(parquetPhysicalSchema);
test('US-019-AC17: physical carrier decoding matches independent corpus results',async()=>{
 const m=await Bun.file('fixtures/parquet/physical/results.json').json();expect(m.decoded).toBe(44);for(const c of m.results){const input=new Uint8Array(await Bun.file(c.path).arrayBuffer()),r=decodeParquetPhysical(captureParquet(input,{id:c.id}));expect(r.status).toBe(c.status);expect(check(r)).toBe(true);expect(exportParquetCapture(r.source)).toEqual(input);if(r.pages)expect(r.pages).toEqual(await Bun.file('fixtures/parquet/physical/'+c.id+'.json').json());else expect(r.materializedBytes).toBeUndefined();expect(r.complete).toBe(false);}
},30000);
test('US-019-AC17: native physical boundaries preserve widths, bits, binary and dictionary carriers',async()=>{
 const m=await Bun.file('fixtures/parquet/physical/authored/manifest.json').json();expect(m.cases).toHaveLength(15);for(const c of m.cases){const input=new Uint8Array(await Bun.file(c.path).arrayBuffer()),r=decodeParquetPhysical(captureParquet(input,{id:c.id}));expect(r.status).toBe('decoded');expect(check(r)).toBe(true);expect(r.pages!.at(-1)!.values).toEqual(c.expected);if(c.id.includes('dictionary')){expect(r.pages![0]!.values).toEqual(c.expected);expect(r.pages![0]!.values[0]).not.toBe(r.pages![1]!.values[0]);}}
});
test('US-019-AC17: dictionary range and expansion budgets block without partial values',async()=>{
 const m=await Bun.file('fixtures/parquet/physical/authored/negative.json').json();for(const c of m.cases){const input=new Uint8Array(await Bun.file(c.path).arrayBuffer()),r=decodeParquetPhysical(captureParquet(input,{id:c.id}));expect(r.status).toBe('blocked');expect(r.pages).toBeUndefined();expect(r.materializedBytes).toBeUndefined();expect(r.diagnostics.at(-1)!.message).toContain(c.expectedMessage);expect(exportParquetCapture(r.source)).toEqual(input);expect(check(r)).toBe(true);}
});
