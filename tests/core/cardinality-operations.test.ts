import {test,expect} from 'bun:test';
import {inspectCoreCardinality,declareCoreCardinality,verifyCoreCardinalityDeclaration,type CoreCardinalityRequest} from '../../src/model/cardinality';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {copyJson} from '../../src/model/json';
import {CARDINALITIES,type Document} from '../../src/model/types';
const identity={module:'m',element:'e'};
function model(umf:Document['umf']='0.4.0'):Document{return {umf,id:'author',vocabularies:{future:{version:'1.0.0'}},modules:[{id:'m',namespace:'',elements:[{id:'e',kind:'field',nullability:'required',extensions:{future:{unknown:'9007199254740993'}}},{id:'value',kind:'field',scalarType:'integer',extensions:{}}]}]};}
test('authored Cardinality and item meaning survive serialized verified receipts without source mutation',()=>{
 for(const cardinality of CARDINALITIES)for(const withItem of [false,true]){
  if(withItem&&!['array','map'].includes(cardinality))continue;
  const source=model(),before=structuredClone(source),request:CoreCardinalityRequest={cardinality,...(withItem?{itemType:{module:'m',element:'value',future:{uninterpreted:true}}}:{})},requestBefore=structuredClone(request);
  const receipt=declareCoreCardinality(source,identity,request);expect(source).toEqual(before);expect(request).toEqual(requestBefore);expect(receipt.provenance.origin).toBe('authored');expect(receipt.provenance.nativePath).toBeNull();expect(receipt.target.modules[0]!.elements[0]!.nullability).toBe('required');
  const inspection=inspectCoreCardinality(receipt.target,identity);expect(inspection.provenance).toBe('unverified');expect(inspection.meaning).toEqual({state:'known',cardinality,...(withItem?{itemType:request.itemType!}:{})});
  for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(copyJson(receipt),format),format) as unknown as typeof receipt;expect(verifyCoreCardinalityDeclaration(saved,saved.target)).toEqual(receipt);expect(saved.source).toEqual(source);}
  (inspection.source.modules[0]!.elements[0]!.extensions.future as Record<string,unknown>).unknown='changed';expect(receipt.source).toEqual(source);
 }
});
test('item omission preserves meaning; explicit set or clear retains previous meaning in archived source',()=>{
 const source=model();source.modules[0]!.elements[0]!.cardinality='array';source.modules[0]!.elements[0]!.itemType={module:'m',element:'value',future:{meaning:'opaque'}};
 const keep=declareCoreCardinality(source,identity,{cardinality:'map'});expect(keep.target.modules[0]!.elements[0]!.itemType).toEqual(source.modules[0]!.elements[0]!.itemType);
 try{declareCoreCardinality(source,identity,{cardinality:'one'});throw Error('Expected conflict');}catch(error){expect(error).toMatchObject({code:'CORE_CARDINALITY_CONFLICT'});}
 const clear=declareCoreCardinality(source,identity,{cardinality:'one',itemType:null});expect(Object.hasOwn(clear.target.modules[0]!.elements[0]!,'itemType')).toBe(false);expect(clear.source).toEqual(source);expect(verifyCoreCardinalityDeclaration(clear,clear.target)).toEqual(clear);
 const replace=declareCoreCardinality(source,identity,{cardinality:'array',itemType:{module:'m',element:'e'}});expect(replace.source).toEqual(source);expect(replace.target.modules[0]!.elements[0]!.itemType).toEqual({module:'m',element:'e'});
});
test('legacy, missing, unknown and inapplicable Cardinality inspections never infer native meaning',()=>{
 for(const version of ['0.1.0','0.2.0','0.3.0'] as const)for(const value of ['array',null,42,{future:true}]){const source=model(version);source.modules[0]!.elements[0]!.cardinality=value;expect(inspectCoreCardinality(source,identity).meaning).toEqual({state:'legacy',value});expect(()=>declareCoreCardinality(source,identity,{cardinality:'array'})).toThrow();}
 expect(inspectCoreCardinality(model(),identity).meaning).toEqual({state:'missing'});
 const future=model();future.modules[0]!.elements[0]!.cardinality='future-shape';expect(inspectCoreCardinality(future,identity).meaning).toEqual({state:'unknown',value:'future-shape'});expect(()=>declareCoreCardinality(future,identity,{cardinality:'one'})).toThrow('cannot be overwritten');
 for(const kind of ['record','group']){const source=model();source.modules[0]!.elements[0]!.kind=kind;delete source.modules[0]!.elements[0]!.nullability;expect(inspectCoreCardinality(source,identity).meaning).toEqual({state:'inapplicable'});expect(()=>declareCoreCardinality(source,identity,{cardinality:'one'})).toThrow();}
});
test('invalid requests and item/scalar conflicts fail atomically; no getters execute',()=>{
 for(const request of [null,[],{},'array',{cardinality:'future'},{cardinality:'array',extra:true},{cardinality:'array',itemType:[]},{cardinality:'array',itemType:{module:'missing',element:'x'}},{cardinality:'one',itemType:{module:'m',element:'value'}}]){const source=model(),before=structuredClone(source);expect(()=>declareCoreCardinality(source,identity,request as CoreCardinalityRequest)).toThrow();expect(source).toEqual(before);}
 const scalar=model();scalar.modules[0]!.elements[0]!.scalarType='integer';expect(()=>declareCoreCardinality(scalar,identity,{cardinality:'array',itemType:{module:'m',element:'value'}})).toThrow();expect(scalar.modules[0]!.elements[0]!.scalarType).toBe('integer');
 let calls=0;const request={cardinality:'array'};Object.defineProperty(request,'itemType',{enumerable:true,get(){calls++;return null;}});expect(()=>declareCoreCardinality(model(),identity,request as CoreCardinalityRequest)).toThrow();expect(calls).toBe(0);
 expect(()=>inspectCoreCardinality(model(),{module:'m',element:'missing'})).toThrow();expect(()=>inspectCoreCardinality(model(),{...identity,other:true} as typeof identity)).toThrow();
});
test('forged or stale author receipts cannot confer provenance',()=>{
 const receipt=declareCoreCardinality(model(),identity,{cardinality:'array',itemType:{module:'m',element:'value'}});
 for(const mutate of [(r:typeof receipt)=>{r.request.itemType=null;},(r:typeof receipt)=>{r.provenance.cardinality='map';},(r:typeof receipt)=>{r.target.modules[0]!.elements[0]!.itemType={module:'m',element:'e'};},(r:typeof receipt)=>{r.provenance.idealPath='/wrong';}]){const forged=structuredClone(receipt);mutate(forged);expect(()=>verifyCoreCardinalityDeclaration(forged,receipt.target)).toThrow();}
 const current=structuredClone(receipt.target);current.modules[0]!.elements[1]!.description='Later meaning';expect(()=>verifyCoreCardinalityDeclaration(receipt,current)).toThrow('changed');
 const reordered=JSON.parse(JSON.stringify(receipt));reordered.request={itemType:receipt.request.itemType,cardinality:receipt.request.cardinality};expect(verifyCoreCardinalityDeclaration(reordered,receipt.target)).toEqual(receipt);
});
