/** Executable component observations, not an acceptance runner binding. */
import * as api from '../../src/index';
export function policyV2Controls(f:any){
 const rows:{id:string;passed:boolean}[]=[];
 const add=(id:string,passed:boolean)=>rows.push({id,passed});
 const same=(a:any,b:any)=>JSON.stringify(a)===JSON.stringify(b);
 // Use fixture references; expected output below is authored independently of evaluator output.
 const inputField=f.policy.rules[0].disclosure[0].field;
 const outputField={...inputField,elementId:'staffId'};
 f.policy.rules[0].disclosure[0].disposition={kind:'transformed',transform:'constant',version:'0.1.0',field:outputField,value:{string:'redacted'}};
 const original=structuredClone(f.policy),up=api.upgradeSecurityPolicySource(f.policy,'p2');
 add('upgrade-exact-frame',up.status==='migrated'&&same(up.target,{...original,version:'0.2.0',revision:'p2'})&&same(f.policy,original));
 const request={action:'read',output:[inputField]},freshCut={...f.cut,policyRevision:'p2'};
 const expected={decision:'permit',output:[{field:inputField,disposition:'transformed',outputType:outputField,value:{string:'redacted'}}]};
 const evaluate=(p:any,cut:any=freshCut)=>api.evaluateSecurityPolicyV2LegacyAccess(p,f.resolution,cut,request,f.resource);
 const forward=evaluate(up.target);add('forward-constant-meaning',same(forward.result,expected));
 add('source-retained-authority-false',same(forward.source,up.target)&&forward.authority===false&&Object.isFrozen(forward.result.output));
 add('stale-cut-refuses',same(evaluate(up.target,f.cut).result,{decision:'indeterminate',output:[]}));
 add('missing-assignment-denies',evaluate(up.target,{...freshCut,facts:[f.owner]}).result.decision==='deny');
 add('incomplete-coverage-refuses',evaluate(up.target,{...freshCut,coverage:[]}).result.decision==='indeterminate');
 add('untrusted-cut-refuses',evaluate(up.target,{...freshCut,trusted:false}).result.decision==='indeterminate');
 add('stale-generation-refuses',evaluate(up.target,{...freshCut,expectedGeneration:'other'}).result.decision==='indeterminate');
 add('unknown-source-refuses',evaluate({...up.target as any,future:true}).result.decision==='indeterminate');
 add('unused-pin-refuses',evaluate({...up.target as any,protection:{id:'catalog',revision:'c1'}}).result.decision==='indeterminate');
 add('old-public-gate-refuses',api.inspectSecurityPolicy(up.target,f.resolution).valid===false);
 const back=api.downgradeSecurityPolicySource(up.target,'p3');add('downgrade-frame',same(back.target,{...original,revision:'p3'}));
 add('roundtrip-constant-meaning',same(api.evaluateSecurityAccess(back.target as any,f.resolution,{...f.cut,policyRevision:'p3'},request,f.resource),expected));
 const unknown={...original,future:{opaque:[null,'retained']}};const unknownUp=api.upgradeSecurityPolicySource(unknown,'p2');add('unknown-retained',same(unknownUp.target,{...unknown,version:'0.2.0',revision:'p2'}));
 const collision=api.upgradeSecurityPolicySource({...original,protection:{id:'c',revision:'r'}},'p2');add('unknown-to-known-refuses',collision.status==='refused'&&collision.target===undefined);
 const transformed:any=structuredClone(up.target);transformed.protection={id:'catalog',revision:'c1'};transformed.rules[0].disclosure[0].disposition={kind:'transformed',vocabulary:'umf.security.protection',transform:'constant',version:'0.1.0',field:outputField};
 const catalog={vocabulary:'umf.security.protection',version:'0.1.0',id:'catalog',revision:'c1',transforms:[{id:'constant',version:'0.1.0',kind:'mask',function:'constant',inputDomain:inputField,outputDomain:outputField,determinism:'deterministic',reversibility:'none',disclosureProfile:[],queryUse:{},parameters:[]}]};
 add('exact-lookup-index-zero',same(api.resolveSecurityProtectionSources(transformed,catalog).references,[{ruleIndex:0,disclosureIndex:0,transformIndex:0}]));
 add('stale-catalog-refuses',api.resolveSecurityProtectionSources(transformed,{...catalog,revision:'stale'}).status==='refused');
 add('wrong-transform-version-refuses',api.resolveSecurityProtectionSources(transformed,{...catalog,transforms:[{...catalog.transforms[0],version:'other'}]}).status==='refused');
 add('catalog-constant-no-downgrade',api.downgradeSecurityPolicySource(transformed,'p3').status==='refused');
 add('catalog-no-logical-permit',evaluate(transformed).result.decision==='indeterminate');
 const large={...original,native:{text:'x'.repeat(4_000_001)}};add('source-bound-refuses',api.upgradeSecurityPolicySource(large,'p2').status==='refused');
 add('target-bound-refuses',api.upgradeSecurityPolicySource(original,'x'.repeat(4_000_001)).status==='refused');
 return rows;
}
