import {test,expect} from 'bun:test';
import approve from '../../fixtures/actions/approve.json';
import create from '../../fixtures/actions/create-link.json';
import ddd from '../../fixtures/actions/ddd-binding.json';
import {Registry} from '../../src/registry/registry';
import {dddPackage,dddRegistry} from '../../src/extensions/ddd';
import {registerActions,inspectActions,declareAction,assessAction,editAction} from '../../src/extensions/actions';
import type {ActionExecutorProfile} from '../../src/extensions/actions';
import {readDocument,writeDocument} from '../../src';
import type {Document} from '../../src/model/types';
const doc=(fixture:unknown)=>structuredClone(fixture) as Document;
const action=(d:Document)=>(d.modules[0]!.extensions!['umf.actions'] as any).actions[0];
const registry=()=>registerActions(new Registry());
const diagnostics=(d:Document)=>inspectActions(d,registry()).validation.diagnostics;
test('@covers US-078-AC1: exact targets and stable identity',()=>{
 const source=doc(approve),second=structuredClone(source.modules[0]!);second.id='other';second.namespace='other';
 const a=(second.extensions!['umf.actions'] as any).actions[0];a.parameters[0].target.module='other';a.writes[0].record.module='other';a.writes[0].fields[0].module='other';a.binding.effects[0].values[0].field.module='other';
 for(const e of second.elements)for(const k of ['members','keys'])if(e[k]){if(k==='members')for(const r of e[k] as any[])r.module='other';else for(const key of e[k] as any[])for(const r of key.fields)r.module='other';}
 source.modules.push(second);const inspection=inspectActions(source,registry());expect(inspection.validation.valid).toBe(true);expect(inspection.actions.map(x=>[x.module,x.action.id])).toEqual([['sales','approve'],['other','approve']]);
 for(const change of [(a:any)=>a.parameters[0].target.element='status',(a:any)=>a.parameters[0].target.key='missing',(a:any)=>a.writes[0].fields[0].element='missing']){const invalid=doc(approve);change(action(invalid));expect(diagnostics(invalid).some(d=>d.code==='ACTION_REFERENCE'&&d.severity==='error')).toBe(true);}
 inspection.actions[0]!.action.name='changed';expect(action(source).name).toBe('Approve');
});
test('@covers US-078-AC2: rules and handlers are inert',()=>{
 const source=doc(approve),a=action(source);a.binding={kind:'handler',profile:{id:'custom-handler',version:'1'},handler:{id:'javascript:must-not-run',version:'1'}};
 a.preconditions=[{id:'permission',rule:{language:'future.rules',version:'9',expression:'fetch("https://invalid.example"); throw 1',references:[]},failure:{code:'BUSINESS_FAILURE',message:'Business reason'}}];a.failures=[{code:'BUSINESS_FAILURE',message:'Business reason',retryable:true}];
 let calls=0;const old=globalThis.fetch;globalThis.fetch=(()=>{calls++;throw Error('unexpected network')}) as unknown as typeof fetch;
 try{const result=inspectActions(source,registry());expect(result.validation.valid).toBe(true);expect(result.validation.complete).toBe(false);expect(result.actions[0]!.action.preconditions[0]!.rule.expression).toBe(a.preconditions[0].rule.expression);expect(result.actions[0]!.obligations.filter(o=>o.kind==='handler'||o.kind==='condition').some(o=>o.status==='unchecked')).toBe(true);expect(calls).toBe(0);}finally{globalThis.fetch=old;}
});
test('@covers US-078-AC3: ordered create link and property effects',()=>{
 const source=doc(create),result=inspectActions(source,registry());expect(result.validation.valid).toBe(true);expect(result.actions[0]!.action.binding.kind).toBe('recipe');expect((result.actions[0]!.action.binding as any).effects.map((e:any)=>e.id)).toEqual(['create','link-customer','link-product']);
 const unchanged=JSON.stringify(source);inspectActions(source,registry());expect(JSON.stringify(source)).toBe(unchanged);
 const changes=[(a:any)=>a.binding.effects[0].values.pop(),(a:any)=>a.binding.effects[1].source.created='later',(a:any)=>a.binding.effects[1].target.parameter='unknown',(a:any)=>a.binding.effects[0].values[0].field.element='customer-id',(a:any)=>a.writes[0].create=false,(a:any)=>a.writes[0].relationships=[]];
 for(const mutate of changes){const invalid=doc(create);mutate(action(invalid));expect(inspectActions(invalid,registry()).validation.valid).toBe(false);expect(JSON.stringify(invalid)).not.toBe(unchanged);}
 const deleted=doc(approve),a=action(deleted);a.writes[0].delete=true;a.binding.effects.unshift({id:'delete-first',kind:'delete',entity:{parameter:'order'}});expect(diagnostics(deleted).some(d=>d.code==='ACTION_EFFECT'&&d.message.includes('Deleted'))).toBe(true);
 const keySet=doc(approve);action(keySet).binding.effects[0].values[0].field.element='id';expect(diagnostics(keySet).some(d=>d.code==='ACTION_EFFECT'&&d.message.includes('immutable'))).toBe(true);
});
test('@covers US-078-AC4: mandatory execution obligations and handler output metadata',()=>{
 const source=doc(approve),r=registry(),inspection=inspectActions(source,r),kinds=new Set(inspection.actions[0]!.obligations.map(o=>o.kind));
 for(const kind of ['authorization','attribution','atomicity','idempotency','result','frame','selector','binding','effect'])expect(kinds.has(kind as any)).toBe(true);
 for(const key of ['authorization','attribution','atomicity','idempotency','result'])for(const value of [undefined,null]){const invalid=doc(approve);if(value===undefined)delete action(invalid)[key];else action(invalid)[key]=value;expect(()=>inspectActions(invalid,r)).toThrow();}
 const handler=doc(approve),a=action(handler);a.binding={kind:'handler',profile:{id:'handler-v1',version:'1'},handler:{id:'approve-handler',version:'1'}};a.outputs=[{id:'order',kind:'entity',target:{module:'sales',element:'order',key:'pk'},required:true}];
 a.postconditions=[{id:'post',rule:{language:'future.rules',version:'1',expression:'post.output exists',references:[{output:'order'}]},failure:{code:'OUTPUT_MISSING',message:'Missing output'}}];a.failures=[{code:'OUTPUT_MISSING',message:'Missing output',retryable:false}];
 expect(inspectActions(handler,r).validation.valid).toBe(true);expect(inspectActions(handler,r).actions[0]!.obligations.some(o=>o.kind==='output')).toBe(true);
 const recipe=doc(approve);action(recipe).outputs=a.outputs;expect(diagnostics(recipe).some(d=>d.code==='ACTION_EFFECT'&&d.path.endsWith('/outputs'))).toBe(true);
});
test('@covers US-078-AC7: DDD bindings are explicit and remain independent',()=>{
 const source=doc(ddd),r=registerActions(new Registry().register(dddPackage,dddRegistry().get('umf.ddd','0.1.0')!.semantics)),original=structuredClone(source.modules[0]!.elements.at(-1)!.extensions);
 expect(inspectActions(source,r).validation.valid).toBe(true);expect(source.modules[0]!.elements.at(-1)!.extensions).toEqual(original);
 delete action(source).dddOperation;expect(inspectActions(source,r).actions).toHaveLength(1);delete source.modules[0]!.extensions!['umf.actions'];expect(inspectActions(source,r).actions).toHaveLength(0);
 const missing=doc(ddd);action(missing).dddOperation.operation='missing';expect(inspectActions(missing,r).validation.diagnostics.some(d=>d.code==='ACTION_REFERENCE')).toBe(true);
 const fresh=doc(ddd),a=structuredClone(action(fresh));delete fresh.modules[0]!.extensions!['umf.actions'];const authored=declareAction(fresh,'sales',a,r);expect(inspectActions(authored,r).validation.valid).toBe(true);
});

