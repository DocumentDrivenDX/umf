// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {cardinalitySelectionCases} from '../../scripts/core-ideals/cardinality-selection-cases';
import {selectCoreElements, type CoreElementQuery} from '../../src/model/selection';
import {coreCardinalitySelectionSchema, coreNullabilitySelectionSchema} from '../../src/model/selection-schemas';
import {readJsonValue, writeJsonValue} from '../../src/model/serialization';
import {copyJson} from '../../src/model/json';
import {createValidator} from '../../src/validation/schema';
import core from '../../spec/core/schema.json';
import previous from '../../spec/core/schema.json';
const validator=createValidator();validator.addSchema(core);validator.addSchema(previous);const check=validator.compile(coreCardinalitySelectionSchema),old=validator.compile(coreNullabilitySelectionSchema);
test('selection keeps shape and item identity distinct through mixed cycles, boundaries and filters',()=>{
 for(const c of cardinalitySelectionCases()){
  const before=structuredClone(c.source),report=selectCoreElements(c.source,c.query);expect(report.selection.map(e=>e.module+'.'+e.element.id)).toEqual(c.expected);expect(report.boundaryReferences).toHaveLength(c.genericBoundary);expect(report.boundaryItemTypes).toHaveLength(c.itemBoundary);expect(report.referenceScope).toBe('explicit-core-references-item-types-members-and-keys');expect(check(report)).toBe(true);
  for(const entry of report.selection){const original=c.source.modules.find(m=>m.id===entry.module)!.elements.find(e=>e.id===entry.element.id)!;expect(entry.element).toEqual(original);}
  for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(copyJson(report),format),format) as unknown as typeof report;expect(saved).toEqual(report);}
  expect(c.source).toEqual(before);
 }
 const c=cardinalitySelectionCases()[1]!,r=selectCoreElements(c.source,c.query);expect(r.boundaryItemTypes![0]).toEqual({from:{module:'sales',element:'rows'},reference:{module:'sales',element:'row',future:{native:'retained'}},path:'/modules/0/elements/1/itemType',targetPath:'/modules/0/elements/2'});
 r.boundaryItemTypes![0]!.reference.future='mutated';r.selection[0]!.element.itemType={module:'support',element:'value'};expect(c.source.modules[0]!.elements[1]!.itemType).toEqual({module:'sales',element:'row',future:{native:'retained'}});
});
test('retired core markers are refused by current selection operations',()=>{
 const source={...structuredClone(cardinalitySelectionCases()[0]!.source),umf:'0.3.0'} as any;
 expect(()=>selectCoreElements(source,{identities:[{module:'sales',element:'rows'}],references:'transitive'})).toThrow();
});
test('malformed filters, unresolved item targets and getters refuse before traversal',()=>{
 const source=cardinalitySelectionCases()[0]!.source;
 for(const cardinalities of [null,'array',[null],[''],[{}]])expect(()=>selectCoreElements(source,{references:'none',cardinalities} as CoreElementQuery)).toThrow();
 const broken=structuredClone(source);broken.modules[0]!.elements[1]!.itemType={module:'sales',element:'absent'};expect(()=>selectCoreElements(broken,{references:'transitive'})).toThrow('UNRESOLVED_ITEM_TYPE');
 let calls=0;const query={references:'none'};Object.defineProperty(query,'cardinalities',{enumerable:true,get(){calls++;return ['array'];}});expect(()=>selectCoreElements(source,query as CoreElementQuery)).toThrow();expect(calls).toBe(0);
});
