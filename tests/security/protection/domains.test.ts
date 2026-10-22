// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {resolveSecurityProtectionDomains} from '../../../src/extensions/security/protection/domains';
import {domainFixture,domainRef} from './domain-fixture';
const resolve=(f:ReturnType<typeof domainFixture>)=>resolveSecurityProtectionDomains(f.policy,f.catalog,f.closure);
test('qualified closure resolves every occurrence and preserves distinct complete domain definitions',()=>{
 // @covers US-079-AC11
 // @covers US-079-AC12
 const f=domainFixture(),before=structuredClone(f),r=resolve(f);
 expect(r.status).toBe('resolved-domains');expect(r.complete).toBe(false);expect(r.authority).toBe(false);expect(f).toEqual(before);
 expect(r.domains.map(d=>[d.source,d.path,d.ref.elementId,d.definition.elementIndex])).toEqual([
  ['catalog','/transforms/0/inputDomain','input',0],['catalog','/transforms/0/outputDomain','output',1],['catalog','/transforms/0/parameters/0/field','parameter',2],['catalog','/transforms/0/disclosureProfile/0/bucket/field','parameter',2],['policy','/rules/0/disclosure/0/field','input',0],['policy','/rules/0/disclosure/0/disposition/field','output',1]
 ]);
 expect(r.closure).toEqual(f.closure);expect(Object.isFrozen((r.closure as any).documents[0].document.modules[0].elements)).toBe(true);
 (f.closure.documents[0]!.document.modules[0]!.elements[0]! as {scalarType:string}).scalarType='string';expect((r.closure as any).documents[0].document.modules[0].elements[0].scalarType).toBe('integer');
});
test('pin closure refuses stale duplicate missing extra and unknown metadata without partial coordinates',()=>{
 for(const change of [
  (f:any)=>f.closure.documents[0].revision='other',
  (f:any)=>f.closure.pins.push({...f.closure.pins[0]}),
  (f:any)=>f.closure.documents.push({...f.closure.documents[0]}),
  (f:any)=>f.closure.documents=[],(f:any)=>f.closure.pins=[],
  (f:any)=>f.closure.pins.push({documentId:'missing',revision:'r'}),
  (f:any)=>f.closure.future=true,(f:any)=>f.closure.pins[0].future=true,(f:any)=>f.closure.documents[0].future=true,
 ]){const f=domainFixture();change(f);const original=structuredClone(f),r=resolve(f);expect(r.status).toBe('refused');expect(r.domains).toEqual([]);expect(r.closure).toEqual(f.closure);expect(f).toEqual(original);}
});
test('foreign missing and non-Field domains refuse including unused transforms and all declaration sites',()=>{
 for(const site of ['inputDomain','outputDomain','parameter','bucket','protected','disclosed','unused'])for(const bad of [domainRef('missing'),domainRef('record'),{...domainRef('input'),documentId:'foreign'},{...domainRef('input'),moduleId:'foreign'}]){
  const f=domainFixture(),t=f.catalog.transforms[0];
  if(site==='parameter')t.parameters[0].field=bad;
  else if(site==='bucket')t.disclosureProfile[0].bucket.field=bad;
  else if(site==='protected')f.policy.rules[0].disclosure[0].field=bad;
  else if(site==='disclosed')f.policy.rules[0].disclosure[0].disposition.field=bad;
  else if(site==='unused')f.catalog.transforms.push({...t,id:'unused',inputDomain:bad});else t[site]=bad;
  const r=resolve(f);expect(r.status).toBe('refused');expect(r.domains).toEqual([]);
 }
});
test('unknown core policy and catalog meaning remains source but cannot qualify domains',()=>{
 for(const change of [
  (f:any)=>f.closure.documents[0].document.modules[0].elements[0].future=true,
  (f:any)=>f.closure.documents[0].document.modules[0].elements[0].scalarType='future',
  (f:any)=>f.closure.documents[0].document.umf='future',
  (f:any)=>f.closure.documents[0].document.vocabularies={'unknown':{version:'1'}},
  (f:any)=>f.policy.rules[0].future=true,(f:any)=>f.catalog.transforms[0].future=true,
 ]){const f=domainFixture();change(f);const original=structuredClone(f),r=resolve(f);expect(r.status).toBe('refused');expect(r.domains).toEqual([]);expect(r.policy).toEqual(original.policy);expect(r.catalog).toEqual(original.catalog);expect(r.closure).toEqual(original.closure);}
});
test('core definitions retain all known families containers and unspecified meaning without inventing function semantics',()=>{
 for(const patch of [
  ...['boolean','integer','decimal','float','string','binary','date','time','timestamp'].map(scalarType=>({scalarType})),
  {scalarType:undefined,cardinality:'array',itemType:{module:'m',element:'parameter'}},
  {scalarType:undefined,cardinality:'map',itemType:{module:'m',element:'parameter'}},
  {scalarType:undefined,cardinality:'unspecified',nullability:'unspecified'},
  {scalarType:undefined,references:[{role:'record-type',module:'m',element:'record'}]},
 ]){
  const f=domainFixture(),field:any=f.closure.documents[0]!.document.modules[0]!.elements[0]!;Object.assign(field,patch);if(field.scalarType===undefined)delete field.scalarType;
  const r=resolve(f);expect(r.status,JSON.stringify(patch)).toBe('resolved-domains');expect(r.complete).toBe(false);expect((r.closure as any).documents[0].document.modules[0].elements[0]).toEqual(field);
 }
});
test('domain closure is bounded before document validation and never executes getters',()=>{
 const f=domainFixture(),large:any=structuredClone(f.closure);large.documents[0].document.future='x'.repeat(4_000_001);
 const bounded=resolveSecurityProtectionDomains(f.policy,f.catalog,large);expect(bounded.status).toBe('refused');expect(bounded.diagnostics.some(d=>d.code==='PROTECTION_DOMAIN_BOUND')).toBe(true);expect(bounded.closure).toEqual(large);
 let calls=0;const bad={get pins(){calls++;return [];}};expect(resolveSecurityProtectionDomains(f.policy,f.catalog,bad).status).toBe('refused');expect(calls).toBe(0);
 const atLimit=domainFixture();for(let i=1;i<256;i++){const id='extra-'+i;atLimit.closure.pins.push({documentId:id,revision:'schema1'});atLimit.closure.documents.push({revision:'schema1',document:{...structuredClone(atLimit.closure.documents[0]!.document),id}});}expect(resolve(atLimit).status).toBe('resolved-domains');
 const many={pins:Array.from({length:257},(_,i)=>({documentId:String(i),revision:'r'})),documents:[]};expect(resolveSecurityProtectionDomains(f.policy,f.catalog,many).status).toBe('refused');
});
