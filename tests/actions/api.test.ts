import {test,expect} from 'bun:test';
import fixture from '../../fixtures/actions/approve.json';
import {Registry} from '../../src/registry/registry';
import {inspectActions,registerActions,declareAction,editAction,assessAction,actionsPackage} from '../../src/extensions/actions';
import type {ActionExecutorProfile,Action} from '../../src/extensions/actions';
import type {Document} from '../../src/model/types';
const document=()=>structuredClone(fixture) as unknown as Document;
const registry=()=>registerActions(new Registry());
const id={module:'sales',action:'approve'};
function completeProfile(source:Document):ActionExecutorProfile {
 const action=inspectActions(source,registry()).actions[0]!;
 return {id:'reference-postgresql',version:'1',actionVersion:'0.1.0',coreVersion:'0.8.0',source,identity:id,claims:action.obligations.map(o=>({obligation:o.id,status:'supported',evidence:['fixture-only://no-runtime-proof']}))};
}
test('inspection reports inert profiles and every primitive/dependency obligation',()=>{
 const source=document(),inspection=inspectActions(source,registry());
 expect(inspection.validation.valid).toBe(true);expect(inspection.validation.complete).toBe(false);
 expect(inspection.actions[0]!.obligations.some(o=>o.path.endsWith('/binding/effects/0')&&o.kind==='effect')).toBe(true);
 expect(inspection.actions[0]!.obligations.some(o=>o.path==='/modules/0/elements/2/keys/0')).toBe(true);
 expect(new Set(inspection.actions[0]!.obligations.map(o=>o.id)).size).toBe(inspection.actions[0]!.obligations.length);
 inspection.source.modules[0]!.namespace='changed';expect(source.modules[0]!.namespace).toBe('sales');
});
test('duplicate registration refuses; unrelated registry semantic errors propagate',()=>{
 const r=registry();expect(()=>registerActions(r)).toThrow();
 const source=document();source.vocabularies['test.guard']={version:'1.0.0'};source.modules[0]!.extensions!['test.guard']={};
 r.register({id:'test.guard',version:'1.0.0',coreVersion:'0.1.0',description:'guard',schema:true,semantics:'guard',scopes:['module'],capabilities:{validation:'semantic',directions:[],evidence:[]}},()=>[{code:'GUARD_REJECT',path:'',message:'guard',severity:'error'}]);
 expect(inspectActions(source,r).validation.diagnostics.some(d=>d.code==='GUARD_REJECT')).toBe(true);
 expect(()=>assessAction(source,id,completeProfile(source),r)).toThrow();
});
test('semantic violations remain inspectable and prevent assessment/authoring',()=>{
 const source=document(),action=(source.modules[0]!.extensions!['umf.actions'] as any).actions[0];
 action.binding.effects[0].values[0].field.element='id';
 expect(inspectActions(source,registry()).validation.diagnostics.some(d=>d.code==='ACTION_EFFECT')).toBe(true);
 expect(()=>assessAction(source,id,completeProfile(source),registry())).toThrow();
});
test('authoring retains unknown rule/profile meaning without treating it as execution',()=>{
 const source=document(),r=registry(),action=structuredClone((source.modules[0]!.extensions!['umf.actions'] as any).actions[0]) as Action;
 delete source.modules[0]!.extensions;delete source.vocabularies['umf.actions'];
 const result=declareAction(source,'sales',action,r);expect(inspectActions(result,r).actions).toHaveLength(1);
 expect(source.vocabularies['umf.actions']).toBeUndefined();expect(()=>declareAction(result,'sales',action,r)).toThrow();
 expect(()=>editAction(result,id,{...action,id:'new'},r)).toThrow();expect(()=>editAction(result,id,action,r)).toThrow();
});
test('exact declaration assessment is separate from runtime verification',()=>{
 const source=document(),r=registry(),profile=completeProfile(source),result=assessAction(source,id,profile,r);
 expect(result.declaredCompatible).toBe(true);expect(result.executionVerified).toBe(false);
 profile.source.modules[0]!.namespace='mismatch';expect(()=>assessAction(document(),id,profile,r)).toThrow();
 const missing=completeProfile(document());missing.claims.pop();expect(assessAction(document(),id,missing,r).declaredCompatible).toBe(false);
 const duplicate=completeProfile(document());duplicate.claims[1]=duplicate.claims[0]!;expect(()=>assessAction(document(),id,duplicate,r)).toThrow();
});
test('supported claims cannot erase future effect or model meaning',()=>{
 const source=document(),action=(source.modules[0]!.extensions!['umf.actions'] as any).actions[0];
 action.future={meaning:'retained'};
 expect(assessAction(source,id,completeProfile(source),registry()).declaredCompatible).toBe(false);
 expect(()=>editAction(source,id,action,registry())).toThrow();
});

