import {test,expect} from 'bun:test';
import {nullabilitySelectionCases} from '../../scripts/core-ideals/nullability-selection-cases';
import {selectCoreElements} from '../../src/model/selection';
import {coreNullabilitySelectionSchema} from '../../src/model/selection-schemas';
import {inspectCoreNullability} from '../../src/model/nullability';
import {copyJson} from '../../src/model/json';
import {readJsonValue, writeJsonValue} from '../../src/model/serialization';
import {createValidator} from '../../src/validation/schema';
import fields from '../../spec/core/schema.json';
import availability from '../../spec/core/schema.json';
const validator=createValidator();validator.addSchema(fields);validator.addSchema(availability);const check=validator.compile(coreNullabilitySelectionSchema);
test('current selection reports retain availability distinctions, namespaces, recursive boundaries and native refinements',()=>{
 for(const c of nullabilitySelectionCases()){
  const result=selectCoreElements(c.source,c.query);expect(check(result)).toBe(true);expect(result.source).toEqual(c.source);
  for(const entry of result.selection){const original=c.source.modules.find(m=>m.id===entry.module)!.elements.find(e=>e.id===entry.element.id)!;expect(entry.element).toEqual(original);}
  for(const format of ['json','yaml'] as const){const receipt=readJsonValue(writeJsonValue(copyJson(result),format),format) as unknown as typeof result;expect(receipt).toEqual(result);}
 }
 const source=nullabilitySelectionCases()[0]!.source;
 expect(inspectCoreNullability(source,{module:'sales',element:'missing'}).meaning).toEqual({state:'missing'});
 expect(inspectCoreNullability(source,{module:'sales',element:'unspecified'}).meaning).toEqual({state:'known',nullability:'unspecified'});
 expect(inspectCoreNullability(source,{module:'sales',element:'unknown'}).meaning).toEqual({state:'unknown',value:'future-availability'});
 expect(selectCoreElements(source,{identities:[{module:'sales',element:'required'}],references:'transitive'}).selection).toHaveLength(2);
});
test('selection schema rejects inapplicable known availability',()=>{
 const c=nullabilitySelectionCases()[1]!,result=selectCoreElements(c.source,c.query);
 const malformed=structuredClone(result);malformed.selection[0]!.element.nullability='required';expect(check(malformed)).toBe(false);
});
test('retired core marker and old nullability lookalikes are refused',()=>{
 const source={...structuredClone(nullabilitySelectionCases()[0]!.source),umf:'0.2.0'} as any;
 source.modules[0]!.elements[1]!.nullability={opaque:['required',null]};
 expect(()=>selectCoreElements(source,{references:'none'})).toThrow();expect(()=>inspectCoreNullability(source,{module:'sales',element:'required'})).toThrow();
});
