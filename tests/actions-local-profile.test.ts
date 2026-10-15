import {test,expect} from 'bun:test';
import * as api from '../src/index';
import {localPlanFixture,localCapabilities,runLocalProfileCorpus} from './actions-local-profile-corpus';
import {createPlanCorpusFixture,corpusCapabilities} from './actions-plan-corpus';
import {sha256Text} from '../src/extensions/actions/plan-artifacts';
const artifact=(v:unknown)=>{const utf8=JSON.stringify(v);return {mediaType:'application/json',utf8,sha256:sha256Text(utf8)};};
const actionOf=(f:ReturnType<typeof localPlanFixture>):any=>(f.document.modules[0]!.extensions!['umf.actions'] as any).actions[0];
function refresh(f:ReturnType<typeof localPlanFixture>){const a=artifact(f.document);f.pin.sha256=a.sha256;f.action.documentSha256=a.sha256;f.context.models[0]!.artifact=a;f.context.actions[0]!.artifact=a;}
test('@covers US-902-AC7 @covers US-903-AC8 exact local declaration bundle and separate companion preserve original pure APIs',()=>{
 expect(runLocalProfileCorpus(api)).toEqual({prepared:'umf.actions.local-tx',localOwner:true,executionVerified:false,unsealed:true,batches:[2,1],refusals:4});
 const f=localPlanFixture(api),before=structuredClone(f.document),i=api.inspectActions(f.document,f.context.registry);
 expect(i.validation.valid).toBe(true);expect(i.actions[0]!.obligations.every(o=>o.status==='checked')).toBe(true);expect(f.document).toEqual(before);
 const p=JSON.parse(api.prepareActionPlanModel(f.pin,f.action,f.context).utf8);expect(p.action.documentSha256).toBe(f.pin.sha256);expect(p.frames).toEqual(['customer-write']);
});
test('@covers US-902-AC7 complete local pairing and known profile versions refuse every mixed native meaning',()=>{
 const controls:((f:ReturnType<typeof localPlanFixture>)=>void)[]=[
  f=>f.action.invocation.id='umf.actions.tx',f=>f.action.invocation.version='2',f=>f.action.invocation.id='caller.custom',
  f=>actionOf(f).attribution={subject:'person-required'},f=>actionOf(f).authorization={kind:'roles',profile:{id:'umf.actions.roles',version:'1'},roles:['bulk-editor']},
  f=>actionOf(f).attribution.profile.version='2',f=>actionOf(f).authorization.profile.version='2',
  f=>actionOf(f).attribution.profile.id='caller.actor',f=>actionOf(f).authorization.profile.id='caller.policy',
  f=>actionOf(f).authorization.resources=[],f=>actionOf(f).authorization.resources=['products'],
  f=>actionOf(f).authorization.future={allow:true},f=>actionOf(f).attribution.profile.future={allow:true},
 ];
 for(const mutate of controls){const f=localPlanFixture(api);mutate(f);refresh(f);expect(()=>api.prepareActionPlanModel(f.pin,f.action,f.context)).toThrow();}
});
test('@covers US-902-AC7 native tx1 preparation and delegated-human companion remain unchanged',()=>{
 const f=createPlanCorpusFixture(api),prepared=JSON.parse(api.prepareActionPlanModel(f.pin,f.action,f.context).utf8);
 expect(prepared.action.invocation).toEqual({id:'umf.actions.tx',version:'1'});
 const i=api.inspectActionPlan(artifact(f.plan),f.context),caps=corpusCapabilities(api,f),a=api.assessActionPlan(i,caps,f.context);
 expect(a.compatible).toBe(true);expect(a.executionVerified).toBe(false);expect(a.obligations.some(o=>o.id==='bulk.principal')).toBe(true);expect(a.obligations.some(o=>o.id==='bulk.localOwner')).toBe(false);
 caps.bulk.profile.id='umf.actions.local-bulk';caps.bulk.claims=caps.bulk.claims.map(c=>({...c,id:c.id==='bulk.principal'?'bulk.localOwner':c.id}));expect(api.assessActionPlan(i,caps,f.context).compatible).toBe(false);
 f.action.invocation.id='umf.actions.local-tx';expect(()=>api.prepareActionPlanModel(f.pin,f.action,f.context)).toThrow();
});
test('@covers US-903-AC8 local supported claims cannot substitute a native manifest profile or issue authority',()=>{
 const f=localPlanFixture(api),i=api.inspectActionPlan(artifact(f.plan),f.context),c=localCapabilities(api,f);
 c.bulk.claims.push({id:'bulk.principal',status:'supported',evidence:['fixture://not-authority']});expect(api.assessActionPlan(i,c,f.context).compatible).toBe(false);
 const unknown=localPlanFixture(api);actionOf(unknown).attribution.profile.id='opaque.other';actionOf(unknown).authorization.profile.id='opaque.policy';refresh(unknown);
 const a=api.inspectActions(unknown.document,unknown.context.registry);expect(a.validation.valid).toBe(true);expect(a.actions[0]!.obligations.some(o=>o.status==='unchecked')).toBe(true);
});
