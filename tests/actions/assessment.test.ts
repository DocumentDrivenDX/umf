import {test,expect} from 'bun:test';
import fixture from '../../fixtures/actions/create-link.json';
import {registerActions,inspectActions,assessAction,editAction} from '../../src/extensions/actions';
import {Registry} from '../../src/registry/registry';
import type {Document} from '../../src/model/types';
import type {ActionExecutorProfile} from '../../src/extensions/actions';
const source=()=>structuredClone(fixture) as unknown as Document;
const registry=()=>registerActions(new Registry());
const identity={module:'sales',action:'create-order'};
function profile(document:Document):ActionExecutorProfile {return {id:'bounded-reference',version:'1',actionVersion:'0.1.0',coreVersion:'0.8.0',source:document,identity,claims:inspectActions(document,registry()).actions[0]!.obligations.map(o=>({obligation:o.id,status:'supported',evidence:['inert://not-authenticated-runtime-proof']}))};}
test('@covers US-900-AC5: complete exact snapshot comparison never proves execution',()=>{
 const document=source(),p=profile(document),result=assessAction(document,identity,p,registry());expect(result.declaredCompatible).toBe(true);expect(result.executionVerified).toBe(false);
 expect(result.outcomes).toHaveLength(inspectActions(document,registry()).actions[0]!.obligations.length);expect(result.outcomes.every(o=>o.status==='supported')).toBe(true);
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
