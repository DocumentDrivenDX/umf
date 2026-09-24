import {test,expect} from 'bun:test';
import {importSparkSchema,inspectSpark,exportSparkSchema} from '../../src';
test('US-017-AC2: parameter diagnostics preserve source and distinguish configuration constraints',async()=>{
 const cases=await Bun.file('fixtures/spark/parameter-cases.json').json();
 const expected=[[],['DECIMAL_PRECISION'],['DECIMAL_SCALE'],['DECIMAL_NEGATIVE_SCALE'],[],['PARAMETER_INT32','DECIMAL_PRECISION'],['PARAMETER_INT32','DECIMAL_NEGATIVE_SCALE'],[],[],[],['PARAMETER_INT32'],['PARAMETER_INT32'],[],['INTERVAL_RANGE'],[],['INTERVAL_RANGE'],['INTERVAL_RANGE'],['INTERVAL_RANGE']];expect(cases.length).toBe(expected.length);
 for(const [i,c] of cases.entries()){const text=JSON.stringify(c.input),doc=importSparkSchema(text,{id:c.id}),result=inspectSpark(doc);expect(result.valid).toBe(true);expect(result.complete).toBe(false);expect(exportSparkSchema(doc)).toBe(text);expect(result.diagnostics.filter(d=>!['SPARK_NATIVE_UNVERIFIED'].includes(d.code)).map(d=>d.code)).toEqual(expected[i]!.map(s=>'SPARK_'+s));}
 const nested=importSparkSchema('{"type":"array","containsNull":true,"elementType":"decimal(39,0)"}',{id:'nested'});expect(inspectSpark(nested).diagnostics.find(d=>d.code==='SPARK_DECIMAL_PRECISION')?.path).toBe('/elementType');
});
