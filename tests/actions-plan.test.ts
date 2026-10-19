import {CURRENT_CORE_VERSION} from '../src/generated/core-model';
import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import fixture from '../docs/helix/03-test/fixtures/bulk-update/model.json';
import {Registry} from '../src/registry/registry';
import {registerActions,inspectActions} from '../src/extensions/actions';
import {inspectActionPlan,prepareActionPlanModel,assessActionPlan} from '../src/extensions/actions/plans';
import type {ActionPlanArtifact,ActionPlanInspectionContext,ActionPlanCapabilities,PortableActionPlan} from '../src/extensions/actions/plan-types';
import type {Document} from '../src/model/types';
const artifact=(v:unknown):ActionPlanArtifact=>{const utf8=typeof v==='string'?v:JSON.stringify(v);return {mediaType:'application/json',utf8,sha256:createHash('sha256').update(utf8).digest('hex')};};
function setup(){
 const doc=structuredClone(fixture) as unknown as Document,model=artifact(doc),pin={documentId:doc.id,revision:'fixture1',umfVersion:CURRENT_CORE_VERSION,sha256:model.sha256};
 const action={identity:{module:'sales',action:'set-active'},documentSha256:model.sha256,invocation:{id:'umf.actions.tx',version:'1'}};
 const field={module:'sales',element:'last-seen'},target={module:'sales',element:'customer',key:'pk'};
 const context:ActionPlanInspectionContext={registry:registerActions(new Registry()),models:[{pin,artifact:model}],actions:[{pin:action,artifact:model}],selections:[{profile:{id:'test.selection',version:'1'},inspect:()=>({eligible:true,dependencies:[field],diagnostics:[]})}]};
 const plan:PortableActionPlan={protocol:'umf.actions.plan/1',model:pin,action,target,source:artifact({sql:'UPDATE Customer SET active=FALSE WHERE last_seen<100'}),selection:{profile:{id:'test.selection',version:'1'},artifact:artifact({field,value:{integerToken:'100'}}),dependencies:[field]},inputs:{entityParameter:'customer',assignments:[{input:'active-value',field:{module:'sales',element:'active'},value:{boolean:false}}]},execution:{selection:'frozen',atomicity:'batch',conflict:'stop',partition:'manifest-order',batchSize:2},limits:{maxItems:10000,maxManifestBytes:16777216}};
 return {doc,model,pin,action,context,plan};
}
function capabilities(s:ReturnType<typeof setup>):ActionPlanCapabilities {
 const claims:Record<string,string[]>={plan:['integrity','actionBinding'],selection:['interpretation','completeRead'],manifest:['partition','sealCustody'],guard:['identityVersion'],snapshot:['coherentCut'],bulk:['atomicBatch','replay','principal','recovery','cancel','retention']};
 const profiles:Record<string,{id:string;version:string}>={plan:{id:'umf.actions.plan',version:'1'},selection:s.plan.selection.profile,manifest:{id:'umf.actions.manifest',version:'1'},bulk:{id:'umf.actions.bulk',version:'1'},guard:{id:'test.guard',version:'1'},snapshot:{id:'test.snapshot',version:'1'}};
 const caps:any={};for(const [family,ids] of Object.entries(claims))caps[family]={profile:profiles[family],claims:ids.map(id=>({id:family+'.'+id,status:'supported',evidence:['fixture://declaration-only']}))};
 caps.action={id:'test.executor',version:'1',coreVersion:CURRENT_CORE_VERSION,actionVersion:'0.1.0',source:s.doc,identity:s.action.identity,claims:inspectActions(s.doc,s.context.registry).actions[0]!.obligations.map(o=>({obligation:o.id,status:'supported',evidence:['fixture://declaration-only']}))};return caps;
}
test('@covers US-902-AC1 registered_action: owner preparation, exact binding and callback preservation',()=>{
 const s=setup(),r=s.context.registry.get('umf.actions','0.1.0'),before=JSON.stringify(s.doc);
 const prepared=prepareActionPlanModel(s.pin,s.action,s.context);expect(createHash('sha256').update(prepared.utf8).digest('hex')).toBe(prepared.sha256);
 const body=JSON.parse(prepared.utf8);expect(body.entityParameter).toBe('customer');expect(body.assignments).toEqual([{input:'active-value',field:{module:'sales',element:'active'}}]);expect(body.frames).toEqual(['customer-write']);expect(body.obligations.every((o:any)=>o.status==='checked')).toBe(true);
 expect(inspectActionPlan(artifact(s.plan),s.context).eligible).toBe(true);expect(s.context.registry.get('umf.actions','0.1.0')).toBe(r);expect(JSON.stringify(s.doc)).toBe(before);
 s.plan.inputs.assignments[0]!.field.element='last-seen';expect(inspectActionPlan(artifact(s.plan),s.context).eligible).toBe(false);
});
test('@covers US-902-AC2 retain_unknown: source retained and relevant unknown blocks, annotations remain inert',()=>{
 const s=setup();s.plan['vendor.future']={preserve:['exact',null]};const source=artifact(s.plan),i=inspectActionPlan(source,s.context);expect(i.eligible).toBe(false);expect(i.source).toEqual(source);expect(i.plan?.['vendor.future']).toEqual(s.plan['vendor.future']);
 delete s.plan['vendor.future'];s.plan.annotations={unknown:{anything:'opaque'}};expect(inspectActionPlan(artifact(s.plan),s.context).eligible).toBe(true);
 s.plan.action.identity.action='missing';expect(inspectActionPlan(artifact(s.plan),s.context).eligible).toBe(false);
});
test('@covers US-902-AC3 capability_assessment: all claims and original action assessment, no execution attestation',()=>{
 const s=setup(),i=inspectActionPlan(artifact(s.plan),s.context),c=capabilities(s);expect(assessActionPlan(i,c,s.context).compatible).toBe(true);expect(assessActionPlan(i,c,s.context).executionVerified).toBe(false);
 c.snapshot.claims=[];expect(assessActionPlan(i,c,s.context).compatible).toBe(false);
 const forged=structuredClone(i);forged.plan!.inputs.assignments[0]!.value={boolean:true};expect(assessActionPlan(forged,capabilities(s),s.context).compatible).toBe(false);
});
test('@covers US-902-AC4 exact_values: incompatible/null/optional/key writes refuse',()=>{
 const s=setup();s.plan.inputs.assignments[0]!.value=null;expect(inspectActionPlan(artifact(s.plan),s.context).eligible).toBe(false);
 const d=setup();(d.doc.modules[0]!.extensions!['umf.actions'] as any).actions[0].parameters[1].required=false;const a=artifact(d.doc);d.pin.sha256=a.sha256;d.action.documentSha256=a.sha256;d.context.models[0]!.artifact=a;d.context.actions[0]!.artifact=a;expect(()=>prepareActionPlanModel(d.pin,d.action,d.context)).toThrow();
});
test('@covers US-902-AC6 strict_json_bounds: duplicate keys, surrogate, integrity, depth, hostile getter',()=>{
 const s=setup();for(const text of ['{"protocol":1,"protocol":2}','{"x":"\\ud800"}','{"x":'+ '['.repeat(65)+'0'+']'.repeat(65)+'}']){expect(inspectActionPlan(artifact(text),s.context).eligible).toBe(false);}
 const bad=artifact(s.plan);bad.sha256='0'.repeat(64);expect(inspectActionPlan(bad,s.context).diagnostics[0]?.code).toBe('PAP_INTEGRITY');
 expect(()=>inspectActionPlan(artifact(JSON.stringify({a:'x'.repeat(1048577)})),s.context)).toThrow();
 let calls=0;expect(()=>inspectActionPlan(Object.defineProperty({},'utf8',{get(){calls++;return '';},enumerable:true}) as any,s.context)).toThrow();expect(calls).toBe(0);
});
test('@covers US-902-AC5 portable_boundary: API result copies cannot mutate caller input',()=>{
 const s=setup(),a=artifact(s.plan),i=inspectActionPlan(a,s.context);i.plan!.inputs.assignments[0]!.value={boolean:true};i.source.utf8='changed';expect(s.plan.inputs.assignments[0]!.value).toEqual({boolean:false});expect(a.utf8).not.toBe('changed');
});
export {setup,artifact,capabilities};

