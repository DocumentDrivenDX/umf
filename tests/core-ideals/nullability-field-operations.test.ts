import {test,expect} from 'bun:test';
import {nullabilityFieldOperationsCases} from '../../scripts/core-ideals/nullability-field-operations-cases';
import {declareCoreElementKind,inspectCoreElementKind,verifyCoreKindDeclaration} from '../../src/model/field-kind';
import {declareCoreRecordType,verifyCoreRecordTypeDeclaration} from '../../src/model/record-type';
import {declareCoreNullability} from '../../src/model/nullability';
import {selectCoreElements} from '../../src/model/selection';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {copyJson} from '../../src/model/json';

test('versioned kind and record type receipts preserve availability, recursion and native content',()=>{
 for(const row of nullabilityFieldOperationsCases()){
  const before=structuredClone(row.source),version=row.source.umf==='0.3.0'?'2.0.0':'1.0.0';
  const field=declareCoreElementKind(row.source,row.field,'field'),record=declareCoreElementKind(row.source,row.record,'record');
  expect(inspectCoreElementKind(row.source,row.field).version).toBe(version);
  expect(field.version).toBe(version);expect(field.provenance.binding.version).toBe(version);
  const result=declareCoreRecordType(field,record);
  expect(result.version).toBe(version);expect(result.provenance.binding.version).toBe(version);
  expect(result.reference).toEqual({role:'record-type',...row.record});
  expect(result.target.modules[0]!.elements[1]!.nullability).toBe(row.source.modules[0]!.elements[1]!.nullability);
  expect(result.target.modules[0]!.elements[1]!.extensions).toEqual(row.source.modules[0]!.elements[1]!.extensions);
  expect(selectCoreElements(result.target,{identities:[row.field],references:'transitive'}).selection.length).toBe(row.variant==='recursive'?2:3);
  for(const format of ['json','yaml'] as const){
   const restored=readJsonValue(writeJsonValue(copyJson(result),format),format) as unknown as typeof result;
   expect(verifyCoreRecordTypeDeclaration(restored,restored.target)).toEqual(result);
   expect(verifyCoreKindDeclaration(restored.fieldAuthor,restored.source)).toEqual(field);
  }
  expect(row.source).toEqual(before);
 }
});
test('availability prevents role erasure and receipts refuse changed versions, sources and provenance',()=>{
 for(const row of nullabilityFieldOperationsCases().filter(row=>row.source.umf==='0.3.0')){
  for(const kind of ['record','group'] as const)expect(()=>declareCoreElementKind(row.source,row.field,kind)).toThrow();
  const field=declareCoreElementKind(row.source,row.field,'field'),record=declareCoreElementKind(row.source,row.record,'record');
  const result=declareCoreRecordType(field,record);
  for(const mutate of [()=>{result.version='1.0.0';},()=>{result.fieldAuthor.version='1.0.0';},()=>{result.provenance.recordPath='/wrong';},()=>{result.source.modules[0]!.elements[1]!.nullability='unspecified';}]){
   const fresh=structuredClone(result);mutate();if(JSON.stringify(fresh)!==JSON.stringify(result))expect(()=>verifyCoreRecordTypeDeclaration(result,result.target)).toThrow();Object.assign(result,fresh);
  }
  const old=structuredClone(row.source);old.umf='0.2.0';expect(()=>declareCoreRecordType(field,declareCoreElementKind(old,row.record,'record'))).toThrow();
  const changed=structuredClone(result.target);changed.future=true;expect(()=>verifyCoreRecordTypeDeclaration(result,changed)).toThrow();
  const scalar=structuredClone(row.source);scalar.modules[0]!.elements[1]!.scalarType='string';expect(()=>declareCoreRecordType(declareCoreElementKind(scalar,row.field,'field'),declareCoreElementKind(scalar,row.record,'record'))).toThrow();
  expect(()=>declareCoreRecordType(declareCoreElementKind(result.target,row.field,'field'),declareCoreElementKind(result.target,row.record,'record'))).toThrow();
 }
});
test('new roles allow availability authoring, with whole-document receipt freshness',()=>{
 const row=nullabilityFieldOperationsCases().find(row=>row.source.umf==='0.3.0')!;
 delete row.source.modules[0]!.elements[1]!.nullability;delete row.source.modules[0]!.elements[1]!.kind;
 const field=declareCoreElementKind(row.source,row.field,'field'),availability=declareCoreNullability(field.target,row.field,'required');
 expect(availability.target.modules[0]!.elements[1]!.nullability).toBe('required');
 expect(()=>verifyCoreKindDeclaration(field,availability.target)).toThrow();
 expect(verifyCoreKindDeclaration(declareCoreElementKind(availability.target,row.field,'field'),availability.target).version).toBe('2.0.0');
});