test('@covers US-078-AC4: opaque policy resources preserve distinct obligations without enforcement evidence',()=>{
 const source=doc(approve),a=action(source),r=registry(),original=JSON.stringify(source);
 a.authorization={kind:'policy',profile:{id:'opaque.policy',version:'1'},resources:['order-write']};const inspection=inspectActions(source,r),identity={module:'sales',action:'approve'};
 expect(inspection.validation.valid).toBe(true);expect(inspection.validation.complete).toBe(false);expect(inspection.actions[0]!.action.authorization).toEqual(a.authorization);expect(inspection.actions[0]!.action.authorization.kind).toBe('policy');expect(JSON.stringify(source)).not.toBe(original);
 const before=JSON.stringify(source);for(const format of ['json','yaml'] as const)expect(readDocument(writeDocument(source,format),format)).toEqual(source);expect(JSON.stringify(source)).toBe(before);
 const p:ActionExecutorProfile={id:'declared-only',version:'1',actionVersion:'0.1.0',coreVersion:'0.8.0',source,identity,claims:inspection.actions[0]!.obligations.filter(o=>o.kind!=='authorization').map(o=>({obligation:o.id,status:'supported',evidence:['inert://declaration']}))};
 const unknown=assessAction(source,identity,p,r);expect(unknown.declaredCompatible).toBe(false);expect(unknown.executionVerified).toBe(false);expect(unknown.outcomes.some(o=>o.status==='unknown'&&inspection.actions[0]!.obligations.some(ob=>ob.id===o.obligation&&ob.kind==='authorization'))).toBe(true);
 p.claims=inspection.actions[0]!.obligations.map(o=>({obligation:o.id,status:'supported',evidence:['inert://declaration']}));expect(assessAction(source,identity,p,r).declaredCompatible).toBe(true);expect(assessAction(source,identity,p,r).executionVerified).toBe(false);expect(()=>editAction(source,identity,a,r)).toThrow();
 a.authorization.future={retain:[null,'opaque']};const future=inspectActions(source,r);expect(future.actions[0]!.action.authorization.future).toEqual(a.authorization.future);p.claims=future.actions[0]!.obligations.map(o=>({obligation:o.id,status:'supported',evidence:['inert://declaration']}));expect(assessAction(source,identity,p,r).declaredCompatible).toBe(false);
});

