// @covers US-079-AC16
// @covers US-057-AC1
import {test,expect} from 'bun:test';
import {writeFixture} from './write-fixture';
import {ref} from './fixture';
import {evaluateSecurityWrite} from '../../src/extensions/security/write';
import {evaluateSecurityOriginalRead} from '../../src/extensions/security/evaluate';
const run=(f:any,operation='update')=>evaluateSecurityWrite(f.policy,f.resolution,f.profile,{operation,...(operation!=='create'?{original:f.original}:{}),...(operation!=='delete'?{proposed:f.proposed}:{})} as any).decision;
function fixture(){const f=writeFixture() as any;f.profile.readProtection={version:'umf.security.write-read/0.1.0',readAction:'read',blindWriteActions:[]};return f;}
function original(f:any){f.policy.rules.find((r:any)=>r.id==='reader').disclosure=[{field:ref('salary'),disposition:{kind:'original'}}];}
function blind(f:any){f.resolution.ontology.actions.push('blind-salary');f.profile.readProtection.blindWriteActions=[{field:ref('salary'),action:'blind-salary'}];f.policy.rules.push({id:'blind',effect:'permit',actions:['blind-salary'],target:[ref('Resource')],condition:{op:'literal',value:true}});}
test('missing or unknown read protection never keeps legacy write permission',()=>{
 const old=writeFixture() as any;delete old.profile.readProtection;expect(run(old)).toBe('indeterminate');
 for(const mutate of [(f:any)=>delete f.profile.readProtection.readAction,(f:any)=>delete f.profile.readProtection.blindWriteActions,(f:any)=>f.profile.readProtection.version='future',(f:any)=>f.profile.readProtection.readAction='missing',(f:any)=>f.profile.readProtection.future=true]){const f=fixture();mutate(f);expect(run(f)).toBe('indeterminate');}
});
test('withheld and transformed reads cannot write even a value equal to the mask',()=>{
 const f=fixture();expect(run(f)).toBe('deny');
 f.policy.rules.find((r:any)=>r.id==='reader').disclosure=[{field:ref('salary'),disposition:{kind:'transformed',transform:'constant',version:'0.1.0',field:ref('salary'),value:{integerToken:'0'}}}];
 expect(run(f)).toBe('deny');f.proposed.resource.fields.find((x:any)=>x.field.elementId==='salary').value={integerToken:'0'};expect(run(f)).toBe('deny');
 original(f);expect(run(f)).toBe('permit');
});
test('blind write is exact Field-bound explicit permission, independent of field mutation grant',()=>{
 const f=fixture();blind(f);expect(run(f)).toBe('permit');
 f.policy.rules.find((r:any)=>r.id==='blind').condition={op:'literal',value:false};expect(run(f)).toBe('deny');
 original(f);expect(run(f)).toBe('permit');
 f.policy.rules.find((r:any)=>r.id==='writer').actions=f.policy.rules.find((r:any)=>r.id==='writer').actions.filter((x:any)=>x!=='write-fields');expect(run(f)).toBe('deny');
 const wrong=fixture();blind(wrong);wrong.profile.readProtection.blindWriteActions[0].field=ref('resourceId');expect(run(wrong)).toBe('deny');
});
test('blind bindings refuse duplicated foreign malformed or ordinary-action aliases',()=>{
 for(const mutate of [(f:any)=>f.profile.readProtection.blindWriteActions.push(structuredClone(f.profile.readProtection.blindWriteActions[0])),(f:any)=>f.profile.readProtection.blindWriteActions[0].field=ref('staffId'),(f:any)=>f.profile.readProtection.blindWriteActions[0].future=true,(f:any)=>f.profile.readProtection.blindWriteActions[0].action='missing',...['read','update','write-fields','change-owner','change-policy','create','delete'].map(action=>(f:any)=>f.profile.readProtection.blindWriteActions[0].action=action)]){const f=fixture();blind(f);mutate(f);expect(run(f)).toBe('indeterminate');}
});
test('update requires original or blind permission in both original and proposed states',()=>{
 for(const path of ['read','blind']){
  const f=fixture();f.profile.policyFields.push(ref('salary'));
  if(path==='read')original(f);else blind(f);
  const r=f.policy.rules.find((r:any)=>r.id===(path==='read'?'reader':'blind'));r.condition={op:'eq',left:{kind:'resource',field:ref('salary')},right:{kind:'constant',field:ref('salary'),value:{integerToken:'100'}}};
  expect(run(f)).toBe('deny');r.condition={op:'literal',value:true};expect(run(f)).toBe('permit');
 }
});
test('original null and canonical absence keep original meaning before cell transport',()=>{
 for(const mode of ['null','absent']){const f=fixture();original(f);f.resolution.documents[0].document.modules[0].elements.find((e:any)=>e.id==='salary').nullability='absent-allowed';
  if(mode==='null')f.original.resource.fields.find((x:any)=>x.field.elementId==='salary').value=null;
  else{f.original.resource.fields=f.original.resource.fields.filter((x:any)=>x.field.elementId!=='salary');f.original.resource.absent=[ref('salary')];}
  expect(run(f),mode).toBe('permit');
 }
});
test('create checks proposed, delete original, and unchanged masked fields need no invented mutation',()=>{
 const f=fixture();expect(run(f,'create')).toBe('deny');expect(run(f,'delete')).toBe('deny');original(f);expect(run(f,'create')).toBe('permit');expect(run(f,'delete')).toBe('permit');
 const same=fixture();same.proposed=structuredClone(same.original);expect(run(same)).toBe('permit');
});
test('original permission can satisfy the guard despite unknown blind alternative and vice versa',()=>{
 const f=fixture();blind(f);original(f);f.profile.policyFields.push(ref('salary'));f.policy.rules.find((r:any)=>r.id==='blind').condition={op:'eq',left:{kind:'context',field:ref('salary')},right:{kind:'resource',field:ref('salary')}};f.resolution.ontology.context=[ref('salary')];expect(run(f)).toBe('permit');
 const b=fixture();blind(b);b.profile.policyFields.push(ref('salary'));b.resolution.ontology.context=[ref('salary')];b.policy.rules.find((r:any)=>r.id==='reader').condition={op:'eq',left:{kind:'context',field:ref('salary')},right:{kind:'resource',field:ref('salary')}};expect(run(b)).toBe('permit');
});
test('unknown facts, generation, source and exhausted budgets cannot issue write permission',()=>{
 for(const mutate of [(f:any)=>f.proposed.cut.generation='stale',(f:any)=>f.proposed.cut.maxSteps=1,(f:any)=>f.proposed.cut.maxSteps='10000',(f:any)=>f.proposed.cut.maxSteps=10000.5,(f:any)=>f.original.cut.maxSteps='10000',(f:any)=>f.policy.future=true,(f:any)=>f.proposed.resource.absent=[ref('salary')],(f:any)=>f.profile.readProtection.blindWriteActions=Array.from({length:4097},()=>({field:ref('salary'),action:'blind-salary'}))]){const f=fixture();blind(f);mutate(f);expect(run(f)).toBe('indeterminate');}
});

