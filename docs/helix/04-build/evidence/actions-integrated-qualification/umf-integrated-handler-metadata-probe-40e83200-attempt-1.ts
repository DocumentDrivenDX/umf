import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as u from '/private/tmp/umf-integrated-qualification-40e83200/src/index.ts';
import fixture from '/private/tmp/umf-integrated-qualification-40e83200/fixtures/actions/approve.json';
const root='/private/tmp/umf-integrated-qualification-40e83200/';
const captured=await Bun.file(root+'fixtures/validation/core-check-refresh/native-browser.json').json();
assert.equal(captured.sourceRevision,'40e83200fb34274b9cd6c6a99d404b6da2d89602');
const inputs=captured.sourceInputs as Record<string,string>;
const hash=async(path:string)=>createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex');
for(const [path,sha] of Object.entries(inputs))assert.equal(await hash(root+path),sha,path);
const source=structuredClone(fixture) as unknown as u.Document;
const a=(source.modules[0]!.extensions!['umf.actions'] as any).actions[0];
a.authorization.profile={id:'umf.actions.roles',version:'1'};
a.binding={kind:'handler',profile:{id:'opaque.handler.profile',version:'7'},handler:{id:'javascript:must-not-run',version:'9'}};
a.outputs=[{id:'order-result',kind:'entity',target:{module:'sales',element:'order',key:'pk'},required:true}];
a.preconditions=[{id:'pre-check',rule:{language:'opaque.rules',version:'3',expression:'fetch("https://invalid.example/pre"); throw "must-not-run"',references:[]},failure:{code:'PRE_FAILURE',message:'Exact precondition reason'}}];
a.postconditions=[{id:'post-check',rule:{language:'opaque.rules',version:'4',expression:'opaque output assertion — keep exact',references:[{output:'order-result'}]},failure:{code:'POST_FAILURE',message:'Exact postcondition reason'}}];
a.failures=[{code:'PRE_FAILURE',message:'Exact precondition reason',retryable:true},{code:'POST_FAILURE',message:'Exact postcondition reason',retryable:false}];
const before=JSON.stringify(source),identity={module:'sales',action:'approve'},registry=u.registerActions(new u.Registry());
const base='/modules/0/extensions/umf.actions/actions/0';
const expected=[['binding','binding'],['binding/handler','handler'],['preconditions/0','condition'],['preconditions/0/rule','condition'],['postconditions/0','condition'],['postconditions/0/rule','condition'],['outputs/0','output'],['failures/0','failure'],['failures/1','failure'],['authorization','authorization'],['attribution','attribution'],['atomicity','atomicity'],['idempotency','idempotency'],['result','result'],['writes/0','frame'],['writes/0/selector','selector']];
const dataEqual=(actual:unknown,wanted:unknown)=>assert.deepEqual(u.copyJson(actual),u.copyJson(wanted));
let fetchCalls=0;const previousFetch=globalThis.fetch;globalThis.fetch=(()=>{fetchCalls++;throw Error('NETWORK_MUST_NOT_RUN');}) as typeof fetch;
try {
 const inspection=u.inspectActions(source,registry);assert.equal(inspection.validation.valid,true);assert.equal(inspection.validation.complete,false);
 const inspected=inspection.actions[0]!;dataEqual(inspection.source,source);dataEqual(inspected.action,a);
 assert.equal(new Set(inspected.obligations.map(o=>o.id)).size,inspected.obligations.length);
 for(const [suffix,kind] of expected){const o=inspected.obligations.find(o=>o.id===base+'/'+suffix);assert.ok(o,'Missing '+suffix);assert.equal(o.kind,kind,suffix);assert.equal(o.path,o.id);}
 for(const suffix of ['binding/handler','preconditions/0/rule','postconditions/0/rule'])assert.equal(inspected.obligations.find(o=>o.id===base+'/'+suffix)!.status,'unchecked');
 for(const format of ['json','yaml'] as const){const back=u.readDocument(u.writeDocument(source,format),format);dataEqual(back,source);dataEqual(u.inspectActions(back,registry).actions[0]!.action,a);}
 const empty=structuredClone(source);delete empty.modules[0]!.extensions!['umf.actions'];dataEqual(u.declareAction(empty,'sales',a,registry),source);
 const profile:u.ActionExecutorProfile={id:'declaration-only',version:'1',actionVersion:'0.1.0',coreVersion:'0.8.0',source,identity,claims:inspected.obligations.map(o=>({obligation:o.id,status:'supported',evidence:['inert://not-execution-proof']}))};
 const assessment=u.assessAction(source,identity,profile,registry);assert.equal(assessment.declaredCompatible,true);assert.equal(assessment.executionVerified,false);dataEqual(assessment.outcomes.map(o=>o.obligation),inspected.obligations.map(o=>o.id));assert.ok(assessment.outcomes.every(o=>o.status==='supported'));
 for(const [suffix] of expected){const omitted={...profile,claims:profile.claims.filter(c=>c.obligation!==base+'/'+suffix)},r=u.assessAction(source,identity,omitted,registry);assert.equal(r.outcomes.find(o=>o.obligation===base+'/'+suffix)!.status,'unknown');assert.equal(r.declaredCompatible,false);assert.equal(r.executionVerified,false);}
 for(const status of ['unknown','unsupported'] as const){const changed=structuredClone(profile);changed.claims.find(c=>c.obligation===base+'/binding/handler')!.status=status;const r=u.assessAction(source,identity,changed,registry);assert.equal(r.outcomes.find(o=>o.obligation===base+'/binding/handler')!.status,status);assert.equal(r.declaredCompatible,false);}
 assert.equal(JSON.stringify(source),before);assert.equal(fetchCalls,0);
 console.log(JSON.stringify({handlerMetadataProbe:{profile:'independent-portable-handler-inventory/1',bun:Bun.version,fullActionAndSourcePreserved:true,jsonYamlRecoveries:2,declaredAuthoringExact:true,independentExpectedObligations:expected.length,actualInventory:inspected.obligations.length,omittedClaimControls:expected.length,unknownUnsupportedControls:2,inertFetchCalls:fetchCalls,executionVerified:false,scope:'One synthetic handler with opaque pre/post rules, entity output and two failure policies; public library only; no native handler execution or universal proof'}}));
} finally {globalThis.fetch=previousFetch;}
for(const [path,sha] of Object.entries(inputs))assert.equal(await hash(root+path),sha,path);
console.log(JSON.stringify({sourceHeldStable:true,capturedInputs:Object.keys(inputs).length,probeSha256:await hash(import.meta.path)}));
