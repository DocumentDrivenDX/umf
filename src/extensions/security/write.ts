import {copyJson} from '../../model/json';
import {canonicalSchemaJson,literalIdentity} from '../../model/schema-literals';
import {securityPolicyDependencies} from './dependencies';
import {requireSecurityInterpretation} from './policy';
import {evaluateSecurityAccess,type SecurityFact,type SecurityFactCut} from './evaluate';
import {securityRefIdentity as identity,type SecurityPolicy,type SecurityResolution,type SecurityRef} from './types';
import type {SecurityDecision} from './logic';

/** Trusted host binding; field and ownership actions never come from client policy archives. */
export interface SecurityWriteProfile {
  type:SecurityRef;createAction:string;updateAction:string;deleteAction:string;
  fieldActions:{field:SecurityRef;action:string}[];
  policyAction:string;policyFields:SecurityRef[];
  ownershipAction:string;ownershipFields:SecurityRef[];ownershipAssociations:SecurityRef[];
}
export interface SecurityWriteState {resource:SecurityFact;cut:SecurityFactCut}
export interface SecurityWriteRequest {operation:'create'|'update'|'delete';original?:SecurityWriteState;proposed?:SecurityWriteState}
export interface SecurityWriteResult {decision:SecurityDecision}
const fail=():never=>{throw new Error('SECURITY_WRITE_REFUSED');};
const exact=(value:object,keys:string[])=>{if(Object.keys(value).some(k=>!keys.includes(k)))fail();};
const id=(ref:SecurityRef)=>{exact(ref,['documentId','moduleId','elementId']);if([ref.documentId,ref.moduleId,ref.elementId].some(s=>typeof s!=='string'||!s.length))fail();return identity(ref);};

