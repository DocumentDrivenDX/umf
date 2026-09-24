import {test,expect} from 'bun:test';
import {createValidator} from '../../src/validation/schema';
import schema from '../../spec/extensions/parquet/hybrid-values.schema.json';
const validate=createValidator().compile(schema);
import {decodeParquetHybrid} from '../../src/adapters/parquet/hybrid';
const bytes=(s:string)=>Uint8Array.from(s.match(/../g)??[],v=>parseInt(v,16));
test('US-019-AC15: hybrid decoding matches independently read native dictionary pages',async()=>{
 const m=await Bun.file('fixtures/parquet/hybrid/manifest.json').json();expect(m.cases).toHaveLength(27);for(const c of m.cases){const input=bytes(c.input),before=input.slice(),r=decodeParquetHybrid(input,c.width,c.values.length);expect(validate(r)).toBe(true);expect(r.values).toEqual(c.values);expect(r.padding).toEqual(c.padding);expect(r.consumedBytes).toBe(input.length);expect(input).toEqual(before);}
});
test('US-019-AC15: unsigned widths, final padding and strict bounds do not allocate from hostile run counts',()=>{
 expect(decodeParquetHybrid(bytes('02ffffffff'),32,1).values).toEqual([4294967295]);expect(decodeParquetHybrid(bytes('03ffffffff00000000000000000000000000000000000000000000000000000000'),32,1).values).toEqual([4294967295]);expect(decodeParquetHybrid(new Uint8Array(),0,0)).toEqual({values:[],consumedBytes:0,padding:[]});
 const bad:[string,number,number,number?][]=[['00',1,1],['01',1,1],['feffffff0f',1,1],['808080808000',1,1],['02',1,1],['0202',1,1],['0401',1,1],['05ffff',1,1],['0300',2,1],['020100',1,1],['0201',1,1,0],['03ff',1,1,0],['',33,1],['',1,100001],['',-1,1],['',1,-1]];for(const [hex,width,count,max] of bad)expect(()=>decodeParquetHybrid(bytes(hex),width,count,max)).toThrow();
});
