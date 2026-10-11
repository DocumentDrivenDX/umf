import {encodeSecurityDisclosure,decodeSecurityDisclosure,type SecurityDisclosureBatch} from '../../src/extensions/security/disclosure';
import {composeSecurityRules,type SecurityTruth,type SecurityDisposition} from '../../src/extensions/security/logic';
import {inspectSecurityPolicy,readSecuritySource,writeSecuritySource} from '../../src/extensions/security/policy';
import {securityFixture,ref} from './fixture';
import {canonicalSchemaJson} from '../../src/model/schema-literals';
import {securityPolicyDependencies} from '../../src/extensions/security/dependencies';
import {evaluateSecurityWrite} from '../../src/extensions/security/write';
import {writeFixture} from './write-fixture';
import {SecurityAuthorityGuard} from '../../src/extensions/security/authority-guard';
import {SecurityReadRegistration} from '../../src/extensions/security/registration';
import {evaluationFixture} from './evaluation-fixture';
import {evaluateSecurityAccess,evaluateSecurityCollection} from '../../src/extensions/security/evaluate';

/** Independent explicit expectations; no native/backend admission is inferred. */
export function securityLogicCorpus():{cases:number;mismatches:number} {
  let cases = 0, mismatches = 0;
  const check = (actual:unknown,expected:unknown) => {cases++; if(JSON.stringify(actual)!==JSON.stringify(expected))mismatches++;};
  for (const permit of ['T','F','U'] as SecurityTruth[]) for (const require of ['T','F','U'] as SecurityTruth[]) for (const forbid of ['T','F','U'] as SecurityTruth[]) {
    check(composeSecurityRules([{effect:'permit',truth:permit},{effect:'require',truth:require},{effect:'forbid',truth:forbid}]).decision,
      [permit,require,forbid].includes('U') ? 'indeterminate' : permit==='T' && require==='T' && forbid==='F' ? 'permit' : 'deny');
  }
  const values:SecurityDisposition[] = [{kind:'original'},{kind:'withheld'},
    {kind:'transformed',type:'string',value:'x'},{kind:'transformed',type:'string',value:'y'}];
  for (const a of values) for (const b of values) for (const c of values) {
    const ds = [a,b,c];
    const expected = ds.some(d=>d.kind==='withheld') ? {kind:'withheld'} :
      ds.some(d=>d.kind==='transformed' && d.value==='x') && ds.some(d=>d.kind==='transformed' && d.value==='y') ? null :
      ds.find(d=>d.kind==='transformed') ?? {kind:'original'};
    for (const order of [[a,b,c],[a,c,b],[b,a,c],[b,c,a],[c,a,b],[c,b,a]]) {
      const result=composeSecurityRules(order.map(d=>({effect:'permit',truth:'T',disclosure:{salary:d}})),['salary']);
      check(result.decision,expected===null?'conflict':'permit');
      check(result.disclosure,expected===null?{}:{salary:expected});
    }
  }
  return {cases,mismatches};
}

export function securityPolicyCorpus() {
  let cases=0,mismatches=0;
  const results:{id:string;valid:boolean;complete:boolean;codes:string[]}[]=[];
  for(const mutation of ['valid','wrong-document','stale-revision','wrong-endpoint','wrong-type','unknown-member','unknown-op','missing-closure']){
    const {policy,resolution}=securityFixture();let expectedValid=true,expectedComplete=false;
    if(mutation==='valid')expectedComplete=true;
    if(mutation==='wrong-document'){policy.rules[0]!.target[0]!.documentId='other';expectedValid=false;}
    if(mutation==='stale-revision'){resolution.documents[0]!.revision='stale';expectedValid=false;}
    if(mutation==='wrong-endpoint'){resolution.ontology.associations[0]!.endpoints[0]!.fields=[ref('active')];expectedValid=false;}
    if(mutation==='wrong-type'){policy.rules[0]!.condition={op:'eq',left:{kind:'resource',field:ref('salary')},right:{kind:'constant',field:ref('active'),value:{boolean:true}}};expectedValid=false;}
    if(mutation==='unknown-member')(policy as any).future={opaque:['retain',null]};
    if(mutation==='unknown-op'){policy.rules[0]!.condition={op:'future'} as any;expectedValid=false;}
    const result=inspectSecurityPolicy(policy,mutation==='missing-closure'?undefined:resolution);
    cases++;if(result.valid!==expectedValid||result.complete!==expectedComplete)mismatches++;
    results.push({id:mutation,valid:result.valid,complete:result.complete,codes:result.diagnostics.map(d=>d.code)});
    for(const format of ['json','yaml'] as const){
      const recovered=readSecuritySource(writeSecuritySource(policy,format),format);
      cases++;if(canonicalSchemaJson(recovered)!==canonicalSchemaJson(policy))mismatches++;
    }
  }
  return {cases,mismatches,results};
}