test('internal original captures clear on later conflict, projection failure or denied read',()=>{
 const f=fixture();original(f);
 const read=()=>evaluateSecurityOriginalRead(f.policy,f.resolution,f.original.cut,'read',[ref('resourceId'),ref('salary')],f.original.resource);
 expect(read().originalFields).toEqual([ref('resourceId'),ref('salary')]);
 f.policy.rules.push({id:'mask-a',effect:'permit',actions:['read'],target:[ref('Resource')],condition:{op:'literal',value:true},disclosure:[{field:ref('salary'),disposition:{kind:'transformed',transform:'constant',version:'0.1.0',field:ref('salary'),value:{integerToken:'1'}}}]},
 {id:'mask-b',effect:'permit',actions:['read'],target:[ref('Resource')],condition:{op:'literal',value:true},disclosure:[{field:ref('salary'),disposition:{kind:'transformed',transform:'constant',version:'0.1.0',field:ref('salary'),value:{integerToken:'2'}}}]});
 expect(read()).toEqual({decision:'conflict',originalFields:[]});
 f.policy.rules=f.policy.rules.filter((r:any)=>!r.id.startsWith('mask-'));f.original.resource.fields=f.original.resource.fields.filter((x:any)=>x.field.elementId!=='salary');
 expect(read()).toEqual({decision:'indeterminate',originalFields:[]});
 const denied=fixture();denied.policy.rules.find((r:any)=>r.id==='reader').condition={op:'literal',value:false};
 expect(evaluateSecurityOriginalRead(denied.policy,denied.resolution,denied.original.cut,'read',[ref('resourceId')],denied.original.resource)).toEqual({decision:'deny',originalFields:[]});
});
