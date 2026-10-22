// SPDX-License-Identifier: MIT OR Apache-2.0
// @covers US-079-AC14
// @covers US-079-AC7
// @covers US-079-AC10
import {test,expect} from 'bun:test';
import {inspectSecurityDisclosureV2,encodeSecurityDisclosureV2,decodeSecurityDisclosureV2} from '../../../src/extensions/security/protection/disclosure';
import {domainFixture,domainRef} from './domain-fixture';
import {GREGORIAN_DATE_PROFILE} from '../../../src/adapters/gregorian-date';
function fixture(){
 const f=domainFixture();f.catalog.transforms[0].parameters=[];f.catalog.transforms[0].disclosureProfile=[];
 Object.assign(f.closure.documents[0]!.document.modules[0]!.elements[0]!,{nullability:'absent-allowed'});
 Object.assign(f.closure.documents[0]!.document.modules[0]!.elements[1]!,{nullability:'absent-allowed'});
 const batch:any={version:'umf.security.disclosure/0.2.0',policy:{id:'p',revision:'p1'},protection:{id:'catalog',revision:'c1'},domains:structuredClone(f.closure.pins),columns:[{field:domainRef('input'),storageEffect:'canonical'}],rows:[
  [{disposition:'original',value:null}],[{disposition:'absent'}],[{disposition:'withheld'}],
  [{disposition:'original',value:{integerToken:'9007199254740993'}}],
  [{disposition:'transformed',selection:{ruleIndex:0,disclosureIndex:0},outputDomain:domainRef('output'),transform:{id:'transform',version:'t1'},value:null}],
  [{disposition:'transformed',selection:{ruleIndex:0,disclosureIndex:0},outputDomain:domainRef('output'),transform:{id:'transform',version:'t1'},value:{string:'restricted'}}]
 ]};return {...f,batch};
}
const run=(f:ReturnType<typeof fixture>)=>inspectSecurityDisclosureV2(f.batch,f.policy,f.catalog,f.closure);
const refused=(f:ReturnType<typeof fixture>)=>{const r=run(f);expect(r.status).toBe('refused');expect(r.batch).toBe(null);expect(r.source).toEqual(f.batch);return r;};
test('typed transport retains six distinctions with exact JSON/YAML round trips and no authority',()=>{
 const f=fixture(),before=structuredClone(f),r=run(f);expect(r.status).toBe('validated-disclosure');expect(r.batch).toEqual(f.batch);expect([r.complete,r.authority]).toEqual([false,false]);expect(Object.isFrozen(r.batch?.rows[0]?.[0])).toBe(true);
 for(const format of ['json','yaml'] as const){const text=encodeSecurityDisclosureV2(f.batch,f.policy,f.catalog,f.closure,format);expect(decodeSecurityDisclosureV2(text,f.policy,f.catalog,f.closure,format)).toEqual(f.batch);}
 expect(()=>encodeSecurityDisclosureV2(f.batch,f.policy,f.catalog,f.closure,'unknown' as any)).toThrow();expect(()=>decodeSecurityDisclosureV2('{}',f.policy,f.catalog,f.closure,'unknown' as any)).toThrow();expect(()=>decodeSecurityDisclosureV2(null as any,f.policy,f.catalog,f.closure)).toThrow();
 expect(f).toEqual(before);f.batch.rows[0][0].value={integerToken:'2'};expect(r.batch?.rows[0]?.[0]).toEqual({disposition:'original',value:null});
});
test('whole batch rejects malformed distinctions, substituted domains and hidden data',()=>{
 for(const change of [
  (f:any)=>f.batch.rows[0][0].value={string:'wrong'},(f:any)=>delete f.batch.rows[0][0].value,
  (f:any)=>f.batch.rows[1][0].value=null,(f:any)=>f.batch.rows[2][0].value=null,
  (f:any)=>f.batch.rows[4][0].value={integerToken:'1'},(f:any)=>delete f.batch.rows[4][0].value,
  (f:any)=>f.batch.rows[4][0].outputDomain=domainRef('input'),(f:any)=>f.policy.rules[0].disclosure[0].field=domainRef('parameter'),
  (f:any)=>f.catalog.transforms[0].inputDomain=domainRef('parameter'),(f:any)=>f.catalog.transforms[0].outputDomain=domainRef('input'),
  (f:any)=>f.batch.rows[4][0].transform.version='stale',(f:any)=>f.batch.rows[4][0].selection.ruleIndex=1,
  (f:any)=>f.batch.rows[0][0].disposition='reversed',(f:any)=>f.batch.rows[0].push(f.batch.rows[0][0]),
  (f:any)=>f.batch.columns.push(f.batch.columns[0]),(f:any)=>f.batch.columns[0].field=domainRef('record'),
  (f:any)=>f.batch.policy.revision='stale',(f:any)=>f.batch.protection.revision='stale',
  (f:any)=>f.batch.domains[0].revision='stale',(f:any)=>f.batch.domains.push(f.batch.domains[0]),
  (f:any)=>f.batch.version='umf.security.disclosure/0.1.0',(f:any)=>f.batch.future=true,
  (f:any)=>f.batch.columns[0].field.future=true,(f:any)=>f.batch.rows[4][0].selection.future=true,
 ]){const f=fixture();change(f);refused(f);expect(()=>encodeSecurityDisclosureV2(f.batch,f.policy,f.catalog,f.closure)).toThrow();expect(()=>decodeSecurityDisclosureV2(JSON.stringify(f.batch),f.policy,f.catalog,f.closure)).toThrow();}
});
function stored(){
 const f=fixture(),t=f.catalog.transforms[0];t.kind='tokenize';delete t.function;t.reversibility='vault';t.reverseAction='reverse';t.custody={owner:'excluded',vaultRef:'opaque',formatPreserving:false,storageEffect:'stored-transformed',propagation:{history:'tokens',snapshots:'tokens',exports:'tokens',feeds:'tokens',caches:'tokens'}};
 f.batch.columns=[{field:domainRef('output'),storageEffect:'stored-transformed',storageTransform:{id:t.id,version:t.version}}];f.batch.rows=[[{disposition:'original',value:{string:'token:opaque'}}],[{disposition:'original',value:null}],[{disposition:'absent'}],[{disposition:'withheld'}]];return f;
}
test('original stored token uses actual canonical output Field without reverse or implicit plaintext',()=>{
 const f=stored();expect(run(f).status).toBe('validated-disclosure');
 const empty=stored();empty.batch.rows=[];empty.batch.columns[0].field=domainRef('input');refused(empty);
 for(const mutate of [(x:any)=>x.batch.columns[0].field=domainRef('input'),(x:any)=>x.batch.rows[0][0].value={integerToken:'1'},(x:any)=>x.batch.columns[0].storageTransform.version='wrong',(x:any)=>delete x.batch.columns[0].storageTransform,(x:any)=>{x.batch.columns[0].storageEffect='canonical';delete x.batch.columns[0].storageTransform;},(x:any)=>x.batch.rows[0][0].disposition='reversed']){const x=structuredClone(f);mutate(x);refused(x);}
 const t=structuredClone(f.catalog.transforms[0]);t.id='present';t.kind='mask';t.function='constant';t.inputDomain=domainRef('output');t.outputDomain=domainRef('parameter');t.reversibility='none';delete t.custody;delete t.reverseAction;f.catalog.transforms.push(t);
 f.policy.rules[0].disclosure.push({field:domainRef('output'),disposition:{kind:'transformed',vocabulary:'umf.security.protection',transform:t.id,version:t.version,field:domainRef('parameter')}});
 f.batch.rows.push([{disposition:'transformed',selection:{ruleIndex:0,disclosureIndex:1},outputDomain:domainRef('parameter'),transform:{id:t.id,version:t.version},value:{integerToken:'7'}}]);expect(run(f).status).toBe('validated-disclosure');
});
test('all metadata is validated in empty/withheld batches and explicit dates do not imply temporal semantics',()=>{
 for(const rows of [[],[[{disposition:'withheld'}]]])for(const mutate of [(x:any)=>x.batch.columns[0].valueProfile='unknown',(x:any)=>x.batch.columns[0].storageEffect='unknown',(x:any)=>x.batch.columns[0].storageTransform={id:'missing',version:'1'}]){const f=fixture();f.batch.rows=rows;mutate(f);refused(f);}
 const f=fixture();f.batch.rows=[[{disposition:'original',value:{date:'2000-02-29'}}]];Object.assign(f.closure.documents[0]!.document.modules[0]!.elements[0]!,{scalarType:'date'});refused(f);f.batch.columns[0].valueProfile=GREGORIAN_DATE_PROFILE;expect(run(f).status).toBe('validated-disclosure');f.batch.rows[0][0].value={date:'1900-02-29'};refused(f);
});
test('bounds and shared literal work refuse atomically, with no input accessor execution',()=>{
 const f=fixture();f.batch.rows=Array.from({length:4096},()=>[{disposition:'withheld'}]);expect(run(f).status).toBe('validated-disclosure');f.batch.rows.push([{disposition:'withheld'}]);refused(f);
 const x=fixture();x.batch.rows=Array.from({length:40},()=>[{disposition:'original',value:{integerToken:'9'.repeat(3000)}}]);const r=refused(x);expect(r.diagnostics.some(d=>d.code==='PROTECTION_LITERAL_BOUND')).toBe(true);
 const y=fixture();y.batch.rows[0][0].value={integerToken:'1e1000000'};refused(y);
 let called=false;const hostile={get version(){called=true;return 'x';}};const result=inspectSecurityDisclosureV2(hostile,f.policy,f.catalog,f.closure);expect(result.status).toBe('refused');expect(called).toBe(false);
});
