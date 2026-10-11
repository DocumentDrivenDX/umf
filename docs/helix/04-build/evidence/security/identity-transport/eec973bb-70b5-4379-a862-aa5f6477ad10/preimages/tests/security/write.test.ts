import {test,expect} from 'bun:test';
import {evaluateSecurityWrite} from '../../src/extensions/security/write';
import {writeFixture} from './write-fixture';
const run=(f:ReturnType<typeof writeFixture>)=>evaluateSecurityWrite(f.policy,f.resolution,f.profile,{operation:'update',original:f.original,proposed:f.proposed}).decision;
// @covers US-057-AC1
test('writes require both states and exact field permission; admission has no effects',()=>{
  const f=writeFixture();expect(run(f)).toBe('permit');
  f.policy.rules.find(r=>r.id==='writer')!.actions=['create','update','delete','change-owner'];expect(run(f)).toBe('deny');
  f.policy.rules.find(r=>r.id==='writer')!.actions.push('write-fields');
  f.proposed.cut.facts.find(r=>r.type.elementId==='Ownership')!.fields.find(x=>x.field.elementId==='ownerProject')!.value={string:'p2'};
  expect(run(f)).toBe('deny');expect(f.original.resource.fields.find(x=>x.field.elementId==='salary')!.value).toEqual({integerToken:'100'});
});
// @covers US-057-AC1
test('ownership changes require a separately granted action even with permitted old/new states',()=>{
  const f=writeFixture();f.policy.rules.find(r=>r.id==='write-membership')!.condition={op:'literal',value:true};
  f.proposed.cut.facts.find(r=>r.type.elementId==='Ownership')!.fields.find(x=>x.field.elementId==='ownerProject')!.value={string:'p2'};
  f.policy.rules.find(r=>r.id==='writer')!.actions=['create','update','delete','write-fields'];expect(run(f)).toBe('deny');
  f.policy.rules.find(r=>r.id==='writer')!.actions.push('change-owner');expect(run(f)).toBe('permit');
});
// @covers US-057-AC1
// @covers US-057-AC7
test('incomplete states, mixed authority and changed authorization facts refuse',()=>{
  for(const mutation of ['field','generation','assignment','profile']){
    const f=writeFixture();
    if(mutation==='field')f.proposed.resource.fields=f.proposed.resource.fields.filter(x=>x.field.elementId!=='salary');
    if(mutation==='generation'){f.proposed.cut.generation='g2';f.proposed.cut.expectedGeneration='g2';}
    if(mutation==='assignment')f.proposed.cut.facts.find(r=>r.type.elementId==='Assignment')!.fields.find(x=>x.field.elementId==='active')!.value={boolean:false};
    if(mutation==='profile')f.profile.fieldActions=[];
    expect(run(f),mutation).toBe('indeterminate');
  }
});
// @covers US-057-AC1
test('create and delete admit only their declared state shape',()=>{
  const f=writeFixture();
  expect(evaluateSecurityWrite(f.policy,f.resolution,f.profile,{operation:'create',proposed:f.proposed}).decision).toBe('permit');
  expect(evaluateSecurityWrite(f.policy,f.resolution,f.profile,{operation:'delete',original:f.original}).decision).toBe('permit');
  expect(evaluateSecurityWrite(f.policy,f.resolution,f.profile,{operation:'create',original:f.original,proposed:f.proposed}).decision).toBe('indeterminate');
});

// @covers US-057-AC1
test('policy attribute changes need separate authority and null/absence remain distinct',()=>{
  const f=writeFixture();f.profile.policyFields.push(f.profile.fieldActions[1]!.field);
  f.policy.rules.find(r=>r.id==='writer')!.actions=f.policy.rules.find(r=>r.id==='writer')!.actions.filter(a=>a!=='change-policy');
  expect(run(f)).toBe('deny');f.policy.rules.find(r=>r.id==='writer')!.actions.push('change-policy');expect(run(f)).toBe('permit');
  f.resolution.documents[0]!.document.modules[0]!.elements.find(e=>e.id==='salary')!.nullability='absent-allowed';
  f.original.resource.fields.find(x=>x.field.elementId==='salary')!.value=null;
  f.proposed.resource.fields=f.proposed.resource.fields.filter(x=>x.field.elementId!=='salary');f.proposed.resource.absent=[f.profile.fieldActions[1]!.field];
  f.policy.rules.find(r=>r.id==='writer')!.actions=f.policy.rules.find(r=>r.id==='writer')!.actions.filter(a=>a!=='change-policy');expect(run(f)).toBe('deny');
  f.policy.rules.find(r=>r.id==='writer')!.actions.push('change-policy');expect(run(f)).toBe('permit');
});
