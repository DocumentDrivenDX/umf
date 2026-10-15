import {evaluateSecurityPolicyV2LegacyAccess} from '../../../src/extensions/security/policy-v2-legacy-access';
import {test,expect} from 'bun:test';
import {securityFixture,ref} from '../fixture';
import {evaluationFixture} from '../evaluation-fixture';
import {evaluateSecurityAccess,type SecurityAccessResult} from '../../../src/extensions/security/evaluate';
import {upgradeSecurityPolicySource,downgradeSecurityPolicySource,inspectSecurityPolicyV2Source} from '../../../src/extensions/security/policy-representation-v2';
import {resolveSecurityProtectionSources} from '../../../src/extensions/security/protection/references';
import {inspectSecurityPolicy} from '../../../src/extensions/security/policy';
const field={documentId:'d',moduleId:'m',elementId:'f'};
const catalog=():any=>({vocabulary:'umf.security.protection',version:'0.1.0',id:'catalog',revision:'c1',transforms:[{id:'masked',version:'t1',kind:'mask',function:'constant',inputDomain:field,outputDomain:field,determinism:'deterministic',reversibility:'none',disclosureProfile:[],queryUse:{},parameters:[]}]});
const referencePolicy=():any=>({vocabulary:'umf.security',version:'0.2.0',id:'p',revision:'p2',ontology:{documentId:'ontology',revision:'o1'},protection:{id:'catalog',revision:'c1'},rules:[{id:'r',effect:'permit',actions:['read'],target:[field],condition:{op:'literal',value:true},disclosure:[{field,disposition:{kind:'transformed',vocabulary:'umf.security.protection',transform:'masked',version:'t1',field}}]}]});
test('representation upgrade changes only version/revision and preserves exact legacy constant payload',()=>{
 // @covers US-079-AC12
 const source:any=securityFixture().policy;source.native={sql:'opaque\n-- unchanged'};source.future={kept:[null,{integerToken:'9007199254740993'}]};
 const original=structuredClone(source),result=upgradeSecurityPolicySource(source,'policy-new');expect(result.status).toBe('migrated');expect(source).toEqual(original);expect(result.source).toEqual(source);
 expect(result.target).toEqual({...source,version:'0.2.0',revision:'policy-new'});expect(result.diagnostics.map(d=>d.path)).toEqual(['/future']);expect(result.complete).toBe(false);expect(result.authority).toBe(false);
 expect(Object.isFrozen((result.target as any).rules[0].condition)).toBe(true);expect((result.target as any).rules).not.toBe((result.source as any).rules);
 const back=downgradeSecurityPolicySource(result.target,'policy-back');expect(back.status).toBe('migrated');expect(back.target).toEqual({...source,revision:'policy-back'});
 expect(inspectSecurityPolicy(back.target,securityFixture().resolution).complete).toBe(false); // retained unknown content blocks interpretation
});
test('new revision, source shape and source/target text budgets are enforced',()=>{
 const source=securityFixture().policy;
 for(const revision of ['',source.revision,null,{},42])expect(upgradeSecurityPolicySource(source,revision).status).toBe('refused');
 expect(upgradeSecurityPolicySource({...source,version:'future'},'new').target).toBeUndefined();
 expect(upgradeSecurityPolicySource({...source,native:{large:'x'.repeat(4_000_001)}},'new').status).toBe('refused');
 expect(upgradeSecurityPolicySource(source,'x'.repeat(4_000_001)).status).toBe('refused');
 let calls=0;const bad={get vocabulary(){calls++;return 'umf.security';}};expect(upgradeSecurityPolicySource(bad,'new').status).toBe('refused');expect(calls).toBe(0);
});
test('unknown old members cannot be silently promoted into recognized new meaning',()=>{
 const source:any=securityFixture().policy;source.protection={id:'catalog',revision:'c1'};const upgraded=upgradeSecurityPolicySource(source,'new');expect(upgraded.status).toBe('refused');expect(upgraded.target).toBeUndefined();expect(upgraded.source).toEqual(source);expect(upgraded.diagnostics.some(d=>d.code==='SECURITY_MIGRATION_MEANING')).toBe(true);
});
test('catalog references require an exact pin and cannot masquerade as inline constants',()=>{
 // @covers US-079-AC12
 const source=referencePolicy();expect(inspectSecurityPolicyV2Source(source).valid).toBe(true);
 const noPin=structuredClone(source);delete noPin.protection;expect(inspectSecurityPolicyV2Source(noPin).valid).toBe(false);
 const mixed=structuredClone(source);mixed.rules[0].disclosure[0].disposition.value={string:'must not be ignored'};expect(inspectSecurityPolicyV2Source(mixed).valid).toBe(false);
 for(const name of ['masked','constant']){const p=referencePolicy();p.rules[0].disclosure[0].disposition.transform=name;p.rules[0].disclosure[0].disposition.version='0.1.0';const result=downgradeSecurityPolicySource(p,'rollback');expect(result.status).toBe('refused');expect(result.target).toBeUndefined();expect(result.source).toEqual(p);}
 const unused={...(upgradeSecurityPolicySource(securityFixture().policy,'p2').target as any),protection:{id:'c',revision:'r'}};expect(downgradeSecurityPolicySource(unused,'rollback').status).toBe('refused');
});
test('record/relationship prototype grammar is preserved but not downgraded or activated',()=>{
 const p=referencePolicy();delete p.protection;p.rules[0].disclosure=[];p.rules[0].condition={op:'exists',association:{documentId:'d',moduleId:'m',relationshipId:'relationship'},as:'r',where:{op:'literal',value:true}};
 const inspected=inspectSecurityPolicyV2Source(p);expect(inspected.valid).toBe(true);expect(inspected.complete).toBe(false);expect(downgradeSecurityPolicySource(p,'rollback').status).toBe('refused');
});
test('exact source lookup retains both snapshots and returns bounded coordinates, never domain authority',()=>{
 // @covers US-079-AC11
 const p=referencePolicy(),c=catalog(),resolved=resolveSecurityProtectionSources(p,c);expect(resolved.status).toBe('resolved-source');expect(resolved.references).toEqual([{ruleIndex:0,disclosureIndex:0,transformIndex:0}]);expect(resolved.authority).toBe(false);expect(resolved.complete).toBe(false);expect(resolved.policy).toEqual(p);expect(resolved.catalog).toEqual(c);expect(Object.isFrozen(resolved.catalog)).toBe(true);
 for(const changed of [{...c,id:'foreign'},{...c,revision:'stale'},{...c,transforms:[{...c.transforms[0],version:'other'}]}]){const refused=resolveSecurityProtectionSources(p,changed);expect(refused.status).toBe('refused');expect(refused.references).toEqual([]);}
 const future={...c,transforms:[{...c.transforms[0],kind:'future'}]};expect(resolveSecurityProtectionSources(p,future).status).toBe('refused');
});

