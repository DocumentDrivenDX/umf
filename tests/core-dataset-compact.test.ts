import {test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readDocument,validateCoreDatasetValuesCompact,verifyCoreDatasetValuesCompact,validateCoreDatasetValues,validateCoreRecordValues,encodeCoreKeyTuple,validateDocument,coreDatasetValueCompactOperationSchema,coreSchemaPropertiesDocumentSchema,coreDatasetValueOperationSchema} from '../src/index';
import {ValueWork} from '../src/model/internal/value-context';
import {reserveSchemaWork} from '../src/model/internal/schema-work';
import {evaluateCompactWithWork,verifyCompactWithWork} from '../src/model/dataset-values-compact';
import {supplyChainDataset} from './helpers/supply-chain-dataset';
const clone=<T>(v:T):T=>structuredClone(v);
function pack(id:string){const source=readDocument(readFileSync('spec/domain-packs/'+id+'/ontology.json','utf8'),'json'),graph=JSON.parse(readFileSync('spec/domain-packs/'+id+'/graph/fixture.json','utf8'));return {source,graph,input:supplyChainDataset(source,graph)};}
function expand<T extends {sourceRef:'#/source'}>(fragment:T,source:unknown){const {sourceRef,...body}=fragment;return {...body,source};}
for(const name of ['commerce','supply-chain','archaeology','ecology'])test(`original ${name} dataset admits under unchanged limits and expands to original public results`,()=>{
  const {source,graph,input}=pack(name),before=JSON.stringify({source,input}),{receipt:r,work}=evaluateCompactWithWork(source,input);
  expect(r.operation).toBe('validate-core-dataset-values-compact');expect(r.datasetValidation).toEqual({valid:true,complete:true,diagnostics:[]});
  expect(r.records.length).toBe(graph.objects.length);expect(r.relationships.length).toBe(graph.edges.length);expect(work.used).toBeLessThanOrEqual(1_000_000);
  expect(work.categories.copy).toBeGreaterThan(0);expect(work.categories['source-schema-validator-branch']).toBeGreaterThan(0);expect(work.categories['compact-schema-validator-branch']).toBeGreaterThan(0);
  expect(new TextEncoder().encode(JSON.stringify(r)).length).toBeLessThan(4_000_000);
  expect(r.documentValidation).toEqual(validateDocument(source));
  for(const row of r.records){const original=input.records.find(x=>x.instanceId===row.instanceId)!;expect(expand(row.result,r.source)).toEqual(validateCoreRecordValues(source,original.identity,original.values));expect(row.result.validation.complete).toBe(false);}
  for(const row of [...r.keys.map(k=>k.result),...r.relationships.map(e=>e.targetKey)])expect(expand(row,r.source)).toEqual(encodeCoreKeyTuple(source,row.identity,row.values));
  const verified=verifyCompactWithWork(r,source,input);expect(verified.receipt).toEqual(r);expect(verified.work.used).toBeLessThanOrEqual(1_000_000);expect(verified.work.categories['verify-canonical-key-sort']).toBeGreaterThan(0);expect(verifyCoreDatasetValuesCompact(r,source,input)).toEqual(r);expect(JSON.stringify({source,input})).toBe(before);
});
test('full operation remains unchanged and compact context discharge/diagnostics match original full receipts',()=>{
 for(const name of ['commerce','supply-chain']){
  const {source,input}=pack(name),full=validateCoreDatasetValues(source,input),compact=validateCoreDatasetValuesCompact(source,input);
  expect(compact.datasetValidation).toEqual(full.datasetValidation);expect(compact.obligations).toEqual(full.obligations);expect(compact.residuals).toEqual(full.residuals);
  expect(compact.records.map(r=>({instanceId:r.instanceId,result:expand(r.result,compact.source)}))).toEqual(full.records);
  expect(compact.keys.map(r=>({instanceId:r.instanceId,result:expand(r.result,compact.source)}))).toEqual(full.keys);
 }
 for(const name of ['archaeology','ecology']){const {source,input}=pack(name);expect(()=>validateCoreDatasetValues(source,input)).toThrow(/budget exceeded/);}
});
test('present null and original decimal exponent tokens survive while absent and required-null stay different',()=>{
 const {source,input}=pack('archaeology'),r=validateCoreDatasetValuesCompact(source,input);
 expect(r.input.records.flatMap(x=>x.values).filter(v=>v.state==='present'&&v.value===null).length).toBe(13);
 const tokens=r.input.records.flatMap(x=>x.values).filter(v=>v.state==='present'&&v.value!==null&&'decimalToken' in v.value).map(v=>(v as any).value.decimalToken);
 expect(tokens).toContain('2E+1');expect(tokens).toContain('4E+1');
 const changed=clone(input);changed.records[0]!.values[0]={field:changed.records[0]!.values[0]!.field,state:'absent'};
 expect(validateCoreDatasetValuesCompact(source,changed).datasetValidation.valid).toBe(false);
 changed.records[0]!.values[0]={field:changed.records[0]!.values[0]!.field,state:'present',value:null};expect(validateCoreDatasetValuesCompact(source,changed).datasetValidation.valid).toBe(false);
});
test('duplicate keys, unresolved endpoints and parallel identity/multiplicity retain exact original diagnostics',()=>{
 const {source,input}=pack('commerce');
 for(const mode of ['duplicate','unresolved','parallel','missing']){
  const changed=clone(input);if(mode==='duplicate'){const r=clone(changed.records[0]!);r.instanceId='different-key-duplicate';changed.records.push(r);}
  if(mode==='unresolved')changed.relationships[0]!.target.values=[{string:'missing'}];
  if(mode==='parallel'){const r=clone(changed.relationships[0]!);r.instanceId='parallel-original-endpoints';changed.relationships.push(r);}
  if(mode==='missing')changed.relationships=[];
  const c=validateCoreDatasetValuesCompact(source,changed),f=validateCoreDatasetValues(source,changed);expect(c.datasetValidation).toEqual(f.datasetValidation);expect(c.obligations).toEqual(f.obligations);expect(c.relationships.length).toBe(f.relationships.length);
 }
});
test('unknown source meaning/context remains complete in retained bytes and prevents invented completeness',()=>{
 const {source,input}=pack('commerce');(source as any).vocabularies['urn:unknown:preserve']={version:'9.1.2'};(source as any).extensions={'urn:unknown:preserve':{native:{unknown:['雪',null]}}};input.context={unknown:['original',null]};
 const c=validateCoreDatasetValuesCompact(source,input),f=validateCoreDatasetValues(source,input);expect(c.source).toEqual(source);expect(c.input).toEqual(input);expect(c.datasetValidation).toEqual(f.datasetValidation);expect(c.residuals).toEqual(f.residuals);expect(c.datasetValidation.complete).toBe(false);
});
test('forged compact references, original inputs/source and any changed result are refused by complete recomputation',()=>{
 const {source,input}=pack('commerce'),r=validateCoreDatasetValuesCompact(source,input);
 for(const change of [(x:any)=>x.records[0].result.sourceRef='#/input',(x:any)=>x.records[0].result.source=x.source,(x:any)=>x.keys[0].result.bytesHex+='00',(x:any)=>x.relationships[0].targetInstanceId='other',(x:any)=>x.input.scope.id='rescoped',(x:any)=>x.records.reverse(),(x:any)=>x.datasetValidation.diagnostics.push({code:'forged',path:'',message:'false',severity:'warning'})]){
  const bad=clone(r);change(bad);expect(()=>verifyCoreDatasetValuesCompact(bad,source,input)).toThrow();
 }
 const s=clone(source);s.id+='changed';expect(()=>verifyCoreDatasetValuesCompact(r,s,input)).toThrow();
});
test('copy/accessor/version and structural/byte/semantic work limits refuse without partial receipts or raised full guards',()=>{
 const {source,input}=pack('commerce');let calls=0;const accessor=clone(input);Object.defineProperty(accessor,'context',{enumerable:true,get(){calls++;return 'bad';}});expect(()=>validateCoreDatasetValuesCompact(source,accessor)).toThrow();expect(calls).toBe(0);
 const old=clone(source);old.umf='0.7.0';expect(()=>validateCoreDatasetValuesCompact(old,input)).toThrow();
 const bytes=clone(input);bytes.context='x'.repeat(4_000_001);expect(()=>validateCoreDatasetValuesCompact(source,bytes)).toThrow(/bytes exceeded/);
 const structural=clone(input);structural.context=Array.from({length:100001},()=>null);expect(()=>validateCoreDatasetValuesCompact(source,structural)).toThrow(/structural limit/);
 const work=clone(input);work.records=Array.from({length:1000},(_,i)=>({...clone(input.records[0]!),instanceId:'distinct-'+i}));expect(()=>validateCoreDatasetValuesCompact(source,work)).toThrow(/budget exceeded/);
});

