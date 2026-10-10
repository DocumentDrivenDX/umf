import {test,expect} from 'bun:test';
import {SecurityReadRegistration} from '../../src/extensions/security/registration';
import {evaluationFixture} from './evaluation-fixture';
import {ref} from './fixture';

// @covers US-079-AC3
// @covers US-079-AC6
test('opaque host registration pins immutable complete definitions and refuses foreign handles',()=>{
  const f=evaluationFixture(),registration=new SecurityReadRegistration(),handle=registration.register(f.policy,f.resolution);
  const request={action:'read',output:[ref('salary')],resources:[f.resource]};
  expect(registration.evaluate(handle,f.cut,request)).toEqual({status:'evaluated',rows:[[{field:ref('salary'),disposition:'withheld'}]]});
  expect(registration.evaluate({kind:'registered-security-read'},f.cut,request)).toEqual({status:'refused',rows:[]});
  expect(new SecurityReadRegistration().evaluate(handle,f.cut,request)).toEqual({status:'refused',rows:[]});
  f.policy.rules[0]!.disclosure![0]!.disposition={kind:'original'};
  expect(registration.evaluate(handle,f.cut,request)).toEqual({status:'evaluated',rows:[[{field:ref('salary'),disposition:'withheld'}]]});
  expect(()=>registration.register(f.policy,f.resolution)).toThrow('Registered source revision has different content');
});

test('stale classification and core source reuse cannot alter an existing registered revision',()=>{
  const f=evaluationFixture(),registration=new SecurityReadRegistration(),handle=registration.register(f.policy,f.resolution);
  const salary=f.resolution.ontology.entities[2]!.fields.find(x=>x.ref.elementId==='salary')!;
  salary.protection='unprotected';
  const request={action:'read',output:[],resources:[f.resource],queryUses:[{field:ref('salary'),operator:'predicate' as const}]};
  expect(registration.evaluate(handle,f.cut,request)).toEqual({status:'refused',rows:[]});
  expect(()=>registration.register(f.policy,f.resolution)).toThrow('Registered source revision has different content');
  const fresh=evaluationFixture();fresh.resolution.documents[0]!.document.modules[0]!.elements.find(e=>e.id==='salary')!.scalarType='string';
  expect(()=>registration.register(fresh.policy,fresh.resolution)).toThrow('Registered source revision has different content');
  expect(registration.evaluate(handle,f.cut,{action:'read',output:[],resources:[f.resource]}).status).toBe('evaluated');
});

test('a late ontology pin conflict cannot reserve the earlier candidate policy revision',()=>{
  const f=evaluationFixture(),registration=new SecurityReadRegistration();
  const prior=registration.register(f.policy,f.resolution);
  const candidate=evaluationFixture();candidate.policy.revision='policy-2';
  candidate.policy.rules[0]!.disclosure![0]!.disposition={kind:'original'};
  candidate.resolution.ontology.entities[2]!.fields.find(x=>x.ref.elementId==='salary')!.protection='unprotected';
  expect(()=>registration.register(candidate.policy,candidate.resolution)).toThrow('Registered source revision has different content');
  const replacement=evaluationFixture();replacement.policy.revision='policy-2';
  const current=registration.register(replacement.policy,replacement.resolution);
  const request={action:'read',output:[ref('salary')],resources:[f.resource]};
  expect(registration.evaluate(prior,f.cut,request).rows[0]![0]!.disposition).toBe('withheld');
  replacement.cut.policyRevision='policy-2';
  expect(registration.evaluate(current,replacement.cut,request).rows[0]![0]!.disposition).toBe('withheld');
});

test('unsupported candidates consume no slots and exhausted capacity preserves every issued handle',()=>{
  const f=evaluationFixture(),registration=new SecurityReadRegistration();
  const unsupported=structuredClone(f.policy);
  unsupported.rules[0]!.condition={op:'future'} as never;
  for(let i=0;i<40;i++)expect(()=>registration.register(unsupported,f.resolution)).toThrow();
  const handles=Array.from({length:32},()=>registration.register(f.policy,f.resolution));
  const candidate=structuredClone(f.policy);candidate.revision='unadmitted-capacity-revision';
  expect(()=>registration.register(candidate,f.resolution)).toThrow('Security registration bound exceeded');
  expect(()=>registration.register(f.policy,f.resolution)).toThrow('Security registration bound exceeded');
  const request={action:'read',output:[ref('salary')],resources:[f.resource]};
  for(const handle of handles)expect(registration.evaluate(handle,f.cut,request)).toEqual({status:'evaluated',rows:[[{field:ref('salary'),disposition:'withheld'}]]});
});