export function securityEvaluationCorpus(){
  const outcomes:{id:string;expected:string;observed:string}[]=[];
  for(const mutation of ['assigned','inactive','sibling','missing','untrusted','stale','incomplete','budget','forbid']){
    const f=evaluationFixture();let expected='deny';
    if(mutation==='assigned')expected='permit';
    if(mutation==='inactive')f.assignment.fields.find(v=>v.field.elementId==='active')!.value={boolean:false};
    if(mutation==='sibling')f.assignment.fields.find(v=>v.field.elementId==='assignmentProject')!.value={string:'p2'};
    if(mutation==='missing')f.cut.facts=[f.owner];
    if(mutation==='untrusted'){f.cut.trusted=false;expected='indeterminate';}
    if(mutation==='stale'){f.cut.expectedGeneration='g2';expected='indeterminate';}
    if(mutation==='incomplete'){f.cut.coverage.find(c=>c.type.elementId==='Assignment')!.complete=false;expected='indeterminate';}
    if(mutation==='budget'){f.cut.maxSteps=1;expected='indeterminate';}
    if(mutation==='forbid')f.policy.rules.push({id:'no',effect:'forbid',actions:['read'],target:[ref('Resource')],condition:{op:'literal',value:true}});
    const observed=evaluateSecurityAccess(f.policy,f.resolution,f.cut,{action:'read',output:[ref('salary')]},f.resource).decision;
    outcomes.push({id:mutation,expected,observed});
  }
  const empty=evaluationFixture();empty.cut.coverage=empty.cut.coverage.filter(c=>c.type.elementId!=='Assignment');
  outcomes.push({id:'empty-incomplete',expected:'refused',observed:evaluateSecurityCollection(empty.policy,empty.resolution,empty.cut,{action:'read',targets:[ref('Resource')],resources:[],output:[]}).status});
  for(const operator of ['predicate','order','group','join','aggregate'] as const){
    const f=evaluationFixture();const request={action:'read',targets:[ref('Resource')],resources:[],output:[],queryUses:[{field:ref('salary'),operator,originalAction:'query-original'}]};
    outcomes.push({id:`empty-prohibited-${operator}`,expected:'refused',observed:evaluateSecurityCollection(f.policy,f.resolution,f.cut,{...request,queryUses:[{field:ref('salary'),operator}]}).status});
    f.resolution.ontology.entities.find(t=>t.type.elementId==='Resource')!.fields.find(p=>p.ref.elementId==='salary')!.queryUse={[operator]:'original-authorized'};
    f.resolution.ontology.actions.push('query-original');const membership=f.policy.rules[1]!.condition;f.policy.rules[1]!.condition={op:'literal',value:true};
    f.policy.rules.push({id:'original',effect:'permit',actions:['query-original'],target:[ref('Resource')],condition:membership});
    outcomes.push({id:`empty-original-complete-${operator}`,expected:'evaluated',observed:evaluateSecurityCollection(f.policy,f.resolution,f.cut,request).status});
    f.cut.coverage.find(c=>c.type.elementId==='Assignment')!.complete=false;
    outcomes.push({id:`empty-original-incomplete-${operator}`,expected:'refused',observed:evaluateSecurityCollection(f.policy,f.resolution,f.cut,request).status});
  }
  return {cases:outcomes.length,mismatches:outcomes.filter(o=>o.expected!==o.observed).length,outcomes};
}