test('known legacy roundtrip retains constant behavior but never refreshes a host fact attestation',()=>{
 const f=evaluationFixture();f.policy.rules[0]!.disclosure![0]!.disposition={kind:'transformed',transform:'constant',version:'0.1.0',field:ref('staffId'),value:{string:'redacted'}};
 const request={action:'read',output:[ref('salary')]},before=evaluateSecurityAccess(f.policy,f.resolution,f.cut,request,f.resource);
 expect(before).toEqual({decision:'permit',output:[{field:ref('salary'),disposition:'transformed',outputType:ref('staffId'),value:{string:'redacted'}}]});
 const upgraded=upgradeSecurityPolicySource(f.policy,'p2'),back=downgradeSecurityPolicySource(upgraded.target,'p3');expect(back.status).toBe('migrated');
 const restored=back.target as unknown as typeof f.policy;expect(inspectSecurityPolicy(restored,f.resolution).complete).toBe(true);
 expect(evaluateSecurityAccess(restored,f.resolution,f.cut,request,f.resource).decision).toBe('indeterminate');
 const separatelyAuthoredFixtureCut={...f.cut,policyRevision:'p3'};
 expect(evaluateSecurityAccess(restored,f.resolution,separatelyAuthoredFixtureCut,request,f.resource)).toEqual(before);
 expect(inspectSecurityPolicy(upgraded.target,f.resolution).valid).toBe(false); // active0.1 interpreter does not activate0.2
});


test('forward0.2 legacy embedding evaluates the original revision and refuses unsupported meaning',()=>{
 const f=evaluationFixture();f.policy.rules[0]!.disclosure![0]!.disposition={kind:'transformed',transform:'constant',version:'0.1.0',field:ref('staffId'),value:{string:'redacted'}};
 const request={action:'read',output:[ref('salary')]};
 const expected:SecurityAccessResult={decision:'permit',output:[{field:ref('salary'),disposition:'transformed',outputType:ref('staffId'),value:{string:'redacted'}}]};
 const upgraded=upgradeSecurityPolicySource(f.policy,'p2');expect(upgraded.status).toBe('migrated');
 const freshCut={...f.cut,policyRevision:'p2'}; // separately authored fixture attestation
 const result=evaluateSecurityPolicyV2LegacyAccess(upgraded.target,f.resolution,freshCut,request,f.resource);
 expect(result.result).toEqual(expected);expect(result.authority).toBe(false);expect(result.source).toEqual(upgraded.target!);expect(Object.isFrozen(result.result.output)).toBe(true);
 expect(evaluateSecurityPolicyV2LegacyAccess(upgraded.target,f.resolution,f.cut,request,f.resource).result).toEqual({decision:'indeterminate',output:[]});
 for(const policy of [f.policy,{...(upgraded.target as any),future:true},{...(upgraded.target as any),protection:{id:'c',revision:'r'}},referencePolicy()]){
  expect(evaluateSecurityPolicyV2LegacyAccess(policy,f.resolution,freshCut,request,f.resource).result).toEqual({decision:'indeterminate',output:[]});
 }
 const noAssignment={...freshCut,facts:[f.owner]};expect(evaluateSecurityPolicyV2LegacyAccess(upgraded.target,f.resolution,noAssignment,request,f.resource).result.decision).toBe('deny');
 const incomplete={...freshCut,coverage:[]};expect(evaluateSecurityPolicyV2LegacyAccess(upgraded.target,f.resolution,incomplete,request,f.resource).result.decision).toBe('indeterminate');
});
