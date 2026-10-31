// SPDX-License-Identifier: MIT OR Apache-2.0
import {CURRENT_CORE_VERSION} from '../../src/generated/core-model';
import {test,expect} from 'bun:test';
import fixture from '../../fixtures/actions/create-link.json';
import {registerActions,inspectActions,assessAction,editAction} from '../../src/extensions/actions';
import {Registry} from '../../src/registry/registry';
import type {Document} from '../../src/model/types';
import type {ActionExecutorProfile} from '../../src/extensions/actions';
const source=()=>structuredClone(fixture) as unknown as Document;
const registry=()=>registerActions(new Registry());
const identity={module:'sales',action:'create-order'};
const expectedObligationIds=[
 '/modules/0/extensions/umf.actions/actions/0/parameters/0','/modules/0/elements/0',
 '/modules/0/extensions/umf.actions/actions/0/parameters/1','/modules/0/elements/4','/modules/0/elements/3','/modules/0/elements/4/keys/0',
 '/modules/0/extensions/umf.actions/actions/0/parameters/2','/modules/0/elements/6','/modules/0/elements/5','/modules/0/elements/6/keys/0',
 '/modules/0/extensions/umf.actions/actions/0/writes/0','/modules/0/elements/2','/modules/0/elements/1','/modules/0/elements/2/keys/0','/modules/0/extensions/umf.actions/actions/0/writes/0/selector',
 '/modules/0/relationships/0','/modules/0/relationships/1','/modules/0/extensions/umf.actions/actions/0/writes/1','/modules/0/extensions/umf.actions/actions/0/writes/1/selector','/modules/0/extensions/umf.actions/actions/0/writes/2','/modules/0/extensions/umf.actions/actions/0/writes/2/selector',
 '/modules/0/extensions/umf.actions/actions/0/authorization','/modules/0/extensions/umf.actions/actions/0/attribution','/modules/0/extensions/umf.actions/actions/0/atomicity','/modules/0/extensions/umf.actions/actions/0/idempotency','/modules/0/extensions/umf.actions/actions/0/result','/modules/0/extensions/umf.actions/actions/0/binding',
 '/modules/0/extensions/umf.actions/actions/0/binding/effects/0','/modules/0/extensions/umf.actions/actions/0/binding/effects/1','/modules/0/extensions/umf.actions/actions/0/binding/effects/2'
];
const expectedObligationKinds=['value','model','key','model','model','key','key','model','model','key','frame','model','model','key','selector','model','model','frame','selector','frame','selector','authorization','attribution','atomicity','idempotency','result','binding','effect','effect','effect'] as const;
const expectedObligations=expectedObligationIds.map((id,index)=>({id,path:id,kind:expectedObligationKinds[index]!,status:'checked' as const}));
function profile(document:Document):ActionExecutorProfile {return {id:'bounded-reference',version:'1',actionVersion:'0.1.0',coreVersion:CURRENT_CORE_VERSION,source:document,identity,claims:expectedObligationIds.map(obligation=>({obligation,status:'supported',evidence:['inert://not-authenticated-runtime-proof']}))};}
test('@covers US-900-AC5: complete exact snapshot comparison never proves execution',()=>{
 const document=source(),inspection=inspectActions(document,registry()),p=profile(document),result=assessAction(document,identity,p,registry());
 expect(inspection.actions[0]!.obligations.map(({id,path,kind,status})=>({id,path,kind,status}))).toEqual(expectedObligations);
 expect(result.declaredCompatible).toBe(true);expect(result.executionVerified).toBe(false);
 expect(result.outcomes.map(o=>o.obligation)).toEqual(expectedObligationIds);expect(result.outcomes.every(o=>o.status==='supported')).toBe(true);
 // Object member order is not semantic, array order is.
 p.source={modules:p.source.modules,vocabularies:p.source.vocabularies,id:p.source.id,umf:p.source.umf};expect(assessAction(document,identity,p,registry()).declaredCompatible).toBe(true);
 p.source=structuredClone(document);p.source.modules[0]!.elements.reverse();expect(()=>assessAction(document,identity,p,registry())).toThrow();
});
test('@covers US-900-AC5: missing, unsupported, unknown and malformed claims cannot waive obligations',()=>{
 for(const status of ['unsupported','unknown'] as const){const document=source(),p=profile(document);p.claims[0]!.status=status;const result=assessAction(document,identity,p,registry());expect(result.declaredCompatible).toBe(false);expect(result.outcomes[0]!.status).toBe(status);}
 const document=source(),missing=profile(document);missing.claims.pop();expect(assessAction(document,identity,missing,registry()).declaredCompatible).toBe(false);
 for(const change of [(p:ActionExecutorProfile)=>p.claims[0]!.evidence=[],(p:ActionExecutorProfile)=>p.claims[0]!.obligation='/extra',(p:ActionExecutorProfile)=>p.claims[1]=p.claims[0]!, (p:ActionExecutorProfile)=>(p as any).reportMode='waive',(p:ActionExecutorProfile)=>p.identity={...identity,action:'other'}]){const p=profile(document);change(p);expect(()=>assessAction(document,identity,p,registry())).toThrow();}
});
test('@covers US-900-AC5: unsupported future lifecycle and transitive qualifiers stay unoverrideable',()=>{
 for(const mutate of [(d:Document)=>(d.modules[0]!.relationships as any[])[0].targetLifecycle='future-meaning',(d:Document)=>d.modules[0]!.elements[0]!.facets={length:{max:16,unit:'future-unit'}},(d:Document)=>d.modules[0]!.elements[1]!.nullability='future-null',(d:Document)=>(d.vocabularies['umf.actions'] as any).future='required']){
  const document=source();mutate(document);const inspection=inspectActions(document,registry());expect(inspection.validation.valid).toBe(true);expect(assessAction(document,identity,profile(document),registry()).declaredCompatible).toBe(false);expect(()=>editAction(document,identity,inspection.actions[0]!.action,registry())).toThrow();
 }
});
test('@covers US-900-AC5: unknown effects and referenced native extensions are never claimed away',()=>{
 const document=source(),action=(document.modules[0]!.extensions!['umf.actions'] as any).actions[0];action.binding.effects.push({id:'future',kind:'future',nested:['retained']});
 expect(assessAction(document,identity,profile(document),registry()).declaredCompatible).toBe(false);
 const model=source();model.vocabularies['native.future']={version:'1.0.0'};model.modules[0]!.elements[0]!.extensions['native.future']={meaning:'incompatible'};
 expect(assessAction(model,identity,profile(model),registry()).declaredCompatible).toBe(false);
});
