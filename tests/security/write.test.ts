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
  f.policy.rules.find(r=>r.id==='writer')!.actions=['create','update','delete','write-fields','change-policy'];expect(run(f)).toBe('deny');
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

// @covers US-057-AC1
test('ownership inventories used by policy require policy-change authority on both states',()=>{
  for(const mutation of ['modify','insert','delete']){
    const f=writeFixture();f.policy.rules.find(r=>r.id==='write-membership')!.condition={op:'literal',value:true};
    if(mutation==='modify')f.proposed.cut.facts.find(r=>r.type.elementId==='Ownership')!.fields.find(x=>x.field.elementId==='ownerProject')!.value={string:'p2'};
    if(mutation==='insert'){const owner=structuredClone(f.proposed.cut.facts.find(r=>r.type.elementId==='Ownership')!);owner.key=[{string:'o2'}];owner.fields.find(x=>x.field.elementId==='ownerId')!.value={string:'o2'};f.proposed.cut.facts.push(owner);}
    if(mutation==='delete')f.proposed.cut.facts=f.proposed.cut.facts.filter(r=>r.type.elementId!=='Ownership');
    const writer=f.policy.rules.find(r=>r.id==='writer')!;writer.actions=writer.actions.filter(a=>a!=='change-policy');
    expect(run(f),mutation).toBe('deny');
    writer.actions.push('change-policy');expect(run(f),mutation).toBe('permit');
  }
});

// @covers US-057-AC1
test('ownership policy-change action cannot borrow permission from only one update state',()=>{
  for(const allowed of [[],['p1'],['p2'],['p1','p2']]){
    const f=writeFixture();f.policy.rules.find(r=>r.id==='write-membership')!.condition={op:'literal',value:true};
    f.proposed.cut.facts.find(r=>r.type.elementId==='Ownership')!.fields.find(x=>x.field.elementId==='ownerProject')!.value={string:'p2'};
    f.policy.rules.find(r=>r.id==='writer')!.actions=f.policy.rules.find(r=>r.id==='writer')!.actions.filter(a=>a!=='change-policy');
    f.policy.rules.push({id:'state-policy-grant',effect:'permit',actions:['change-policy'],target:[f.profile.type],condition:allowed.length?{op:'or',args:allowed.map(value=>({op:'exists' as const,association:f.profile.ownershipAssociations[0]!,as:'o',where:{op:'eq' as const,left:{kind:'variable' as const,name:'o',field:{documentId:'domain',moduleId:'m',elementId:'ownerProject'}},right:{kind:'constant' as const,field:{documentId:'domain',moduleId:'m',elementId:'ownerProject'},value:{string:value}}}}))}:{op:'literal',value:false}});
    expect(run(f)).toBe(allowed.length===2?'permit':'deny');
  }
});

// @covers US-057-AC1
test('create/delete policy-used ownership inventory checks are independent of target fields',()=>{
  for(const operation of ['create','delete'] as const){
    const f=writeFixture();
    f.policy.rules=[f.policy.rules.find(r=>r.id==='writer')!,{id:'inventory-dependency',effect:'require',actions:['read'],target:[f.profile.type],condition:{op:'exists',association:f.profile.ownershipAssociations[0]!,as:'owner',where:{op:'literal',value:true}}}];
    f.profile.policyFields=[];
    const writer=f.policy.rules.find(r=>r.id==='writer')!;writer.actions=writer.actions.filter(a=>a!=='change-policy');
    const request=operation==='create'?{operation,proposed:f.proposed}:{operation,original:f.original};
    expect(evaluateSecurityWrite(f.policy,f.resolution,f.profile,request).decision,operation).toBe('deny');
    writer.actions.push('change-policy');expect(evaluateSecurityWrite(f.policy,f.resolution,f.profile,request).decision,operation).toBe('permit');
  }
});

// @covers US-057-AC1
test('unchanged used inventory and changed policy-unused inventory do not need policy-change permission',()=>{
  for(const used of [true,false]){
    const f=writeFixture();
    if(!used){for(const rule of f.policy.rules)rule.condition={op:'literal',value:true};f.proposed.cut.facts.find(r=>r.type.elementId==='Ownership')!.fields.find(x=>x.field.elementId==='ownerProject')!.value={string:'p2'};}
    f.policy.rules.find(r=>r.id==='writer')!.actions=f.policy.rules.find(r=>r.id==='writer')!.actions.filter(a=>a!=='change-policy');
    expect(run(f),String(used)).toBe('permit');
  }
});
