import {test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {readDocument,validateCoreDatasetValues,verifyCoreDatasetValues,validateCoreRecordValues,validateDocument} from '../src/index';
import {commerceDataset} from './helpers/commerce-dataset';
const source=readDocument(readFileSync('spec/domain-packs/commerce/ontology.json','utf8'),'json');
const graph=JSON.parse(readFileSync('spec/domain-packs/commerce/graph/fixture.json','utf8'));const input=commerceDataset(source,graph);
const clone=<T>(v:T):T=>structuredClone(v);
test('original commerce0.8 has complete finite dataset context with unchanged public receipts',()=>{
 const before=JSON.stringify({source,input}),result=validateCoreDatasetValues(source,input);
 expect(result.datasetValidation).toEqual({valid:true,complete:true,diagnostics:[]});expect(result.records.length).toBe(11);expect(result.keys.length).toBe(11);expect(result.relationships.length).toBe(10);
 expect(result.documentValidation).toEqual(validateDocument(source));expect(result.source).toEqual(source);expect(result.input).toEqual(input);
 for(let i=0;i<input.records.length;i++){const r=input.records[i]!;expect(result.records[i]!.result).toEqual(validateCoreRecordValues(source,r.identity,r.values));expect(result.records[i]!.result.validation.complete).toBe(false);}
 expect(verifyCoreDatasetValues(result,source,input)).toEqual(result);result.source.id='mutated';expect(JSON.stringify({source,input})).toBe(before);
});
test('duplicate locators, keys, relationships and unresolved/wrong/missing endpoints are invalid',()=>{
 for(const mode of ['record-id','key','edge-id','unresolved','wrong-source','wrong-target','missing-required']){
  const request=clone(input);
  if(mode==='record-id')request.records[1]!.instanceId=request.records[0]!.instanceId;
  if(mode==='key'){const duplicate=clone(request.records[0]!);duplicate.instanceId='distinct-duplicate-key';request.records.push(duplicate);}
  if(mode==='edge-id')request.relationships.push(clone(request.relationships[0]!));
  if(mode==='unresolved')request.relationships[0]!.target.values=[{string:'missing'}];
  if(mode==='wrong-source')request.relationships[0]!.sourceInstanceId=request.records[0]!.instanceId;
  if(mode==='wrong-target')request.relationships[0]!.target.identity.element='customers';
  if(mode==='missing-required')request.relationships.splice(0,1);
  expect(validateCoreDatasetValues(source,request).datasetValidation.valid).toBe(false);
 }
});
test('parallel occurrences preserve bag identity and count distinct associated records',()=>{
 const request=clone(input);request.relationships.push({...clone(request.relationships[0]!),instanceId:'parallel-occurrence'});
 const result=validateCoreDatasetValues(source,request);expect(result.datasetValidation.complete).toBe(true);expect(result.relationships.length).toBe(11);
});
test('unknown, owned/unspecified lifecycle, heterogeneous, undirected and association contexts remain incomplete',()=>{
 for(const mode of ['unknown','owned','unspecified','heterogeneous','undirected','association']){
  const model=clone(source),relationships=model.modules[0]!.relationships as any[];
  if(mode==='unknown')model['x-future-policy']={meaning:'retained'};
  if(mode==='owned')relationships[0].targetLifecycle='owned';
  if(mode==='unspecified')relationships[0].targetLifecycle='unspecified';
  if(mode==='heterogeneous')relationships[0].source.push({module:'domain',element:'orders'});
  if(mode==='undirected')relationships[0].directed=false;
  if(mode==='association')relationships[0].associationRecord={module:'domain',element:'orders'};
  const result=validateCoreDatasetValues(model,input);expect(result.datasetValidation.valid).toBe(true);expect(result.datasetValidation.complete).toBe(false);expect(result.source).toEqual(model);
  expect(result.residuals.length).toBeGreaterThan(0);
 }
});
test('unknown relevant key qualifier stays unresolved rather than inventing dangling/minimum failure',()=>{
 const model=clone(source);(model.modules[0]!.elements[0]!.keys as any[])[0]['future-equality']={meaning:'retained'};
 const result=validateCoreDatasetValues(model,input);
 expect(result.datasetValidation.valid).toBe(true);expect(result.datasetValidation.complete).toBe(false);expect(result.residuals.length).toBeGreaterThan(0);
 expect(result.obligations.map(o=>o.state)).toEqual(['unresolved','unresolved']);
 expect(result.datasetValidation.diagnostics.some(d=>d.code==='DATASET_RELATIONSHIP_MULTIPLICITY')).toBe(false);
});
test('arbitrary original integer domain, required absence and exact public key semantics remain',()=>{
 const request=clone(input),line=request.records.find(r=>r.identity.element==='order_lines')!;
 const quantity=line.values.find(v=>v.field.element==='order_lines.quantity');if(!quantity||quantity.state!=='present')throw Error('Original present quantity required');quantity.value={integerToken:'999999999999999999999999999999999999999999999999999'};
 expect(validateCoreDatasetValues(source,request).datasetValidation.complete).toBe(true);
 const missing=clone(input);missing.records[0]!.values=[];expect(validateCoreDatasetValues(source,missing).datasetValidation.valid).toBe(false);
});
test('closed scope, unknown executable input, accessors, budgets and forged/stale receipts refuse',()=>{
 expect(()=>validateCoreDatasetValues(source,{...input,scope:{id:'open',closure:'global'} as any})).toThrow();
 expect(()=>validateCoreDatasetValues(source,{...input,unknown:true} as any)).toThrow();
 let calls=0;const accessor=Object.defineProperty({...input},'records',{get(){calls++;return input.records;}});expect(()=>validateCoreDatasetValues(source,accessor)).toThrow();expect(calls).toBe(0);
 const oversized=clone(input);oversized.records=Array(1000).fill(input.records[0]!);expect(()=>validateCoreDatasetValues(source,oversized)).toThrow();
 const receipt=validateCoreDatasetValues(source,input);
 for(const mode of ['records','keys','relationships','validation','scope']){
  const forged=clone(receipt);if(mode==='records')forged.records=[];if(mode==='keys')forged.keys=[];if(mode==='relationships')forged.relationships=[];if(mode==='validation')forged.datasetValidation.complete=false;if(mode==='scope')forged.input.scope.id='forged';
  expect(()=>verifyCoreDatasetValues(forged,source,input)).toThrow();
 }
 const changed=clone(source);changed.title='different';expect(()=>verifyCoreDatasetValues(receipt,changed,input)).toThrow();
});

test('actual many-key receipt budget counts repeated public values and hex carriers',()=>{
 const fields=[{id:'large',kind:'field',scalarType:'string',nullability:'required',cardinality:'one',extensions:{}},...Array.from({length:20},(_,i)=>({id:'b'+i,kind:'field',scalarType:'boolean',nullability:'required',cardinality:'one',extensions:{}}))];
 const members=fields.map(f=>({module:'m',element:f.id}));
 const model={umf:'0.8.0',id:'budget-many-keys',vocabularies:{},modules:[{id:'m',namespace:'urn:budget:',elements:[{id:'R',kind:'record',members,keys:Array.from({length:20},(_,i)=>({id:'key'+i,name:'Key'+i,fields:[members[0],members[i+1]]})),extensions:{}},...fields]}]} as any;
 expect(validateDocument(model)).toEqual({valid:true,complete:true,diagnostics:[]});
 const request=(length:number)=>({scope:{id:'bounded-many-keys',closure:'supplied-dataset-only' as const},records:[{instanceId:'one',identity:{module:'m',element:'R'},values:fields.map((f,i)=>({field:{module:'m',element:f.id},state:'present' as const,value:i===0?{string:'a'.repeat(length)}:{boolean:false}}))}],relationships:[]});
 const result=validateCoreDatasetValues(model,request(1000));expect(result.datasetValidation.complete).toBe(true);expect(result.keys.length).toBe(20);
 expect(()=>validateCoreDatasetValues(model,request(70000))).toThrow('receipt-byte budget');
});