test('work admission counts endpoint occurrences inside a single declaration before quadratic presentation scans',()=>{
 const {source,input}=pack('commerce'),changed=clone(source);const relationship=(changed.modules[0]!.relationships as any[])[0]!;
 relationship.source=Array.from({length:800},()=>clone(relationship.source[0]));
 expect(()=>validateCoreDatasetValuesCompact(changed,input)).toThrow(/budget exceeded/);
});

test('malformed copied source shapes refuse through governed source validation rather than TypeError',()=>{
 const {source,input}=pack('commerce');
 for(const mutation of [(s:any)=>s.modules=[null],(s:any)=>s.modules[0].elements=[null],(s:any)=>s.modules[0].relationships=[null],(s:any)=>s.modules[0].elements=[false],(s:any)=>s.modules[0].relationships=[42]]){
  const malformed=clone(source);mutation(malformed);try{validateCoreDatasetValuesCompact(malformed,input);throw Error('Invalid source admitted');}catch(error:any){expect(error.code).toBe('CORE_DATASET_SOURCE');}
 }
 try{validateCoreDatasetValuesCompact(null as any,input);throw Error('Null source admitted');}catch(error:any){expect(error.code).toBe('CORE_DATASET_SOURCE');}
});

test('custom uniqueItems retains governed invalid-source refusal for repeated object references',()=>{
 const {source,input}=pack('commerce'),changed=clone(source),record=changed.modules[0]!.elements.find(e=>e.kind==='record')!;
 record.members=Array.from({length:400},()=>clone((record.members as any[])[0]));
 try{validateCoreDatasetValuesCompact(changed,input);throw Error('Duplicate source admitted');}catch(error:any){expect(error.code).toBe('CORE_DATASET_SOURCE');}
});
test('source declaration byte preflight runs before any expensive literal validation and opaque Unicode stays exact',()=>{
 const {source,input}=pack('commerce'),huge=clone(source);const field=huge.modules[0]!.elements.find(e=>e.kind==='field'&&e.scalarType==='string')!;
 field.examples=[{string:'x'.repeat(4_000_001)}];expect(()=>validateCoreDatasetValuesCompact(huge,input)).toThrow(/serialized bytes exceeded/);
 const unicode=clone(input);unicode.context={quote:'"',slash:'\\',control:'\n',snow:'雪',pair:'😀',unpaired:'\ud800'};
 const r=validateCoreDatasetValuesCompact(source,unicode);expect(r.input.context).toEqual(unicode.context);expect(verifyCoreDatasetValuesCompact(r,source,unicode)).toEqual(r);
});

