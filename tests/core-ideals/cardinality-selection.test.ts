import {test,expect} from 'bun:test';
import {cardinalitySelectionCases} from '../../scripts/core-ideals/cardinality-selection-cases';
import {selectCoreElements,type CoreElementQuery} from '../../src/model/selection';
import {verifyCoreElementSelection,coreCardinalitySelectionSchema,coreNullabilitySelectionSchema} from '../../src/model/selection-verification';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {copyJson} from '../../src/model/json';
import {createValidator} from '../../src/validation/schema';
import core from '../../spec/core/cardinality-document.schema.json';
import previous from '../../spec/core/nullability-document.schema.json';
const validator=createValidator();validator.addSchema(core);validator.addSchema(previous);const check=validator.compile(coreCardinalitySelectionSchema),old=validator.compile(coreNullabilitySelectionSchema);
test('selection keeps shape and item identity distinct through mixed cycles, boundaries and filters',()=>{
 for(const c of cardinalitySelectionCases()){
  const before=structuredClone(c.source),report=selectCoreElements(c.source,c.query);expect(report.selection.map(e=>e.module+'.'+e.element.id)).toEqual(c.expected);expect(report.boundaryReferences).toHaveLength(c.genericBoundary);expect(report.boundaryItemTypes).toHaveLength(c.itemBoundary);expect(report.referenceScope).toBe('explicit-core-references-and-item-types');expect(check(report)).toBe(true);expect(old(report)).toBe(false);
  for(const entry of report.selection){const original=c.source.modules.find(m=>m.id===entry.module)!.elements.find(e=>e.id===entry.element.id)!;expect(entry.element).toEqual(original);}
  for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(copyJson(report),format),format) as unknown as typeof report;expect(verifyCoreElementSelection(saved)).toEqual(report);}
  expect(c.source).toEqual(before);
 }
 const c=cardinalitySelectionCases()[1]!,r=selectCoreElements(c.source,c.query);expect(r.boundaryItemTypes![0]).toEqual({from:{module:'sales',element:'rows'},reference:{module:'sales',element:'row',future:{native:'retained'}},path:'/modules/0/elements/1/itemType',targetPath:'/modules/0/elements/2'});
 r.boundaryItemTypes![0]!.reference.future='mutated';r.selection[0]!.element.itemType={module:'support',element:'value'};expect(c.source.modules[0]!.elements[1]!.itemType).toEqual({module:'sales',element:'row',future:{native:'retained'}});
});
test('forged item paths, missing boundaries, metadata, filters and traversal scope cannot verify',()=>{
 const c=cardinalitySelectionCases()[1]!,report=selectCoreElements(c.source,c.query);
 for(const mutate of [(r:typeof report)=>{r.boundaryItemTypes=[];},(r:typeof report)=>{r.boundaryItemTypes![0]!.targetPath='/wrong';},(r:typeof report)=>{r.boundaryItemTypes![0]!.path='/wrong';},(r:typeof report)=>{r.boundaryItemTypes![0]!.reference.future=null;},(r:typeof report)=>{r.selection[0]!.element.cardinality='map';},(r:typeof report)=>{r.query.cardinalities=['one'];},(r:typeof report)=>{r.referenceScope='explicit-core-references';},(r:typeof report)=>{r.sourceValidation.diagnostics=[];}]){const changed=structuredClone(report);mutate(changed);expect(()=>verifyCoreElementSelection(changed)).toThrow();}
});
test('older item/cardinality members remain opaque and do not add traversal edges',()=>{
 for(const version of ['0.1.0','0.2.0','0.3.0'] as const){const source=structuredClone(cardinalitySelectionCases()[0]!.source);source.umf=version;source.modules[0]!.elements[1]!.itemType={module:'missing',element:'opaque',future:[null]};
  const result=selectCoreElements(source,{identities:[{module:'sales',element:'rows'}],references:'transitive'});expect(result.selection).toHaveLength(1);expect(result.boundaryItemTypes).toBeUndefined();expect(result.referenceScope).toBe('explicit-core-references');expect(verifyCoreElementSelection(result)).toEqual(result);expect(result.selection[0]!.element.itemType).toEqual(source.modules[0]!.elements[1]!.itemType);
  expect(()=>selectCoreElements(source,{cardinalities:['array'],references:'none'})).toThrow('older lookalike members are opaque');
 }
});
test('malformed filters, unresolved item targets and getters refuse before traversal',()=>{
 const source=cardinalitySelectionCases()[0]!.source;
 for(const cardinalities of [null,'array',[null],[''],[{}]])expect(()=>selectCoreElements(source,{references:'none',cardinalities} as CoreElementQuery)).toThrow();
 const broken=structuredClone(source);broken.modules[0]!.elements[1]!.itemType={module:'sales',element:'absent'};expect(()=>selectCoreElements(broken,{references:'transitive'})).toThrow('UNRESOLVED_ITEM_TYPE');
 let calls=0;const query={references:'none'};Object.defineProperty(query,'cardinalities',{enumerable:true,get(){calls++;return ['array'];}});expect(()=>selectCoreElements(source,query as CoreElementQuery)).toThrow();expect(calls).toBe(0);
});