test('known roles/1 declaration permits safe editing while unrelated unknown vocabulary survives',()=>{
 const source=document(),action=(source.modules[0]!.extensions!['umf.actions'] as any).actions[0] as Action;
 action.authorization.profile={id:'umf.actions.roles',version:'1'};
 source.vocabularies['future.note']={version:'1.0.0'};source.modules[0]!.elements.push({id:'unrelated',extensions:{'future.note':{keep:['exact',null]}}});
 const replacement={...structuredClone(action),description:'Reviewed description'},updated=editAction(source,id,replacement,registry());
 expect((updated.modules[0]!.extensions!['umf.actions'] as any).actions[0].description).toBe('Reviewed description');
 expect(updated.modules[0]!.elements.at(-1)!.extensions).toEqual(source.modules[0]!.elements.at(-1)!.extensions);
 expect(action.description).toBe('Set an order status to approved.');
 expect(assessAction(updated,id,completeProfile(updated),registry()).executionVerified).toBe(false);
});

test('unknown package-use metadata and core availability cannot be erased by claims or edits',()=>{
 for(const mutate of [(s:Document)=>(s.vocabularies['umf.actions'] as any).future={meaning:'required'},(s:Document)=>s.modules[0]!.elements[1]!.nullability='future-null']){
  const source=document();(source.modules[0]!.extensions!['umf.actions'] as any).actions[0].authorization.profile={id:'umf.actions.roles',version:'1'};mutate(source);
  const inspection=inspectActions(source,registry());expect(inspection.validation.valid).toBe(true);expect(inspection.actions[0]!.obligations.some(o=>o.status==='unchecked')).toBe(true);
  expect(assessAction(source,id,completeProfile(source),registry()).declaredCompatible).toBe(false);
  expect(()=>editAction(source,id,inspection.actions[0]!.action,registry())).toThrow();
 }
});
test('known profile envelopes/dependencies and model qualifiers preserve unknown meaning',()=>{
 for(const change of [
  (s:Document)=>(s.modules[0]!.extensions!['umf.actions'] as any).actions[0].writes[0].selector.future={keep:true},
  (s:Document)=>(s.modules[0]!.extensions!['umf.actions'] as any).actions[0].writes[0].selector.references[0].future='retained',
  (s:Document)=>{s.modules[0]!.elements[0]!.facets={length:{max:8,unit:'unicode-scalar',future:true}};const a=(s.modules[0]!.extensions!['umf.actions'] as any).actions[0];a.writes[0].selector.expression='{"key":"pk","components":[{"literal":{"string":"o1"}}]}';a.writes[0].selector.references=[];},
 ]){
  const source=document();change(source);const inspection=inspectActions(source,registry());expect(inspection.validation.valid).toBe(true);expect(inspection.validation.complete).toBe(false);expect(assessAction(source,id,completeProfile(source),registry()).declaredCompatible).toBe(false);
 }
});