import * as publicApi from '../src/index';
import {runActionPlanCorpus} from './actions-plan-corpus';
import {sha256Text,parsePlanJson} from '../src/extensions/actions/plan-artifacts';
import {checkActionPlan,checkPreparedActionPlanModel,checkActionPlanCapabilities,checkActionPlanInspection,checkActionPlanAssessment} from '../src/extensions/actions/plan-structure';
import {readFileSync} from 'node:fs';
test('@covers US-902-AC5 @covers US-902-AC6 independent expected corpus through public exports',()=>{expect(runActionPlanCorpus(publicApi)).toHaveLength(50);});
test('@covers US-902-AC1 schema resources and original schema byte pin',()=>{
 const s=setup(),i=inspectActionPlan(artifact(s.plan),s.context),p=prepareActionPlanModel(s.pin,s.action,s.context),c=capabilities(s),a=assessActionPlan(i,c,s.context);
 expect(checkActionPlan(s.plan)).toBe(true);expect(checkPreparedActionPlanModel(JSON.parse(p.utf8))).toBe(true);expect(checkActionPlanCapabilities(c)).toBe(true);expect(checkActionPlanInspection(i)).toBe(true);expect(checkActionPlanAssessment(a)).toBe(true);
 expect(JSON.parse(p.utf8).schema.sha256).toBe(createHash('sha256').update(readFileSync('spec/extensions/actions/plan-model.schema.json')).digest('hex'));
});
test('@covers US-902-AC6 SHA256 matches independent native crypto including block and UTF8 boundaries',()=>{
 for(const n of [0,1,55,56,63,64,65,127,128,1024,1048576]){const s='x'.repeat(n);expect(sha256Text(s)).toBe(createHash('sha256').update(s).digest('hex'));}
 for(const s of ['abc','Foo😀','éé','\u0000\n\r\t','e\u0301'])expect(sha256Text(s)).toBe(createHash('sha256').update(s).digest('hex'));
 expect(()=>sha256Text('\ud800')).toThrow();expect(()=>parsePlanJson('1e999')).toThrow();
});
test('@covers US-902-AC4 exact integer/string carriers retain original spelling and semantic bounds',()=>{
 for(const [family,value] of [['integer',{integerToken:'9007199254740993'}],['integer',{integerToken:'1e2'}],['integer',{integerToken:'-0'}],['string',{string:'Foo😀'}],['string',{string:''}]] as const){const s=setup();const f=s.doc.modules[0]!.elements.find(e=>e.id==='active')!;f.scalarType=family;const original=artifact(s.doc);s.pin.sha256=original.sha256;s.action.documentSha256=original.sha256;s.context.models[0]!.artifact=original;s.context.actions[0]!.artifact=original;s.plan.inputs.assignments[0]!.value=value;const i=inspectActionPlan(artifact(s.plan),s.context);expect(i.eligible).toBe(true);expect(i.plan!.inputs.assignments[0]!.value).toEqual(value);}
});
test('@covers US-902-AC1 original unrelated semantic callbacks remain installed and enforced',()=>{
 const s=setup();s.doc.vocabularies['test.guard']={version:'1.0.0'};s.doc.modules[0]!.extensions!['test.guard']={};let calls=0;
 s.context.registry.register({id:'test.guard',version:'1.0.0',coreVersion:CURRENT_CORE_VERSION,description:'guard',schema:true,semantics:'guard',scopes:['module'],capabilities:{validation:'semantic',directions:[],evidence:[]}},()=>{calls++;return [{code:'GUARD_REJECT',path:'/modules/0',message:'guard',severity:'error'}];});
 const bytes=artifact(s.doc);s.pin.sha256=bytes.sha256;s.action.documentSha256=bytes.sha256;s.context.models[0]!.artifact=bytes;s.context.actions[0]!.artifact=bytes;
 expect(inspectActionPlan(artifact(s.plan),s.context).eligible).toBe(false);expect(calls).toBeGreaterThan(0);expect(()=>prepareActionPlanModel(s.pin,s.action,s.context)).toThrow();expect(s.context.registry.get('test.guard','1.0.0')?.semantics).toBeDefined();
});
test('@covers US-902-AC6 schema metadata bounds use UTF16, prepared artifact cannot replace original document',()=>{
 const s=setup();s.pin.revision='😀'.repeat(129);expect(inspectActionPlan(artifact(s.plan),s.context).eligible).toBe(false);
 const fresh=setup(),prepared=prepareActionPlanModel(fresh.pin,fresh.action,fresh.context);fresh.context.models[0]!.artifact=prepared;expect(inspectActionPlan(artifact(fresh.plan),fresh.context).eligible).toBe(false);
});
test('@covers US-902-AC5 new portable modules have no host-only import or global',async()=>{
 const paths=await Array.fromAsync(new Bun.Glob('src/extensions/actions/plan*.ts').scan());expect(paths.length).toBeGreaterThan(3);for(const path of paths){const text=await Bun.file(path).text();expect(text).not.toMatch(/(?:from\s*['"](?:node:|bun)|\bBun\.|\bprocess\.|\brequire\()/);}
});
test('@covers US-902-AC6 opaque artifact metadata remains bounded without invoking getters',()=>{
 const s=setup(),source=artifact(s.plan);source.future={payload:'x'.repeat(4194305)};expect(()=>inspectActionPlan(source,s.context)).toThrow();
});
test('@covers US-902-AC6 review regressions: context slots, metadata Unicode, diagnostic and evidence boundaries',()=>{
 for(const key of ['models','actions','selections'] as const){const s=setup();let calls=0;const old=s.context[key][0];Object.defineProperty(s.context[key],'0',{get(){calls++;return old;},enumerable:true});expect(inspectActionPlan(artifact(s.plan),s.context).eligible).toBe(false);expect(calls).toBe(0);}
 const s=setup();s.pin.revision='\ud800';expect(()=>prepareActionPlanModel(s.pin,s.action,s.context)).toThrow();
 const t=setup(),i=inspectActionPlan(artifact(t.plan),t.context),c=capabilities(t);c.guard.profile.id='\ud800';expect(assessActionPlan(i,c,t.context).compatible).toBe(false);
 const u=setup();u.context.selections[0]!.inspect=()=>({eligible:true,dependencies:u.plan.selection.dependencies,diagnostics:[{code:'x'.repeat(257),path:'',message:'test'}]});const refused=inspectActionPlan(artifact(u.plan),u.context);expect(refused.eligible).toBe(false);expect(checkActionPlanInspection(refused)).toBe(true);
 const v=setup(),vi=inspectActionPlan(artifact(v.plan),v.context),vc=capabilities(v);vc.action.claims[0]!.evidence=Array.from({length:65},()=> 'fixture://evidence');const assessed=assessActionPlan(vi,vc,v.context);expect(assessed.compatible).toBe(true);expect(checkActionPlanAssessment(assessed)).toBe(true);
});
test('@covers US-902-AC1 shared frame admission: identity and per-list boundaries',()=>{
 const repin=(s:ReturnType<typeof setup>)=>{const a=artifact(s.doc);s.pin.sha256=a.sha256;s.action.documentSha256=a.sha256;s.context.models[0]!.artifact=a;s.context.actions[0]!.artifact=a;};
 for(const length of [256,257]){const s=setup();(s.doc.modules[0]!.extensions!['umf.actions'] as any).actions[0].writes[0].id='x'.repeat(length);repin(s);expect(inspectActionPlan(artifact(s.plan),s.context).eligible).toBe(length===256);if(length===256)expect(checkPreparedActionPlanModel(JSON.parse(prepareActionPlanModel(s.pin,s.action,s.context).utf8))).toBe(true);else expect(()=>prepareActionPlanModel(s.pin,s.action,s.context)).toThrow();}
 for(const count of [128,129]){const s=setup(),a=(s.doc.modules[0]!.extensions!['umf.actions'] as any).actions[0],frame=a.writes[0];a.writes=Array.from({length:count},(_,i)=>({...structuredClone(frame),id:'w'+i}));a.reads=Array.from({length:128},(_,i)=>({...structuredClone(frame),id:'r'+i,fields:[]}));repin(s);expect(inspectActionPlan(artifact(s.plan),s.context).eligible).toBe(count===128);if(count===128)expect(JSON.parse(prepareActionPlanModel(s.pin,s.action,s.context).utf8).frames).toHaveLength(256);else expect(()=>prepareActionPlanModel(s.pin,s.action,s.context)).toThrow();}
},60000);
test('@covers US-902-AC1 assignment bindings form a complete unique set while preserving source order',()=>{
 const s=setup(),m=s.doc.modules[0]!,record=m.elements.find(e=>e.id==='customer')!,a=(m.extensions!['umf.actions'] as any).actions[0];
 m.elements.push({id:'enabled',name:'enabled',kind:'field',scalarType:'boolean',cardinality:'one',nullability:'required',extensions:{}} as any);(record.members as any[]).push({module:'sales',element:'enabled'});
 a.parameters.push({id:'enabled-value',kind:'value',field:{module:'sales',element:'enabled'},required:true});a.binding.effects[0].values.push({field:{module:'sales',element:'enabled'},value:{parameter:'enabled-value'}});a.writes[0].fields.push({module:'sales',element:'enabled'});
 const original=artifact(s.doc);s.pin.sha256=original.sha256;s.action.documentSha256=original.sha256;s.context.models[0]!.artifact=original;s.context.actions[0]!.artifact=original;
 const active=s.plan.inputs.assignments[0]!,enabled={input:'enabled-value',field:{module:'sales',element:'enabled'},value:{boolean:true}};
 s.plan.inputs.assignments=[enabled,active];const inspected=inspectActionPlan(artifact(s.plan),s.context);expect(inspected.eligible).toBe(true);expect(inspected.plan!.inputs.assignments.map(v=>v.input)).toEqual(['enabled-value','active-value']);expect(JSON.parse(prepareActionPlanModel(s.pin,s.action,s.context).utf8).assignments.map((v:any)=>v.input)).toEqual(['active-value','enabled-value']);
 for(const assignments of [[active,active],[enabled],[{...enabled,field:active.field},active]]){s.plan.inputs.assignments=assignments;expect(inspectActionPlan(artifact(s.plan),s.context).eligible).toBe(false);}
});

test('portable artifacts retain exact original numeric metadata meaning',()=>{
 expect(parsePlanJson('{"bits":8.0}')).toEqual({bits:8});
 expect(parsePlanJson('{"bits":8e0}')).toEqual({bits:8});
 expect(()=>parsePlanJson('{"bits":8.0000000000000000000000000001}')).toThrow();
});

test('small plan framing cannot silently round numeric metadata',()=>{
 for(const token of ['1.00000000000000000000000001','1e-9999','9007199254740993','-0'])expect(()=>parsePlanJson('{"ordinal":'+token+'}')).toThrow();
});
