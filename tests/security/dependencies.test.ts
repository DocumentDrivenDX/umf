import {test,expect} from 'bun:test';
import {securityPolicyDependencies} from '../../src/extensions/security/dependencies';
import {securityFixture,ref} from './fixture';
import {writeFixture} from './write-fixture';
import {evaluateSecurityWrite} from '../../src/extensions/security/write';
// @covers US-079-AC3
// @covers US-057-AC1
test('typed dependency closure includes endpoint components and exact identity keys',()=>{
  const f=securityFixture(),dependencies=securityPolicyDependencies(f.policy,f.resolution);
  expect(dependencies.fields.map(r=>r.elementId)).toEqual(['active','assignmentProject','assignmentStaff','ownerProject','ownerResource','projectId','resourceId','staffId']);
  expect(dependencies.associations).toEqual([ref('Assignment'),ref('Ownership')]);
  expect(dependencies.fields.some(r=>r.elementId==='salary')).toBe(false);
});
// @covers US-057-AC1
test('a write binding cannot omit a policy-read field to avoid separate policy mutation authority',()=>{
  const f=writeFixture();f.policy.rules.push({id:'salary-policy',effect:'require',actions:['update'],target:[ref('Resource')],condition:{op:'eq',left:{kind:'resource',field:ref('salary')},right:{kind:'resource',field:ref('salary')}}});
  const run=()=>evaluateSecurityWrite(f.policy,f.resolution,f.profile,{operation:'update',original:f.original,proposed:f.proposed}).decision;
  expect(run()).toBe('indeterminate');
  f.profile.policyFields.push(ref('salary'));f.policy.rules.find(r=>r.id==='writer')!.actions=f.policy.rules.find(r=>r.id==='writer')!.actions.filter(a=>a!=='change-policy');
  expect(run()).toBe('deny');f.policy.rules.find(r=>r.id==='writer')!.actions.push('change-policy');expect(run()).toBe('permit');
});
// @covers US-079-AC3
test('incomplete interpretation cannot produce an apparently complete dependency inventory',()=>{
  const f=securityFixture();(f.policy as any).future={issuer:'client'};
  expect(()=>securityPolicyDependencies(f.policy,f.resolution)).toThrow('Security interpretation refused');
});