test('registry callbacks cannot suppress recognized action errors',()=>{
 const source=document(),r=new Registry().register(actionsPackage,()=>[]),a=(source.modules[0]!.extensions!['umf.actions'] as any).actions[0];
 a.binding.effects[0].values[0].field.element='id';a.writes[0].fields.push({module:'sales',element:'id'});
 expect(inspectActions(source,r).validation.valid).toBe(false);
 expect(()=>assessAction(source,id,completeProfile(source),r)).toThrow();
});
test('warnings at existing model obligations and transitive package qualifiers block compatibility',async()=>{
 const source=document(),r=registry();source.vocabularies['test.guard']={version:'1.0.0'};source.modules[0]!.extensions!['test.guard']={};
 r.register({id:'test.guard',version:'1.0.0',coreVersion:'0.1.0',description:'guard',schema:true,semantics:'guard',scopes:['module'],capabilities:{validation:'semantic',directions:[],evidence:[]}},()=>[{code:'GUARD_UNKNOWN',path:'/modules/0/elements/2',message:'unknown model meaning',severity:'warning'}]);
 expect(assessAction(source,id,completeProfile(source),r).declaredCompatible).toBe(false);
 expect(()=>editAction(source,id,inspectActions(source,r).actions[0]!.action,r)).toThrow();
 const {default:fixture}=await import('../../fixtures/actions/ddd-binding.json'),{dddPackage,dddRegistry}=await import('../../src/extensions/ddd');
 const d=structuredClone(fixture) as unknown as Document,dr=registerActions(new Registry().register(dddPackage,dddRegistry().get('umf.ddd','0.1.0')!.semantics));
 (d.vocabularies['umf.ddd'] as any).future={unknown:true};
 const target=inspectActions(d,dr).actions[0]!,identity={module:target.module,action:target.action.id};
 const profile:ActionExecutorProfile={id:'claims',version:'1',coreVersion:'0.8.0',actionVersion:'0.1.0',source:d,identity,claims:target.obligations.map(o=>({obligation:o.id,status:'supported',evidence:['inert://claim']}))};
 expect(assessAction(d,identity,profile,dr).declaredCompatible).toBe(false);expect(()=>editAction(d,identity,target.action,dr)).toThrow();
});

test('relationship dependency indexes do not import unrelated element vocabulary qualifiers',async()=>{
 const {default:create}=await import('../../fixtures/actions/create-link.json'),source=structuredClone(create) as unknown as Document;
 source.vocabularies['future.note']={version:'1.0.0',future:{retained:true}} as any;source.modules[0]!.elements.unshift({id:'unrelated',extensions:{'future.note':{uninterpreted:true}}});
 const r=registry(),target=inspectActions(source,r).actions[0]!,identity={module:target.module,action:target.action.id};
 const profile:ActionExecutorProfile={id:'claims',version:'1',coreVersion:'0.8.0',actionVersion:'0.1.0',source,identity,claims:target.obligations.map(o=>({obligation:o.id,status:'supported',evidence:['inert://claim']}))};
 expect(assessAction(source,identity,profile,r).declaredCompatible).toBe(true);
});

test('unknown nested action references remain inspectable and unchecked',()=>{
 for(const mutate of [(a:any)=>a.writes[0].record.future={meaning:'unknown'},(a:any)=>a.parameters[0].target.future={meaning:'unknown'}]){const source=document();mutate((source.modules[0]!.extensions!['umf.actions'] as any).actions[0]);const result=inspectActions(source,registry());expect(result.validation.valid).toBe(true);expect(result.actions[0]!.obligations.some(o=>o.status==='unchecked')).toBe(true);expect(assessAction(source,id,completeProfile(source),registry()).declaredCompatible).toBe(false);}
});

test('opaque future effect objects never acquire model-reference semantics',()=>{
 const source=document(),action=(source.modules[0]!.extensions!['umf.actions'] as any).actions[0];action.binding.effects.push({id:'future',kind:'future-effect',payload:{module:'display text',element:'display text',keep:'opaque'}});
 const result=inspectActions(source,registry());expect(result.validation.valid).toBe(true);expect(result.validation.complete).toBe(false);expect(result.source).toEqual(source);expect(assessAction(source,id,completeProfile(source),registry()).declaredCompatible).toBe(false);
});
test('later known effect reference qualifiers are inventoried before selector compilation',()=>{
 const source=document(),action=(source.modules[0]!.extensions!['umf.actions'] as any).actions[0];action.binding.effects[0].values[0].field.future={meaning:'unknown'};
 const result=inspectActions(source,registry());expect(result.validation.valid).toBe(true);expect(result.validation.complete).toBe(false);const identities=result.validation.diagnostics.map(d=>JSON.stringify([d.code,d.path,d.severity]));expect(new Set(identities).size).toBe(identities.length);expect(assessAction(source,id,completeProfile(source),registry()).declaredCompatible).toBe(false);
});