test('@covers US-078-AC4 @covers US-078-AC5 @covers US-078-AC6: actor profile remains preserved and cannot be claimed as enforced',()=>{
 const source=doc(approve),a=action(source),r=registry(),identity={module:'sales',action:'approve'};a.authorization.profile={id:'umf.actions.roles',version:'1'};a.attribution={subject:'actor-profile',profile:{id:'future.actor',version:'1'}};const before=JSON.stringify(source),inspection=inspectActions(source,r);
 expect(inspection.validation.valid).toBe(true);expect(inspection.validation.complete).toBe(false);expect(inspection.actions[0]!.action.attribution).toEqual(a.attribution);for(const format of ['json','yaml'] as const)expect(readDocument(writeDocument(source,format),format)).toEqual(source);
 const p:ActionExecutorProfile={id:'declared-only',version:'1',actionVersion:'0.1.0',coreVersion:'0.8.0',source,identity,claims:inspection.actions[0]!.obligations.map(o=>({obligation:o.id,status:'supported',evidence:['inert://declaration']}))};expect(assessAction(source,identity,p,r).declaredCompatible).toBe(false);expect(assessAction(source,identity,p,r).executionVerified).toBe(false);expect(()=>editAction(source,identity,a,r)).toThrow();expect(JSON.stringify(source)).toBe(before);
});

test('@covers US-078-AC5: unsupported float and temporal parameter meanings remain unclaimable',()=>{
 for(const family of ['float','timestamp'] as const){const source=doc(approve),a=action(source),r=registry(),identity={module:'sales',action:'approve'};a.authorization.profile={id:'umf.actions.roles',version:'1'};source.modules[0]!.elements.push({id:'unused',kind:'field',scalarType:family,cardinality:'one',nullability:'required',extensions:{}});a.parameters.push({id:'unused',kind:'value',field:{module:'sales',element:'unused'},required:false});const before=JSON.stringify(source),inspection=inspectActions(source,r);expect(inspection.validation.valid).toBe(true);expect(inspection.validation.complete).toBe(false);
 const p:ActionExecutorProfile={id:'declared-only',version:'1',actionVersion:'0.1.0',coreVersion:'0.8.0',source,identity,claims:inspection.actions[0]!.obligations.map(o=>({obligation:o.id,status:'supported',evidence:['inert://declaration']}))};expect(assessAction(source,identity,p,r).declaredCompatible).toBe(false);expect(assessAction(source,identity,p,r).executionVerified).toBe(false);expect(()=>editAction(source,identity,a,r)).toThrow();expect(JSON.stringify(source)).toBe(before);}
});
