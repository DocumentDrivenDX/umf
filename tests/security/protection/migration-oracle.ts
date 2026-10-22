// SPDX-License-Identifier: MIT OR Apache-2.0
import {CURRENT_CORE_VERSION} from '../../../src/generated/core-model';
/** Independent S15 component oracle. Expected values are authored here, not copied from engine output. */
import * as api from '../../../src/index';
const ref=(elementId:string)=>({documentId:'review-domain',moduleId:'model',elementId});
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const same=(a:any,b:any):boolean=>JSON.stringify(a)===JSON.stringify(b);
const no=(decision='indeterminate')=>({decision,output:[]});
function fixture(kind='string',literal:any={string:'masked'},facets:any=undefined){
 const field=(id:string,scalarType:string,nullability='required')=>({id,kind:'field',scalarType,nullability,cardinality:'one',extensions:{}});
 const key=(id:string)=>[{id:'pk',name:'Primary',fields:[{module:'model',element:id}]}];
 const elements:any[]=[{id:'Person',kind:'record',members:[{module:'model',element:'personId'}],keys:key('personId'),extensions:{}},field('personId','string'),{id:'Asset',kind:'record',members:['assetId','amount','active'].map(element=>({module:'model',element})),keys:key('assetId'),extensions:{}},field('assetId','string'),field('amount','integer'),field('active','boolean'),{...field('output',kind,literal===null?'absent-allowed':'required'),...(facets?{facets}: {})}];
 const document={umf:CURRENT_CORE_VERSION,id:'review-domain',vocabularies:{},modules:[{id:'model',namespace:'',elements}]};
 const entity=(name:string,fields:string[])=>({type:ref(name),keyId:'pk',fields:fields.map(n=>({ref:ref(n),protection:n==='amount'?'protected':'unprotected'}))});
 const ontology={version:'0.1.0',documentId:'review-domain',revision:'ontology-original',documents:[{documentId:'review-domain',revision:'schema-original'}],subject:ref('Person'),entities:[entity('Person',['personId']),entity('Asset',['assetId','amount','active'])],associations:[],context:[],actions:['read','inspect-original']};
 const disposition={kind:'transformed',transform:'constant',version:'0.1.0',field:ref('output'),value:literal};
 const policy:any={vocabulary:'umf.security',version:'0.1.0',id:'review-policy',revision:'legacy-original',ontology:{documentId:'review-domain',revision:'ontology-original'},native:{archive:'retained\n😀'},rules:[{id:'allow',effect:'permit',actions:['read'],target:[ref('Asset')],condition:{op:'literal',value:true},disclosure:[{field:ref('amount'),disposition}]}]};
 const subject={type:ref('Person'),key:[{string:'alice'}],fields:[{field:ref('personId'),value:{string:'alice'}}],absent:[]};
 const resource={type:ref('Asset'),key:[{string:'asset'}],fields:[{field:ref('assetId'),value:{string:'asset'}},{field:ref('amount'),value:{integerToken:'100'}},{field:ref('active'),value:{boolean:true}}],absent:[]};
 const cut:any={trusted:true,generation:'generation-original',expectedGeneration:'generation-original',policyId:'review-policy',policyRevision:'legacy-original',ontologyDocumentId:'review-domain',ontologyRevision:'ontology-original',subjects:[subject],facts:[],coverage:ontology.entities.map(t=>({type:t.type,complete:true,fields:t.fields.map(f=>f.ref)})),context:[],maxFacts:32,maxSteps:10000};
 return {policy,resolution:{ontology,documents:[{revision:'schema-original',document}]},cut,resource,request:{action:'read',output:[ref('amount')]},expected:{decision:'permit',output:[{field:ref('amount'),disposition:'transformed',outputType:ref('output'),value:literal}]}};
}
export function runOracle(){
 const rows:{id:string;passed:boolean;detail?:unknown}[]=[];
 const assert=(id:string,yes:boolean,detail?:unknown)=>rows.push({id,passed:yes,...(yes?{}:{detail})});
 const eval2=(p:any,f:any,cut:any={...f.cut,policyRevision:'forward-revision'},request:any=f.request,resource:any=f.resource)=>api.evaluateSecurityPolicyV2LegacyAccess(p,f.resolution,cut,request,resource);
 const cases:any[]=[['string','string',{string:'\uFEFFmasked 😀\u0000'}],['boolean','boolean',{boolean:false}],['integer-large','integer',{integerToken:'9007199254740993'}],['integer-exponent','integer',{integerToken:'1e2'}],['integer-minus-zero','integer',{integerToken:'-0'}],['decimal','decimal',{decimalToken:'1.2300'},{precision:12,scale:4}],['binary','binary',{binaryHex:'0001aB'}],['null','string',null]];
 for(const [name,kind,literal,facets] of cases){
  const f=fixture(kind,literal,facets),before=clone(f),up=api.upgradeSecurityPolicySource(f.policy,'forward-revision');
  assert(name+':upgrade-frame',up.status==='migrated'&&same(up.target,{...before.policy,version:'0.2.0',revision:'forward-revision'})&&same(up.source,before.policy));
  const old=api.evaluateSecurityAccess(f.policy as any,f.resolution as any,f.cut,f.request,f.resource as any),forward=eval2(up.target,f);
  assert(name+':legacy-independent-meaning',same(old,f.expected),old);
  assert(name+':forward-independent-meaning',same(forward.result,f.expected),forward);
  assert(name+':retained-source-nonauthority',same(forward.source,up.target)&&forward.authority===false&&forward.subset==='legacy-body-0.1'&&forward.diagnostics.length===0&&Object.isFrozen(forward)&&Object.isFrozen(forward.result.output));
  assert(name+':stale-forward-cut',same(eval2(up.target,f,f.cut).result,no()));
  const down=api.downgradeSecurityPolicySource(up.target,'rollback-revision');
  assert(name+':rollback-frame',down.status==='migrated'&&same(down.target,{...before.policy,revision:'rollback-revision'}));
  assert(name+':rollback-independent-meaning',same(api.evaluateSecurityAccess(down.target as any,f.resolution as any,{...f.cut,policyRevision:'rollback-revision'},f.request,f.resource as any),f.expected));
  assert(name+':stale-rollback-cut',same(api.evaluateSecurityAccess(down.target as any,f.resolution as any,f.cut,f.request,f.resource as any),no()));
  assert(name+':caller-input-unmodified-and-not-frozen',same(f,before)&&!Object.isFrozen(f.policy.rules)&&!Object.isFrozen(f.resource.fields));
 }
 const f=fixture(),up=api.upgradeSecurityPolicySource(f.policy,'forward-revision').target as any;
 const badCuts:any[]=[['untrusted',{trusted:false}],['generation',{expectedGeneration:'different'}],['policy-id',{policyId:'foreign'}],['policy-revision',{policyRevision:'foreign'}],['ontology-id',{ontologyDocumentId:'foreign'}],['ontology-revision',{ontologyRevision:'foreign'}],['no-subject',{subjects:[]}],['two-subjects',{subjects:[f.cut.subjects[0],f.cut.subjects[0]]}],['no-coverage',{coverage:[]}],['steps',{maxSteps:1}],['malformed-max',{maxSteps:true}]];
 // Constant disclosure needs no input-field coverage; use a field-dependent condition for coverage controls.
 const dependent=clone(up);dependent.rules.push({id:'requires-active',effect:'require',actions:['read'],target:[ref('Asset')],condition:{op:'eq',left:{kind:'resource',field:ref('active')},right:{kind:'constant',field:ref('active'),value:{boolean:true}}}});
 for(const [name,patch] of badCuts)assert('cut-refusal:'+name,same(eval2(dependent,f,{...f.cut,policyRevision:'forward-revision',...patch}).result,no()));
 for(const [name,change] of [
  ['root',(p:any)=>p.future=true],['rule',(p:any)=>p.rules[0].future=true],['condition',(p:any)=>p.rules[0].condition.future=true],['output-ref',(p:any)=>p.rules[0].disclosure[0].field.future=true],['disposition',(p:any)=>p.rules[0].disclosure[0].disposition.future=true],['ontology-pin',(p:any)=>p.ontology.future=true],['unused-pin',(p:any)=>p.protection={id:'catalog',revision:'catalog-1'}],['wrong-output-domain',(p:any)=>p.rules[0].disclosure[0].disposition.value={integerToken:'123'}],['wrong-action',(p:any)=>p.rules[0].actions=['undeclared']],['duplicate-rule',(p:any)=>p.rules.push(clone(p.rules[0]))],['wrong-version',(p:any)=>p.version='0.1.0'],['relationship-only',(p:any)=>p.rules[0].condition={op:'exists',association:{documentId:'review-domain',moduleId:'model',relationshipId:'edge'},as:'e',where:{op:'literal',value:true}}]
 ] as any[]){const p=clone(up);change(p);const original=clone(p);assert('source-refusal:'+name,same(eval2(p,f).result,no())&&same(p,original));}
 const badResolution=clone(f);badResolution.resolution.documents[0]!.revision='other';assert('resolution-stale',same(eval2(up,badResolution).result,no()));
 const unknownResolution=clone(f);(unknownResolution.resolution.ontology as any).future={};assert('resolution-unknown',same(eval2(up,unknownResolution).result,no()));
 for(const operator of ['predicate','join','group','order','aggregate'])assert('query-default-prohibited:'+operator,same(eval2(up,f,undefined,{...f.request,queryUses:[{field:ref('amount'),operator}]}).result,no()));
 assert('complete-target-inventory-sufficient-for-constant',same(eval2(up,f,{...f.cut,policyRevision:'forward-revision',coverage:[{type:ref('Asset'),complete:true,fields:[]}]}).result,f.expected));
 const deny=clone(up);deny.rules[0].condition.value=false;assert('deny',same(eval2(deny,f).result,no('deny')));
 const forbidden=clone(up);forbidden.rules.push({id:'block',effect:'forbid',actions:['read'],target:[ref('Asset')],condition:{op:'literal',value:true}});assert('forbid-deny',same(eval2(forbidden,f).result,no('deny')));
 const unknownResource=clone(f.resource);unknownResource.fields=unknownResource.fields.filter((v:any)=>v.field.elementId!=='active');assert('known-missing-operand-indeterminate',same(eval2(dependent,f,undefined,undefined,unknownResource).result,no()));
 const conflict=clone(up);const other=clone(conflict.rules[0]);other.id='other-mask';other.disclosure[0].disposition.value={string:'different'};conflict.rules.push(other);assert('constant-conflict',same(eval2(conflict,f).result,no('conflict')));
 const withheld=clone(conflict);withheld.rules.push({...clone(withheld.rules[0]),id:'withhold',disclosure:[{field:ref('amount'),disposition:{kind:'withheld'}}]});assert('withheld-over-conflict',same(eval2(withheld,f).result,{decision:'permit',output:[{field:ref('amount'),disposition:'withheld'}]}));
 const numeric=fixture('integer',{integerToken:'0'}),numericUp=clone(api.upgradeSecurityPolicySource(numeric.policy,'forward-revision').target) as any,second=clone(numericUp.rules[0]);second.id='negative-zero';second.disclosure[0].disposition.value={integerToken:'-0'};numericUp.rules.push(second);assert('equivalent-numeric-masks',same(eval2(numericUp,numeric).result,numeric.expected));
 const custody={owner:'opaque-owner',keyRef:'key:x',formatPreserving:false,storageEffect:'stored-transformed',propagation:{history:'declared',snapshots:'declared',exports:'declared',feeds:'declared',caches:'declared'}};
 const transforms:any[]=[...['constant','partial','fixed-length-redact','regex-replace','null-out'].map(fn=>({kind:'mask',function:fn})),...['range-bucket','truncate-date','prefix-only'].map(fn=>({kind:'generalize',function:fn})),{kind:'hash',algorithm:'sha256',saltCustody:{kind:'none'}},{kind:'tokenize',custody},{kind:'encrypt',custody}];
 for(const part of transforms){
  const label=part.kind+':'+(part.function??part.algorithm??'opaque');
  const t={id:'selected-'+label,version:'t1',inputDomain:ref('amount'),outputDomain:ref('output'),determinism:'deterministic',reversibility:'none',disclosureProfile:[],queryUse:{},parameters:[],...part};
  const catalog={vocabulary:'umf.security.protection',version:'0.1.0',id:'catalog',revision:'catalog-1',transforms:[t]};
  const p=clone(up);p.protection={id:'catalog',revision:'catalog-1'};p.rules[0].disclosure[0].disposition={kind:'transformed',vocabulary:'umf.security.protection',transform:t.id,version:t.version,field:ref('output')};
  const original=clone(p),lookup=api.resolveSecurityProtectionSources(p,catalog),down=api.downgradeSecurityPolicySource(p,'rollback-revision');
  assert('catalog:'+label+':valid-wire-and-exact-address',api.inspectProtectionCatalog(catalog).valid&&lookup.status==='resolved-source'&&same(lookup.references,[{ruleIndex:0,disclosureIndex:0,transformIndex:0}]),lookup);
  assert('catalog:'+label+':rollback-refuses-source-retained',down.status==='refused'&&down.target===undefined&&same(down.source,original)&&same(p,original)&&Object.isFrozen(down.source));
  assert('catalog:'+label+':forward-not-admitted',same(eval2(p,f).result,no()));
 }
 for(const name of ['constant','redact','future-unknown']){const p=clone(up);p.protection={id:'catalog',revision:'catalog-1'};p.rules[0].disclosure[0].disposition={kind:'transformed',vocabulary:'umf.security.protection',transform:name,version:'0.1.0',field:ref('output')};const original=clone(p),r=api.downgradeSecurityPolicySource(p,'rollback-revision');assert('catalog-name-independent:'+name,r.status==='refused'&&r.target===undefined&&same(r.source,original)&&same(p,original));}
 const opaque=clone(f.policy);opaque.future={text:'keep\u0000😀',literal:{integerToken:'1e2'}};const opaqueUp=api.upgradeSecurityPolicySource(opaque,'forward-revision'),opaqueDown=api.downgradeSecurityPolicySource(opaqueUp.target,'rollback-revision');assert('unknown-roundtrip-preserved',same(opaqueDown.target,{...opaque,revision:'rollback-revision'})&&same(eval2(opaqueUp.target,f).result,no()));
 const oldGate=api.inspectSecurityPolicy(up,f.resolution as any);assert('old-public-interpreter-stays-closed',!oldGate.valid&&!oldGate.complete);
 let getterCalls=0;const accessor={get vocabulary(){getterCalls++;return 'umf.security';}};assert('accessor-not-invoked',same(eval2(accessor,f).result,no())&&getterCalls===0);
 const frozenResult=eval2(up,f);try{(frozenResult.result.output as any).attemptedMutation='ignored';}catch{}assert('output-deep-frozen',Object.isFrozen(frozenResult.result.output[0])&&Object.isFrozen((frozenResult.result.output[0] as any).value));
 return rows;
}