/** Admission only: the native host must bind this decision and effects to one guarded transaction. */
export function evaluateSecurityWrite(policyInput:SecurityPolicy,resolutionInput:SecurityResolution,profileInput:SecurityWriteProfile,requestInput:SecurityWriteRequest):SecurityWriteResult {
  try{
    const admitted=requireSecurityInterpretation(policyInput,resolutionInput);
    const policy=admitted.source as unknown as SecurityPolicy,resolution=admitted.resolution as unknown as SecurityResolution;
    const profile=copyJson(profileInput) as unknown as SecurityWriteProfile,request=copyJson(requestInput) as unknown as SecurityWriteRequest;
    exact(profile,['type','createAction','updateAction','deleteAction','fieldActions','ownershipAction','ownershipFields','ownershipAssociations','policyAction','policyFields']);
    exact(request,['operation','original','proposed']);
    const type=[...resolution.ontology.entities,...resolution.ontology.associations].find(t=>id(t.type)===id(profile.type))??fail();
    const objectActions=[profile.createAction,profile.updateAction,profile.deleteAction];
    if(!resolution.ontology.actions.includes(profile.policyAction)||objectActions.includes(profile.policyAction)||profile.policyAction===profile.ownershipAction||!Array.isArray(profile.policyFields))fail();
    if(new Set(objectActions).size!==3||!resolution.ontology.actions.includes(profile.ownershipAction)||objectActions.includes(profile.ownershipAction))fail();
    if(!Array.isArray(profile.fieldActions)||profile.fieldActions.length!==type.fields.length||!Array.isArray(profile.ownershipFields)||!Array.isArray(profile.ownershipAssociations))fail();
    const actions=new Map<string,string>();
    for(const entry of profile.fieldActions){
      exact(entry,['field','action']);const key=id(entry.field);
      if(actions.has(key)||!type.fields.some(f=>id(f.ref)===key)||objectActions.includes(entry.action)||entry.action===profile.ownershipAction||entry.action===profile.policyAction)fail();
      actions.set(key,entry.action);
    }
    if([...objectActions,...actions.values()].some(action=>!resolution.ontology.actions.includes(action))||new Set(actions.values()).size>64)fail();
    if(new Set(profile.policyFields.map(id)).size!==profile.policyFields.length||profile.policyFields.some(r=>!actions.has(id(r))))fail();
    if(new Set(profile.ownershipFields.map(id)).size!==profile.ownershipFields.length||profile.ownershipFields.some(r=>!actions.has(id(r))))fail();
    if(new Set(profile.ownershipAssociations.map(id)).size!==profile.ownershipAssociations.length||profile.ownershipAssociations.some(r=>!resolution.ontology.associations.some(a=>id(a.type)===id(r))))fail();
    const dependencies=securityPolicyDependencies(policy,resolution);
    if(dependencies.fields.some(field=>actions.has(id(field))&&!profile.policyFields.some(r=>id(r)===id(field))))fail();
    const states:SecurityWriteState[]=request.operation==='create'&&!request.original&&request.proposed?[request.proposed]:
      request.operation==='delete'&&request.original&&!request.proposed?[request.original]:
      request.operation==='update'&&request.original&&request.proposed?[request.original,request.proposed]:fail();
    for(const state of states){
      exact(state,['resource','cut']);if(id(state.resource.type)!==id(type.type))fail();
      const covered=state.cut.coverage.find(c=>id(c.type)===id(type.type))??fail();if(!covered.complete)fail();
      for(const field of type.fields){
        if(!covered.fields.some(r=>id(r)===id(field.ref)))fail();
        if(!state.resource.fields.some(f=>id(f.field)===id(field.ref))&&!state.resource.absent.some(r=>id(r)===id(field.ref)))fail();
      }
    }
    const fieldValue=(state:SecurityWriteState,ref:SecurityRef)=>{
      const value=state.resource.fields.find(f=>id(f.field)===id(ref));if(!value)return 'absent';if(value.value===null)return 'null';
      const element=resolution.documents.find(d=>d.document.id===ref.documentId)?.document.modules.find(m=>m.id===ref.moduleId)?.elements.find(e=>e.id===ref.elementId)??fail();
      return literalIdentity(element,value.value);
    };
    const changed=type.fields.filter(field=>states.length===1||fieldValue(states[0]!,field.ref)!==fieldValue(states[1]!,field.ref)).map(f=>id(f.ref));
    let ownershipChanged=profile.ownershipFields.some(r=>changed.includes(id(r)));
    if(states.length===2){
      const a=states[0]!.cut,b=states[1]!.cut;
      if(a.generation!==b.generation||a.expectedGeneration!==b.expectedGeneration||a.policyId!==b.policyId||a.policyRevision!==b.policyRevision||a.ontologyDocumentId!==b.ontologyDocumentId||a.ontologyRevision!==b.ontologyRevision||canonicalSchemaJson(a.subjects)!==canonicalSchemaJson(b.subjects)||canonicalSchemaJson(a.context)!==canonicalSchemaJson(b.context))fail();
      const grouped=(cut:SecurityFactCut)=>{const result=new Map<string,string[]>();for(const fact of cut.facts){const key=id(fact.type),rows=result.get(key)??[];rows.push(canonicalSchemaJson(fact));result.set(key,rows);}return result;};
      const before=grouped(a),after=grouped(b);
      for(const key of new Set([...before.keys(),...after.keys()]))if(canonicalSchemaJson((before.get(key)??[]).sort())!==canonicalSchemaJson((after.get(key)??[]).sort())){
        if(!profile.ownershipAssociations.some(r=>id(r)===key))fail();ownershipChanged=true;
      }
    }else if(profile.ownershipAssociations.length)ownershipChanged=true;
    const objectAction=request.operation==='create'?profile.createAction:request.operation==='delete'?profile.deleteAction:profile.updateAction;
    const checks=[objectAction,...new Set(changed.map(field=>actions.get(field)??fail())),...(ownershipChanged?[profile.ownershipAction]:[]),...(profile.policyFields.some(r=>changed.includes(id(r)))||(request.operation!=='update'&&dependencies.associations.some(r=>id(r)===id(type.type)))?[profile.policyAction]:[])];
    const decisions:SecurityDecision[]=[];
    for(const state of states)for(const action of checks){
      const maxSteps=Math.floor(state.cut.maxSteps/checks.length);if(maxSteps<1)fail();
      decisions.push(evaluateSecurityAccess(policy,resolution,{...state.cut,maxSteps},{action,output:[]},state.resource).decision);
    }
    if(decisions.some(d=>d==='indeterminate'||d==='conflict'))return {decision:'indeterminate'};
    return {decision:decisions.every(d=>d==='permit')?'permit':'deny'};
  }catch{return {decision:'indeterminate'};}
}