export function securityRegistrationCorpus(){
  const f=evaluationFixture(),r=new SecurityReadRegistration(),handle=r.register(f.policy,f.resolution);
  const request={action:'read',output:[ref('salary')],resources:[f.resource]};
  const outcomes:{id:string;expected:string;observed:string}[]=[{id:'registered',expected:'withheld',observed:r.evaluate(handle,f.cut,request).rows[0]![0]!.disposition},
    {id:'fabricated',expected:'refused',observed:r.evaluate({kind:'registered-security-read'},f.cut,request).status},
    {id:'foreign',expected:'refused',observed:new SecurityReadRegistration().evaluate(handle,f.cut,request).status}];
  f.resolution.ontology.entities[2]!.fields.find(x=>x.ref.elementId==='salary')!.protection='unprotected';
  let reused=false;try{r.register(f.policy,f.resolution);}catch(error){reused=(error as {code?:string})?.code==='SECURITY_REVISION_REUSE';}
  outcomes.push({id:'revision-reuse',expected:'true',observed:String(reused)},
    {id:'immutable',expected:'withheld',observed:r.evaluate(handle,f.cut,request).rows[0]![0]!.disposition});
  const stable=evaluationFixture(),atomic=new SecurityReadRegistration();atomic.register(stable.policy,stable.resolution);
  const bad=evaluationFixture();bad.policy.revision='policy-2';
  bad.policy.rules[0]!.disclosure![0]!.disposition={kind:'original'};
  bad.resolution.ontology.entities[2]!.fields.find(x=>x.ref.elementId==='salary')!.protection='unprotected';
  let lateRefused=false;try{atomic.register(bad.policy,bad.resolution);}catch(error){lateRefused=(error as {code?:string})?.code==='SECURITY_REVISION_REUSE';}
  outcomes.push({id:'late-conflict',expected:'true',observed:String(lateRefused)});
  const replacement=evaluationFixture();replacement.policy.revision='policy-2';replacement.cut.policyRevision='policy-2';
  const repaired=atomic.register(replacement.policy,replacement.resolution);
  outcomes.push({id:'failed-candidate-not-pinned',expected:'withheld',observed:atomic.evaluate(repaired,replacement.cut,request).rows[0]![0]!.disposition});
  const bounded=new SecurityReadRegistration(),unsupported=structuredClone(stable.policy);
  unsupported.rules[0]!.condition={op:'future'} as never;
  let unsupportedRefusals=0;
  for(let i=0;i<40;i++)try{bounded.register(unsupported,stable.resolution);}catch(error){if((error as {code?:string})?.code==='SECURITY_INTERPRETATION')unsupportedRefusals++;}
  outcomes.push({id:'unsupported-no-slots',expected:'40',observed:String(unsupportedRefusals)});
  const handles=Array.from({length:32},()=>bounded.register(stable.policy,stable.resolution));
  let capacityRefused=false;try{bounded.register(stable.policy,stable.resolution);}catch(error){capacityRefused=(error as {code?:string})?.code==='SECURITY_REGISTRATION_BOUND';}
  outcomes.push({id:'capacity-refusal',expected:'true',observed:String(capacityRefused)},
    {id:'all-prior-handles-preserved',expected:'true',observed:String(handles.every(h=>bounded.evaluate(h,stable.cut,request).rows[0]?.[0]?.disposition==='withheld'))});
  return {cases:outcomes.length,mismatches:outcomes.filter(x=>x.expected!==x.observed).length,outcomes};
}

export async function securityGuardCorpus(){
  const barrier=()=>{let release!:()=>void;const wait=new Promise<void>(resolve=>release=resolve);return {wait,release};};
  const outcomes:{id:string;expected:unknown;observed:unknown}[]=[];
  const guard=new SecurityAuthorityGuard('g1'),entered=barrier(),release=barrier(),changeEntered=barrier(),commit=barrier();
  let changed=false;const generations:string[]=[];
  const reader=guard.read(async generation=>{generations.push(generation);entered.release();await release.wait;});await entered.wait;
  const change=guard.change('g2',async()=>{changed=true;changeEntered.release();await commit.wait;});
  const next=guard.read(async generation=>{generations.push(generation);});await Promise.resolve();
  outcomes.push({id:'drain',expected:false,observed:changed});release.release();await reader;await changeEntered.wait;
  outcomes.push({id:'exclusive',expected:['g1'],observed:[...generations]});commit.release();await Promise.all([change,next]);
  outcomes.push({id:'fresh-generation',expected:['g1','g2'],observed:generations});
  let called=false;const reuse=await guard.change('g1',async()=>{called=true;}).catch(error=>error.code);
  outcomes.push({id:'reuse',expected:'SECURITY_GUARD_REFUSED',observed:reuse},{id:'no-reuse-effect',expected:false,observed:called});
  const uncertain=new SecurityAuthorityGuard('old');
  outcomes.push({id:'unknown-transition',expected:'SECURITY_TRANSITION_UNKNOWN',observed:await uncertain.change('new',async()=>{throw new Error('unknown');}).catch(error=>error.code)},
    {id:'closed',expected:'SECURITY_GUARD_REFUSED',observed:await uncertain.read(async()=>true).catch(error=>error.code)});
  return {cases:outcomes.length,mismatches:outcomes.filter(x=>JSON.stringify(x.expected)!==JSON.stringify(x.observed)).length,outcomes};
}

