import {test,expect} from 'bun:test';
import {securityIdentityTransportDependencies} from '../../src/extensions/security/dependencies';
import {securityFixture,ref} from './fixture';
// @covers US-079-AC3
const closure=()=>{const f=securityFixture();return securityIdentityTransportDependencies(f.policy,f.resolution);};
test('identity transport adds association keys without relabeling policy reads',()=>{
 const result=closure();
 expect(result.policyFields.map(r=>r.elementId)).toEqual(['active','assignmentProject','assignmentStaff','ownerProject','ownerResource','projectId','resourceId','staffId']);
 expect(result.fields.map(r=>r.elementId)).toEqual(['active','assignmentId','assignmentProject','assignmentStaff','ownerId','ownerProject','ownerResource','projectId','resourceId','staffId']);
 expect(result.records.map(r=>r.type.elementId)).toEqual(['Assignment','Ownership','Project','Resource','Staff']);
 expect(result.fields.some(r=>r.elementId==='salary')).toBe(false);
});
test('compound original identity components retain order',()=>{
 const f=securityFixture();const record=f.resolution.documents[0]!.document.modules[0]!.elements.find(e=>e.id==='Assignment')!;
 (record.keys as any)[0].fields=[{module:'m',element:'assignmentStaff'},{module:'m',element:'assignmentId'}];
 const result=securityIdentityTransportDependencies(f.policy,f.resolution);
 expect(result.records.find(r=>r.type.elementId==='Assignment')!.keyFields).toEqual([ref('assignmentStaff'),ref('assignmentId')]);
});
test('endpoint components preserve original role order and qualified target',()=>{
 const result=closure();expect(result.records.find(r=>r.type.elementId==='Ownership')!.endpoints).toEqual([
  {role:'resource',target:ref('Resource'),fields:[ref('ownerResource')]},
  {role:'project',target:ref('Project'),fields:[ref('ownerProject')]},
 ]);
});
test('unused ontology records do not become inferred ownership or capture requirements',()=>{
 const f=securityFixture();f.policy.rules=f.policy.rules.slice(0,1);
 const result=securityIdentityTransportDependencies(f.policy,f.resolution);
 expect(result.records.map(r=>r.type.elementId)).toEqual(['Resource','Staff']);
 expect(result.fields).toEqual([ref('resourceId'),ref('staffId')]);expect(result.associations).toEqual([]);
});
test('literal association predicates still require its key and endpoint transport',()=>{
 const f=securityFixture();f.policy.rules[1]!.condition={op:'exists',association:ref('Assignment'),as:'a',where:{op:'literal',value:true}};
 const result=securityIdentityTransportDependencies(f.policy,f.resolution);
 expect(result.fields).toEqual(['assignmentId','assignmentProject','assignmentStaff','projectId','resourceId','staffId'].map(ref));
});
test('unknown original meaning refuses identity transport without mutating source',()=>{
 const f=securityFixture();(f.policy as any).future={opaque:['preserve',null]};const original=JSON.stringify(f);
 expect(()=>securityIdentityTransportDependencies(f.policy,f.resolution)).toThrow('Security interpretation refused');expect(JSON.stringify(f)).toBe(original);
});