test('unknown length units retain original diagnostics with growing unrelated unknown qualifiers',()=>{
 const {source,input}=pack('commerce');
 for(const e of source.modules[0]!.elements){(e as any).opaque=Object.fromEntries(Array.from({length:4},(_,i)=>['unknown'+i,{preserved:i}]));if(e.kind==='field'&&e.scalarType==='string')e.facets={...(e.facets as any),length:{max:99,unit:'original-unknown-unit'}};}
 const compact=validateCoreDatasetValuesCompact(source,input),full=validateCoreDatasetValues(source,input);
 expect(compact.datasetValidation).toEqual(full.datasetValidation);expect(compact.records.map(r=>r.result.validation)).toEqual(full.records.map(r=>r.result.validation));
 expect(JSON.stringify(compact)).toContain('UNKNOWN_FACET_UNIT');
});

test('source key component/reference scan product is reserved before original semantic checking',()=>{
 const {source,input}=pack('commerce'),changed=clone(source),record=changed.modules[0]!.elements.find(e=>e.kind==='record')!;
 const ref=clone((record.members as any[])[0]),field=changed.modules.find(m=>m.id===ref.module)!.elements.find(e=>e.id===ref.element)!;
 field.references=Array.from({length:1600},()=>({role:'opaque-original',module:ref.module,element:ref.element}));
 (record.keys as any[])[0].fields=Array.from({length:700},()=>clone(ref));
 expect(()=>validateCoreDatasetValuesCompact(changed,input)).toThrow(/budget exceeded/);
});

