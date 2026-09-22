import {test,expect} from 'bun:test';
import {cardinalityFieldOperationsCases} from '../../scripts/core-ideals/cardinality-field-operations-cases';
import {declareCoreElementKind,inspectCoreElementKind,verifyCoreKindDeclaration} from '../../src/model/field-kind';
import {declareCoreRecordType,verifyCoreRecordTypeDeclaration} from '../../src/model/record-type';
import {declareCoreNullability,inspectCoreNullability,verifyCoreNullabilityDeclaration} from '../../src/model/nullability';
import {declareCoreCardinality} from '../../src/model/cardinality';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {copyJson} from '../../src/model/json';
import {type Document} from '../../src/model/types';

test('versioned kind and record receipts retain old profiles and preserve 0.4 Cardinality',()=>{
 for(const row of cardinalityFieldOperationsCases()){
  const before=structuredClone(row.source),version=row.source.umf==='0.4.0'?'3.0.0':row.source.umf==='0.3.0'?'2.0.0':'1.0.0';
  const field=declareCoreElementKind(row.source,row.field,'field'),record=declareCoreElementKind(row.source,row.record,'record'),result=declareCoreRecordType(field,record);
  expect(field.version).toBe(version);expect(inspectCoreElementKind(row.source,row.field).version).toBe(version);expect(result.version).toBe(version);expect(result.provenance.binding.version).toBe(version);
  expect(result.target.modules[0]!.elements[1]!.cardinality).toEqual(row.source.modules[0]!.elements[1]!.cardinality);
  expect(result.target.modules[0]!.elements[1]!.nullability).toEqual(row.source.modules[0]!.elements[1]!.nullability);
  expect(result.target.modules[0]!.elements[1]!.extensions).toEqual(row.source.modules[0]!.elements[1]!.extensions);
  for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(copyJson(result),format),format) as unknown as typeof result;expect(verifyCoreRecordTypeDeclaration(saved,saved.target)).toEqual(result);expect(verifyCoreKindDeclaration(saved.fieldAuthor,saved.source)).toEqual(field);}
  expect(row.source).toEqual(before);
 }
});
test('Nullability authoring and inspection use v2 on containers without changing item meaning',()=>{
 for(const umf of ['0.3.0','0.4.0'] as const)for(const cardinality of ['one','array','map','unspecified'])for(const nullability of ['required','absent-allowed','unspecified'] as const){
  const source:Document={umf,id:'availability',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'e',kind:'field',cardinality,...(['array','map'].includes(cardinality)?{itemType:{module:'m',element:'item'}}:{}),extensions:{}},{id:'item',kind:'field',scalarType:'integer',nullability:'required',extensions:{}}]}]};
  const identity={module:'m',element:'e'},result=declareCoreNullability(source,identity,nullability),version=umf==='0.4.0'?'2.0.0':'1.0.0';
  expect(result.version).toBe(version);expect(result.provenance.binding.version).toBe(version);expect(inspectCoreNullability(result.target,identity).meaning).toEqual({state:'known',nullability});expect(inspectCoreNullability(result.target,identity).version).toBe(version);
  expect(result.target.modules[0]!.elements[0]!.cardinality).toBe(cardinality);expect(result.target.modules[0]!.elements[0]!.itemType).toEqual(source.modules[0]!.elements[0]!.itemType);expect(result.target.modules[0]!.elements[1]!).toEqual(source.modules[0]!.elements[1]!);
  for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(copyJson(result),format),format) as unknown as typeof result;expect(verifyCoreNullabilityDeclaration(saved,saved.target)).toEqual(result);}
  const forged=structuredClone(result);forged.version=version==='1.0.0'?'2.0.0':'1.0.0';expect(()=>verifyCoreNullabilityDeclaration(forged,result.target)).toThrow();
 }
});
test('container record meaning belongs on its item Field and dependent kind edits refuse',()=>{
 const row=cardinalityFieldOperationsCases().find(r=>r.source.umf==='0.4.0')!;
 for(const cardinality of ['array','map','future-shape']){const source=structuredClone(row.source);source.modules[0]!.elements[1]!.cardinality=cardinality;expect(()=>declareCoreRecordType(declareCoreElementKind(source,row.field,'field'),declareCoreElementKind(source,row.record,'record'))).toThrow('item/value Field');}
 const source=structuredClone(row.source);source.modules[0]!.elements.push({id:'item',kind:'field',cardinality:'one',extensions:{}});const parent=source.modules[0]!.elements[1]!;parent.cardinality='array';parent.itemType={module:'sales',element:'item'};
 const item={module:'sales',element:'item'},result=declareCoreRecordType(declareCoreElementKind(source,item,'field'),declareCoreElementKind(source,row.record,'record'));
 expect(result.version).toBe('3.0.0');expect(result.target.modules[0]!.elements[1]).toEqual(parent);expect(result.target.modules[0]!.elements.at(-1)!.references).toEqual([{role:'record-type',...row.record}]);
 for(const kind of ['record','group'] as const){expect(()=>declareCoreElementKind(source,item,kind)).toThrow();expect(()=>declareCoreElementKind(source,row.field,kind)).toThrow();}
});
test('cross-version, stale and forged receipts refuse without changing original profiles',()=>{
 const row=cardinalityFieldOperationsCases().find(r=>r.source.umf==='0.4.0')!,field=declareCoreElementKind(row.source,row.field,'field'),record=declareCoreElementKind(row.source,row.record,'record'),receipt=declareCoreRecordType(field,record);
 for(const version of ['1.0.0','2.0.0'] as const){const forged=structuredClone(receipt);forged.version=version;expect(()=>verifyCoreRecordTypeDeclaration(forged,receipt.target)).toThrow();const old=structuredClone(row.source);old.umf=version==='1.0.0'?'0.2.0':'0.3.0';expect(()=>declareCoreRecordType(field,declareCoreElementKind(old,row.record,'record'))).toThrow();}
 const changed=declareCoreCardinality(row.source,row.field,{cardinality:'one'});expect(()=>verifyCoreKindDeclaration(field,changed.target)).toThrow();
 const malformed=structuredClone(receipt);malformed.fieldAuthor.provenance.binding.version='1.0.0';expect(()=>verifyCoreRecordTypeDeclaration(malformed,receipt.target)).toThrow();
 const availability=declareCoreNullability(row.source,row.field,'required'),stale=structuredClone(availability.target);stale.future={meaning:'later'};expect(()=>verifyCoreNullabilityDeclaration(availability,stale)).toThrow();
});
