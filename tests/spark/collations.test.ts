import {test,expect} from 'bun:test';
import {importSparkSchema,inspectSpark,exportSparkSchema} from '../../src';
test('US-017-AC2: field-local collation warnings distinguish target, path, value and provider risks',async()=>{
 const cases=await Bun.file('fixtures/spark/collation-cases.json').json();
 const expected:Record<string,string[]>={valid:[],stale:['UNRESOLVED'],'non-string':['TARGET'],'value-number':['VALUE'],'map-null':['MAP'],'map-array':['MAP'],'bad-provider':['PROVIDER'],'missing-provider':['PROVIDER'],'unknown-name':[],'empty-generated':['UNRESOLVED'],'empty-parser':[],dotted:[],'array-target':['TARGET'],'child-owned':['UNRESOLVED']};
 expect(cases.length).toBe(14);
 for(const c of cases){const text=JSON.stringify(c.input),doc=importSparkSchema(text,{id:c.id}),result=inspectSpark(doc);expect(result.valid).toBe(true);expect(result.complete).toBe(false);expect(exportSparkSchema(doc)).toBe(text);expect(result.diagnostics.filter(d=>d.code.startsWith('SPARK_COLLATION_')).map(d=>d.code)).toEqual(expected[c.id]!.map(s=>'SPARK_COLLATION_'+s));}
});
