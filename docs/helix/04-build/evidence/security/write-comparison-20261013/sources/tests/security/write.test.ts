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

// @covers US-057-AC1
// @covers US-057-AC7
test('write authority comparison ignores field order and equivalent typed context literals',()=>{
  const reordered=writeFixture();
  reordered.proposed.cut.facts.forEach(fact=>fact.fields.reverse());
  reordered.policy.rules.find(rule=>rule.id==='writer')!.actions=reordered.policy.rules.find(rule=>rule.id==='writer')!.actions.filter(action=>!['change-owner','change-policy'].includes(action));
  expect(run(reordered)).toBe('permit');
  const context=writeFixture();const salary=context.profile.fieldActions[1]!.field;
  context.resolution.ontology.context=[salary];
  context.original.cut.context=[{field:salary,value:{integerToken:'100'}}];
  context.proposed.cut.context=[{field:salary,value:{integerToken:'1e2'}}];
  expect(run(context)).toBe('permit');
  context.proposed.cut.context[0]!.value={integerToken:'200'};expect(run(context)).toBe('indeterminate');
});

// @covers US-057-AC1
// @covers US-057-AC7
test('write comparison uses typed subject keys and authorization fact values',()=>{
  const f=writeFixture();
  for(const name of ['staffId','assignmentStaff'])f.resolution.documents[0]!.document.modules[0]!.elements.find(element=>element.id===name)!.scalarType='integer';
  for(const [state,token] of [[f.original,'100'],[f.proposed,'1e2']] as const){
    state.cut.subjects[0]!.key=[{integerToken:token}];state.cut.subjects[0]!.fields[0]!.value={integerToken:token};
    state.cut.facts.find(fact=>fact.type.elementId==='Assignment')!.fields.find(field=>field.field.elementId==='assignmentStaff')!.value={integerToken:token};
  }
  expect(run(f)).toBe('permit');
  f.proposed.cut.subjects[0]!.key=[{integerToken:'200'}];f.proposed.cut.subjects[0]!.fields[0]!.value={integerToken:'200'};
  expect(run(f)).toBe('indeterminate');
});

// @covers US-057-AC7
test('write comparison rejects duplicate projections and exhausted comparison budgets',()=>{
  for(const change of ['fact','field','context','budget'] as const){
    const f=writeFixture();
    if(change==='fact')f.proposed.cut.facts.push(structuredClone(f.proposed.cut.facts[0]!));
    if(change==='field')f.proposed.cut.facts[0]!.fields.push(structuredClone(f.proposed.cut.facts[0]!.fields[0]!));
    if(change==='context'){
      const field=f.profile.fieldActions[1]!.field;f.resolution.ontology.context=[field];
      f.original.cut.context=[{field,value:{integerToken:'1'}}];f.proposed.cut.context=[{field,value:{integerToken:'1'}},{field,value:{integerToken:'1'}}];
    }
    if(change==='budget'){f.original.cut.maxSteps=1;f.proposed.cut.maxSteps=1;}
    expect(run(f),change).toBe('indeterminate');
  }
});

// @covers US-057-AC7
test('normalized comparison payload has a discriminating refusal independent of step exhaustion',()=>{
  for(const [digits,expected] of [[999000,'permit'],[1000000,'indeterminate']] as const){
    const f=writeFixture(),field=f.profile.fieldActions[1]!.field,token=`1e${digits-1}`;
    f.resolution.ontology.context=[field];
    for(const state of [f.original,f.proposed]){
      state.resource.fields.find(entry=>entry.field.elementId==='salary')!.value={integerToken:token};
      state.cut.context=[{field,value:{integerToken:token}}];state.cut.maxSteps=100000;
    }
    expect(run(f),String(digits)).toBe(expected);
  }
},20000);

// @covers US-057-AC1
test('numeric ownership equivalence avoids special actions while actual changes require both grants',()=>{
  const f=writeFixture();
  for(const name of ['projectId','ownerProject','assignmentProject'])f.resolution.documents[0]!.document.modules[0]!.elements.find(element=>element.id===name)!.scalarType='integer';
  for(const state of [f.original,f.proposed]){
    state.cut.facts.find(fact=>fact.type.elementId==='Ownership')!.fields.find(field=>field.field.elementId==='ownerProject')!.value={integerToken:state===f.original?'100':'1e2'};
    state.cut.facts.find(fact=>fact.type.elementId==='Assignment')!.fields.find(field=>field.field.elementId==='assignmentProject')!.value={integerToken:'100'};
  }
  f.policy.rules.find(rule=>rule.id==='write-membership')!.condition={op:'literal',value:true};
  const writer=f.policy.rules.find(rule=>rule.id==='writer')!;writer.actions=writer.actions.filter(action=>!['change-owner','change-policy'].includes(action));
  expect(run(f)).toBe('permit');
  f.proposed.cut.facts.find(fact=>fact.type.elementId==='Ownership')!.fields.find(field=>field.field.elementId==='ownerProject')!.value={integerToken:'200'};
  expect(run(f)).toBe('deny');writer.actions.push('change-owner');expect(run(f)).toBe('deny');writer.actions.push('change-policy');expect(run(f)).toBe('permit');
});