export function securityWriteCorpus(){
  const outcomes:{id:string;expected:string;observed:string}[]=[];
  for(const mutation of ['both-states','field-denied','ownership-denied','policy-denied','mixed-generation','missing-policy-field']){
    const f=writeFixture();let expected='deny';
    if(mutation==='both-states')expected='permit';
    if(mutation==='field-denied')f.policy.rules.find(r=>r.id==='writer')!.actions=f.policy.rules.find(r=>r.id==='writer')!.actions.filter(a=>a!=='write-fields');
    if(mutation==='ownership-denied'){
      f.policy.rules.find(r=>r.id==='write-membership')!.condition={op:'literal',value:true};
      f.proposed.cut.facts.find(r=>r.type.elementId==='Ownership')!.fields.find(x=>x.field.elementId==='ownerProject')!.value={string:'p2'};
      f.policy.rules.find(r=>r.id==='writer')!.actions=f.policy.rules.find(r=>r.id==='writer')!.actions.filter(a=>a!=='change-owner');
    }
    if(mutation==='policy-denied'){f.profile.policyFields.push(f.profile.fieldActions[1]!.field);f.policy.rules.find(r=>r.id==='writer')!.actions=f.policy.rules.find(r=>r.id==='writer')!.actions.filter(a=>a!=='change-policy');}
    if(mutation==='missing-policy-field'){f.policy.rules.push({id:'salary-policy',effect:'require',actions:['update'],target:[ref('Resource')],condition:{op:'eq',left:{kind:'resource',field:ref('salary')},right:{kind:'resource',field:ref('salary')}}});expected='indeterminate';}
    if(mutation==='mixed-generation'){f.proposed.cut.generation='g2';f.proposed.cut.expectedGeneration='g2';expected='indeterminate';}
    outcomes.push({id:mutation,expected,observed:evaluateSecurityWrite(f.policy,f.resolution,f.profile,{operation:'update',original:f.original,proposed:f.proposed}).decision});
  }
  return {cases:outcomes.length,mismatches:outcomes.filter(x=>x.expected!==x.observed).length,outcomes};
}

export function securityDependencyCorpus(){
  const f=securityFixture();
  const expected={fields:['active','assignmentProject','assignmentStaff','ownerProject','ownerResource','projectId','resourceId','staffId'].map(ref),associations:[ref('Assignment'),ref('Ownership')]};
  const observed=securityPolicyDependencies(f.policy,f.resolution);
  (f.policy as any).future={trusted:true};let refused=false;try{securityPolicyDependencies(f.policy,f.resolution);}catch{refused=true;}
  const outcomes=[{id:'typed-dependencies',expected,observed},{id:'unknown-refusal',expected:true,observed:refused}];
  return {cases:outcomes.length,mismatches:outcomes.filter(x=>JSON.stringify(x.expected)!==JSON.stringify(x.observed)).length,outcomes};
}

export function securityDisclosureCorpus(){
  const f=securityFixture();
  const batch:SecurityDisclosureBatch={version:'umf.security.disclosure/0.1.0',target:ref('Resource'),fields:[ref('salary')],rows:[[{field:ref('salary'),disposition:'transformed',outputType:ref('resourceId'),value:{string:'restricted'}}],[{field:ref('salary'),disposition:'withheld'}]]};
  const observed=JSON.parse(JSON.stringify(decodeSecurityDisclosure(encodeSecurityDisclosure(batch,f.policy,f.resolution),f.policy,f.resolution)));
  let refused=false;const malformed=JSON.parse(JSON.stringify(batch));malformed.rows[1][0].value={integerToken:'123'};
  try{encodeSecurityDisclosure(malformed,f.policy,f.resolution);}catch{refused=true;}
  const outcomes=[{id:'typed-round-trip',expected:batch,observed},{id:'extra-withheld-value',expected:true,observed:refused}];
  return {cases:outcomes.length,mismatches:outcomes.filter(x=>JSON.stringify(x.expected)!==JSON.stringify(x.observed)).length,outcomes};
}