test('public schema mutation cannot alter private resource reservations',()=>{
 const {source,input}=pack('commerce'),before=evaluateCompactWithWork(source,input),schemas=[coreDatasetValueCompactOperationSchema,coreSchemaPropertiesDocumentSchema,coreDatasetValueOperationSchema] as any[],originals=schemas.map(s=>s.properties);
 try{for(const s of schemas)s.properties={};const after=evaluateCompactWithWork(source,input);expect(after.work).toEqual(before.work);expect(after.receipt).toEqual(before.receipt);}finally{schemas.forEach((s,i)=>s.properties=originals[i]);}
});

test('compact first-occurrence field index preserves duplicate supplied-value behavior exactly',()=>{
 const {source,input}=pack('commerce'),duplicate=clone(input.records[0]!.values[0]!);
 if(duplicate.state==='present'&&duplicate.value!==null){const wrapper=Object.keys(duplicate.value)[0]!;(duplicate.value as any)[wrapper]=wrapper==='integerToken'?'999':wrapper==='decimalToken'?'99.0':'changed-duplicate';}
 input.records[0]!.values.push(duplicate);const compact=validateCoreDatasetValuesCompact(source,input),full=validateCoreDatasetValues(source,input);
 expect(compact.datasetValidation).toEqual(full.datasetValidation);
 expect(compact.keys.map(k=>expand(k.result,compact.source))).toEqual(full.keys.map(k=>k.result));
});

test('resource-only meter reserves propertyNames and both const/enum sides independently',()=>{
 const schema={type:'object',propertyNames:{enum:['a','b']},properties:{a:{const:'original'}}},value={a:'original'},work=new ValueWork();
 reserveSchemaWork(schema,schema,value,work,'probe');
 expect(work.categories['probe-meter-canonical']).toBe(6);expect(work.categories['probe-validator-canonical']).toBe(6);
 // Root, propertyNames and selected property are three independent branches.
 expect(work.categories['probe-meter-branch']).toBe(3);expect(work.categories['probe-validator-branch']).toBe(3);
});

test('indexed key selection preserves unknown key/field qualifiers and missing identity refusals',()=>{
 const {source,input}=pack('commerce');
 for(const kind of ['key','component','facet']){
  const changed=clone(source),record=changed.modules[0]!.elements.find(e=>e.kind==='record')!,key=(record.keys as any[])[0];
  if(kind==='key')key.originalUnknown={retained:'opaque'};
  if(kind==='component')key.fields[0].originalUnknown={retained:'opaque'};
  if(kind==='facet'){const ref=key.fields[0],field=changed.modules.find(m=>m.id===ref.module)!.elements.find(e=>e.id===ref.element)!;field.facets={...(field.facets as any),originalUnknown:{retained:'opaque'}};}
  const compact=validateCoreDatasetValuesCompact(changed,input),full=validateCoreDatasetValues(changed,input);
  expect(compact.datasetValidation).toEqual(full.datasetValidation);expect(compact.obligations).toEqual(full.obligations);expect(compact.keys.map(k=>expand(k.result,compact.source))).toEqual(full.keys.map(k=>k.result));
 }
 const changed=clone(input);changed.records[0]!.identity.element='missing-original-record';
 const code=(fn:()=>unknown)=>{try{fn();return 'admitted';}catch(error:any){return error.code;}};
 expect(code(()=>validateCoreDatasetValuesCompact(source,changed))).toBe(code(()=>validateCoreDatasetValues(source,changed)));
});
