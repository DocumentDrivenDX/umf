import {test,expect} from 'bun:test';
import {nullabilitySelectionCases} from '../../scripts/core-ideals/nullability-selection-cases';
import {selectCoreElements} from '../../src/model/selection';
import {verifyCoreElementSelection,coreNullabilitySelectionSchema,coreFieldSelectionSchema} from '../../src/model/selection-verification';
import {inspectCoreNullability} from '../../src/model/nullability';
import {copyJson} from '../../src/model/json';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {createValidator} from '../../src/validation/schema';
import fields from '../../spec/core/field-document.schema.json';
import availability from '../../spec/core/nullability-document.schema.json';
const validator=createValidator();validator.addSchema(fields);validator.addSchema(availability);const check=validator.compile(coreNullabilitySelectionSchema),previous=validator.compile(coreFieldSelectionSchema);
test('0.3 reports retain availability distinctions, namespaces, recursive boundaries and native refinements',()=>{
 for(const c of nullabilitySelectionCases()){
  const result=selectCoreElements(c.source,c.query);expect(check(result)).toBe(true);expect(previous(result)).toBe(false);expect(result.source).toEqual(c.source);
  for(const entry of result.selection){const original=c.source.modules.find(m=>m.id===entry.module)!.elements.find(e=>e.id===entry.element.id)!;expect(entry.element).toEqual(original);}
  for(const format of ['json','yaml'] as const){const receipt=readJsonValue(writeJsonValue(copyJson(result),format),format) as unknown as typeof result;expect(verifyCoreElementSelection(receipt)).toEqual(result);}
 }
 const source=nullabilitySelectionCases()[0]!.source;
 expect(inspectCoreNullability(source,{module:'sales',element:'missing'}).meaning).toEqual({state:'missing'});
 expect(inspectCoreNullability(source,{module:'sales',element:'unspecified'}).meaning).toEqual({state:'known',nullability:'unspecified'});
 expect(inspectCoreNullability(source,{module:'sales',element:'unknown'}).meaning).toEqual({state:'unknown',value:'future-availability'});
 expect(selectCoreElements(source,{identities:[{module:'sales',element:'required'}],references:'transitive'}).selection).toHaveLength(2);
});
test('forged availability, erased native refinements, changed query, diagnostics and boundaries cannot verify',()=>{
 const c=nullabilitySelectionCases()[1]!,result=selectCoreElements(c.source,c.query);
 for(const change of [(r:typeof result)=>{r.selection[1]!.element.nullability='absent-allowed';},(r:typeof result)=>{r.selection[1]!.element.extensions={};},(r:typeof result)=>{r.query.references='none';},(r:typeof result)=>{r.sourceValidation.diagnostics=[];},(r:typeof result)=>{r.selection[1]!.path='/wrong';}]){
  const altered=structuredClone(result);change(altered);expect(()=>verifyCoreElementSelection(altered)).toThrow();
 }
 const boundary=selectCoreElements(c.source,{identities:[{module:'sales',element:'Order'}],references:'none'});boundary.boundaryReferences=[];expect(()=>verifyCoreElementSelection(boundary)).toThrow();
 const malformed=structuredClone(result);malformed.selection[0]!.element.nullability='required';expect(check(malformed)).toBe(false);
});
test('0.2 availability remains opaque through the old selection schema',()=>{
 const source=structuredClone(nullabilitySelectionCases()[0]!.source);source.umf='0.2.0';source.modules[0]!.elements[1]!.nullability={opaque:['required',null]};
 const report=selectCoreElements(source,{references:'none'});expect(previous(report)).toBe(true);expect(check(report)).toBe(false);expect(verifyCoreElementSelection(report)).toEqual(report);expect(inspectCoreNullability(source,{module:'sales',element:'required'}).meaning.state).toBe('legacy');
});
