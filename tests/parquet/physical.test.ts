import {test,expect} from 'bun:test';
import {captureParquet,exportParquetCapture,decodeParquetPhysical,coreSchema,parquetPhysicalSchema} from '../../src';
import {decodeParquetPlain} from '../../src/adapters/parquet/plain';
import {createValidator} from '../../src/validation/schema';
const ajv=createValidator();ajv.addSchema(coreSchema);const check=ajv.compile(parquetPhysicalSchema),bytes=(hex:string)=>Uint8Array.from(hex.match(/../g)??[],v=>parseInt(v,16));
test('US-019-AC17: physical carrier decoding matches independent corpus results',async()=>{
 const m=await Bun.file('fixtures/parquet/physical/results.json').json();expect(m.decoded).toBe(44);for(const c of m.results){const input=new Uint8Array(await Bun.file(c.path).arrayBuffer()),r=decodeParquetPhysical(captureParquet(input,{id:c.id}));expect(r.status).toBe(c.status);expect(check(r)).toBe(true);expect(exportParquetCapture(r.source)).toEqual(input);if(r.pages)expect(r.pages).toEqual(await Bun.file('fixtures/parquet/physical/'+c.id+'.json').json());else expect(r.materializedBytes).toBeUndefined();expect(r.complete).toBe(false);}
},30000);
test('US-019-AC17: native physical boundaries preserve widths, bits, binary and dictionary carriers',async()=>{
 const m=await Bun.file('fixtures/parquet/physical/authored/manifest.json').json();expect(m.cases).toHaveLength(15);for(const c of m.cases){const input=new Uint8Array(await Bun.file(c.path).arrayBuffer()),r=decodeParquetPhysical(captureParquet(input,{id:c.id}));expect(r.status).toBe('decoded');expect(check(r)).toBe(true);expect(r.pages!.at(-1)!.values).toEqual(c.expected);expect(decodeParquetPlain(bytes(c.plainHex),c.physicalType,c.count,c.fixedLength??undefined)).toEqual(c.expected);if(c.id.includes('dictionary')){expect(r.pages![0]!.values).toEqual(c.expected);expect(r.pages![0]!.values[0]).not.toBe(r.pages![1]!.values[0]);}}
});
test('US-019-AC17: malformed PLAIN counts, lengths and fixed widths are rejected',()=>{
 for(const [hex,type,count,length] of [['00','INT32',1],['ffffffff','BYTE_ARRAY',1],['01000000','BYTE_ARRAY',1],['00','BOOLEAN',9],['0000','BOOLEAN',1],['','INT64',100001],['','FIXED_LEN_BYTE_ARRAY',1,0],['00','FIXED_LEN_BYTE_ARRAY',1,8],['00','INT96',1],['0000000000','INT32',1]] as [string,string,number,number?][]){expect(()=>decodeParquetPlain(bytes(hex),type,count,length)).toThrow();}
});
test('US-019-AC17: dictionary range and expansion budgets block without partial values',async()=>{
 const m=await Bun.file('fixtures/parquet/physical/authored/negative.json').json();for(const c of m.cases){const input=new Uint8Array(await Bun.file(c.path).arrayBuffer()),r=decodeParquetPhysical(captureParquet(input,{id:c.id}));expect(r.status).toBe('blocked');expect(r.pages).toBeUndefined();expect(r.materializedBytes).toBeUndefined();expect(r.diagnostics.at(-1)!.message).toContain(c.expectedMessage);expect(exportParquetCapture(r.source)).toEqual(input);expect(check(r)).toBe(true);}
});
