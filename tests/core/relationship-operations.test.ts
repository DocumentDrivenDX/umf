import {test,expect} from 'bun:test';
import {relationshipCandidate} from '../../scripts/core-relationship-cases';
import {relationshipOperationCases,relationshipRequest} from '../../scripts/core-relationship-operation-cases';
import {declareCoreRelationship,inspectCoreRelationships,lookupCoreRelationship,verifyCoreRelationshipOperation} from '../../src/model/relationships';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';

// @covers US-045-AC1 US-045-AC2
test('candidate authoring and stable lookup expose all authored shapes with verified serialized receipts',()=>{
 for(const row of relationshipOperationCases()){
  const before=structuredClone(row.source),r=declareCoreRelationship(row.source,row.identity,row.request);
  expect(row.source).toEqual(before);expect(r.provenance.origin).toBe('authored');
  const view=inspectCoreRelationships(r.target,row.identity);expect(view.meaning.state).toBe('known');
  const lookup=lookupCoreRelationship(r.target,{...row.identity,id:row.request.id});expect(lookup.relationship.id).toBe(row.request.id);expect(lookup.provenance).toBe('unverified');
  for(const result of [r,view,lookup])for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(result,format),format) as unknown as typeof result;expect(verifyCoreRelationshipOperation(saved,r.target)).toEqual(result);}
 }
});
test('rename and endpoint set reorder preserve stable identity and every unknown qualifier',()=>{
 const d=relationshipCandidate(),old=d.modules[0].relationships[0];old.source.push({module:'m',element:'Company',future:{keep:true}});old.future={meaning:'uninterpreted'};old.sourceMultiplicity.future='keep';old.target[0].future='keep';old.associationRecord={module:'m',element:'Enrollment',future:'keep'};
 const request=relationshipRequest(old);request.name='renamed';request.source.reverse();request.inverse=null;
 const r=declareCoreRelationship(d,{module:'m'},request),value=lookupCoreRelationship(r.target,{module:'m',id:old.id}).relationship;
 expect(value.name).toBe('renamed');expect(value.source[0]!.future).toEqual({keep:true});expect(value.target[0]!.future).toBe('keep');expect(value.sourceMultiplicity.future).toBe('keep');expect(value.associationRecord!.future).toBe('keep');expect(value.future).toEqual(old.future);expect(value.inverse).toBeUndefined();
 expect(inspectCoreRelationships(r.target,{module:'m'}).meaning.state).toBe('partial');
 const changed=relationshipRequest(value);changed.targetMultiplicity.min=0;expect(()=>declareCoreRelationship(r.target,{module:'m'},changed)).toThrow('Unknown qualifiers');
});
test('existing IDs cannot move to different endpoint keys, directions or association Records',()=>{
 const d=relationshipCandidate(),r=d.modules[0].relationships[0];
 for(const change of [(q:any)=>q.target[0].key='account-number',(q:any)=>q.source[0].element='Product',(q:any)=>q.directed=false,(q:any)=>q.associationRecord={module:'m',element:'Enrollment'}]){const request=relationshipRequest(r);change(request);expect(()=>declareCoreRelationship(d,{module:'m'},request)).toThrow('Existing ID');}
 const changed=relationshipRequest(r);changed.targetMultiplicity={min:0,max:'*'};expect(declareCoreRelationship(d,{module:'m'},changed).target.modules[0]!.relationships![0]!.targetMultiplicity).toEqual({min:0,max:'*'});
 const bad=relationshipRequest(r);bad.targetMultiplicity={min:3,max:2};expect(()=>declareCoreRelationship(d,{module:'m'},bad)).toThrow();
});
// @covers US-045-AC3 US-045-AC10 (legacy interpretation, not migration)
test('legacy values remain inspectable without authoring and future lifecycle stays uninterpreted',()=>{
 const d=relationshipCandidate(),request=relationshipRequest(d.modules[0].relationships[0]);d.umf='0.6.0';d.modules[0].relationships={opaque:true};
 expect(inspectCoreRelationships(d,{module:'m'}).meaning).toEqual({state:'legacy',value:{opaque:true}});
 expect(()=>declareCoreRelationship(d,{module:'m'},request)).toThrow('migration');expect(()=>lookupCoreRelationship(d,{module:'m',id:request.id})).toThrow();
 const future=relationshipCandidate();future.modules[0].relationships[0].targetLifecycle='future';expect(inspectCoreRelationships(future,{module:'m'}).meaning.state).toBe('partial');expect(()=>declareCoreRelationship(future,{module:'m'},request)).toThrow('Future lifecycle');
});
test('receipt recomputation, current context and input copying reject forgeries and getters',()=>{
 const row=relationshipOperationCases()[0]!,r=declareCoreRelationship(row.source,row.identity,row.request);
 const fake=structuredClone(r);fake.provenance.idealPath='/wrong';expect(()=>verifyCoreRelationshipOperation(fake,r.target)).toThrow();
 const stale=structuredClone(r.target);stale.id='changed';expect(()=>verifyCoreRelationshipOperation(r,stale)).toThrow();
 let calls=0;const request=structuredClone(row.request);Object.defineProperty(request,'name',{enumerable:true,get(){calls++;return 'bad';}});expect(()=>declareCoreRelationship(row.source,row.identity,request)).toThrow();expect(calls).toBe(0);
 r.target.modules[0]!.relationships![0]!.name='mutated';expect(row.source.modules[0].relationships).toBeUndefined();
});
