import {test,expect} from 'bun:test';
import {createValidator} from '../../src/validation/schema';
import schema from '../../spec/extensions/parquet/experimental-values.schema.json';
const validate=createValidator().compile(schema);
import {readParquetValuesTrial} from '../../scripts/experiments/parquet-values';
test('US-019-AC12 experiment: exact nested decimals, ordered maps, hostile names and temporal meaning match native values',async()=>{
 const base='fixtures/parquet/values-trial/',m=await Bun.file(base+'manifest.json').json();expect(m.cases).toHaveLength(4);
 for(const c of m.cases){const bytes=await Bun.file(c.path).arrayBuffer(),before=new Uint8Array(bytes).slice(),values=await readParquetValuesTrial(bytes);expect(validate(values)).toBe(true);expect(values).toEqual(await Bun.file(base+c.id+'.expected.json').json());expect(new Uint8Array(bytes)).toEqual(before);
  const fields=Object.fromEntries(values[0].fields.map((f:any)=>[f.name,f.value]));expect(fields.__proto__).toEqual({kind:'string',value:'own property'});expect(fields.ordered.entries).toHaveLength(4);expect(fields.ordered.entries.slice(0,2).map((e:any)=>e.key.value)).toEqual(['same','same']);expect(fields.ordered.entries.slice(0,2).map((e:any)=>e.value.value)).toEqual(['1.0000','2.0000']);expect(fields['integer.keys'].entries.map((e:any)=>e.key.value)).toEqual(['7','7','-1']);expect(fields['nested.decimals'].items[0].value).toBe('-9999999999999999.1234');expect(fields.large.value).toBe('18446744073709551615');expect(fields.clock.fields.slice(0,2).map((f:any)=>f.value.isAdjustedToUTC)).toEqual([false,true]);
 }
});
