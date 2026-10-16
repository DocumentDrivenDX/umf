import {copyJson} from '../../model/json';
import {canonicalSchemaJson,checkSchemaLiteral,literalIdentity,type CoreLiteral} from '../../model/schema-literals';
import {encodeCoreKeyTuple} from '../../model/key-tuple';
import {securityPolicyDependencies} from './dependencies';
import {requireSecurityInterpretation} from './policy';
import {evaluateSecurityAccess,evaluateSecurityOriginalRead,type SecurityFact,type SecurityFactCut} from './evaluate';
import {securityRefIdentity as identity,type SecurityPolicy,type SecurityResolution,type SecurityRef} from './types';
import type {SecurityDecision} from './logic';

/** Trusted host binding; field and ownership actions never come from client policy archives. */
export interface SecurityWriteProfile {
  readProtection:{version:'umf.security.write-read/0.1.0';readAction:string;blindWriteActions:{field:SecurityRef;action:string}[]};
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
    exact(profile,['readProtection','type','createAction','updateAction','deleteAction','fieldActions','ownershipAction','ownershipFields','ownershipAssociations','policyAction','policyFields']);
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
    const readProtection=profile.readProtection;
    if(!readProtection||typeof readProtection!=='object'||Array.isArray(readProtection))fail();
    exact(readProtection,['version','readAction','blindWriteActions']);
    if(readProtection.version!=='umf.security.write-read/0.1.0'||!resolution.ontology.actions.includes(readProtection.readAction)||!Array.isArray(readProtection.blindWriteActions)||readProtection.blindWriteActions.length>4096)fail();
    const blindActions=new Map<string,string>(),ordinaryActions=new Set([readProtection.readAction,...objectActions,...actions.values(),profile.ownershipAction,profile.policyAction]);
    for(const entry of readProtection.blindWriteActions){
      exact(entry,['field','action']);const key=id(entry.field);
      if(!actions.has(key)||blindActions.has(key)||!resolution.ontology.actions.includes(entry.action)||ordinaryActions.has(entry.action))fail();
      blindActions.set(key,entry.action);
    }
    const dependencies=securityPolicyDependencies(policy,resolution);
    if(dependencies.fields.some(field=>actions.has(id(field))&&!profile.policyFields.some(r=>id(r)===id(field))))fail();
    const states:SecurityWriteState[]=request.operation==='create'&&!request.original&&request.proposed?[request.proposed]:
      request.operation==='delete'&&request.original&&!request.proposed?[request.original]:
      request.operation==='update'&&request.original&&request.proposed?[request.original,request.proposed]:fail();
    for(const state of states){
      exact(state,['resource','cut']);if(id(state.resource.type)!==id(type.type))fail();
      if(!Number.isSafeInteger(state.cut.maxSteps)||state.cut.maxSteps<1||state.cut.maxSteps>1000000)fail();
      const covered=state.cut.coverage.find(c=>id(c.type)===id(type.type))??fail();if(!covered.complete)fail();
      for(const field of type.fields){
        if(!covered.fields.some(r=>id(r)===id(field.ref)))fail();
        if(!state.resource.fields.some(f=>id(f.field)===id(field.ref))&&!state.resource.absent.some(r=>id(r)===id(field.ref)))fail();
      }
    }
    // Separate conservative comparison ledger; never retain expanded scalar
    // identities for entire inventories. Evaluated projections stay unchanged.
    const comparisonLimit=Math.min(...states.map(state=>state.cut.maxSteps));
    if(!Number.isSafeInteger(comparisonLimit)||comparisonLimit<1||comparisonLimit>1000000)fail();
    let comparisonSteps=0,comparisonBytes=0;
    const compareStep=()=>{if(++comparisonSteps>comparisonLimit)fail();};
    const compareText=(value:string)=>{comparisonBytes+=value.length;if(comparisonBytes>4000000)fail();return value;};
    const document=(ref:SecurityRef)=>resolution.documents.find(item=>item.document.id===ref.documentId)?.document??fail();
    const element=(ref:SecurityRef)=>document(ref).modules.find(module=>module.id===ref.moduleId)?.elements.find(item=>item.id===ref.elementId)??fail();
    const scalar=(ref:SecurityRef,value:CoreLiteral)=>{
      compareStep();const field=element(ref);if(field.kind!=='field')fail();checkSchemaLiteral(document(ref),field,value);
      return compareText(value===null?'null':literalIdentity(field,value));
    };
    type Projection=Map<string,{ref:SecurityRef;value:CoreLiteral|undefined}>;
    const projection=(fields:SecurityFact['fields'],absent:SecurityRef[]=[]):Projection=>{
      if(!Array.isArray(fields)||fields.length>4096||!Array.isArray(absent)||absent.length>4096)fail();
      const result:Projection=new Map();
      const add=(ref:SecurityRef,value:CoreLiteral|undefined)=>{compareStep();const key=compareText(id(ref));if(result.has(key))fail();result.set(key,{ref,value});};
      for(const entry of fields){exact(entry,['field','value']);add(entry.field,entry.value);}
      for(const ref of absent)add(ref,undefined);
      return result;
    };
    const sameProjection=(a:Projection,b:Projection)=>{
      if(a.size!==b.size)return false;
      for(const [key,left] of a){compareStep();const right=b.get(key);if(!right)return false;
        if(left.value===undefined||right.value===undefined){if(left.value!==right.value)return false;}
        else if(scalar(left.ref,left.value)!==scalar(right.ref,right.value))return false;
      }
      return true;
    };
    const grouped=(facts:SecurityFact[])=>{
      if(!Array.isArray(facts)||facts.length>10000)fail();
      const result=new Map<string,Map<string,Projection>>();
      for(const fact of facts){compareStep();exact(fact,['type','key','fields','absent']);const key=compareText(id(fact.type));
        const binding=[...resolution.ontology.entities,...resolution.ontology.associations].find(item=>id(item.type)===key)??fail();
        const tuple=encodeCoreKeyTuple(document(fact.type),{module:fact.type.moduleId,element:fact.type.elementId,key:binding.keyId},fact.key).bytesHex;
        const factId=compareText(canonicalSchemaJson([key,binding.keyId,tuple]));const rows=result.get(key)??new Map<string,Projection>();
        if(rows.has(factId))fail();rows.set(factId,projection(fact.fields,fact.absent));result.set(key,rows);
      }
      return result;
    };
    const sameRows=(a:Map<string,Projection>,b:Map<string,Projection>)=>a.size===b.size&&[...a].every(([key,fields])=>{compareStep();const other=b.get(key);return other!==undefined&&sameProjection(fields,other);});
    const sameFacts=(a:SecurityFact[],b:SecurityFact[])=>{const left=grouped(a),right=grouped(b);return left.size===right.size&&[...left].every(([key,rows])=>{compareStep();const other=right.get(key);return other!==undefined&&sameRows(rows,other);});};
    const fieldValue=(state:SecurityWriteState,ref:SecurityRef)=>{
      const value=state.resource.fields.find(f=>id(f.field)===id(ref));if(!value)return 'absent';if(value.value===null)return 'null';
      return scalar(ref,value.value);
    };
    const changed=type.fields.filter(field=>states.length===1||fieldValue(states[0]!,field.ref)!==fieldValue(states[1]!,field.ref)).map(f=>id(f.ref));
    let ownershipChanged=profile.ownershipFields.some(r=>changed.includes(id(r)));
    let policyAssociationChanged=false;
    if(states.length===2){
      const a=states[0]!.cut,b=states[1]!.cut;
      if(a.generation!==b.generation||a.expectedGeneration!==b.expectedGeneration||a.policyId!==b.policyId||a.policyRevision!==b.policyRevision||a.ontologyDocumentId!==b.ontologyDocumentId||a.ontologyRevision!==b.ontologyRevision||!sameFacts(a.subjects,b.subjects)||!sameProjection(projection(a.context),projection(b.context)))fail();
      const before=grouped(a.facts),after=grouped(b.facts);
      for(const key of new Set([...before.keys(),...after.keys()]))if(!sameRows(before.get(key)??new Map(),after.get(key)??new Map())){
        if(!profile.ownershipAssociations.some(r=>id(r)===key))fail();ownershipChanged=true;
        if(dependencies.associations.some(r=>id(r)===key))policyAssociationChanged=true;
      }
    }else if(profile.ownershipAssociations.length){
      ownershipChanged=true;
      policyAssociationChanged=profile.ownershipAssociations.some(r=>dependencies.associations.some(d=>id(d)===id(r)));
    }
    const objectAction=request.operation==='create'?profile.createAction:request.operation==='delete'?profile.deleteAction:profile.updateAction;
    const checks=[objectAction,...new Set(changed.map(field=>actions.get(field)??fail())),...(ownershipChanged?[profile.ownershipAction]:[]),...(policyAssociationChanged||profile.policyFields.some(r=>changed.includes(id(r)))||(request.operation!=='update'&&dependencies.associations.some(r=>id(r)===id(type.type)))?[profile.policyAction]:[])];
    const decisions:SecurityDecision[]=[];
    const selectedBlind=[...new Set(changed.flatMap(field=>blindActions.has(field)?[blindActions.get(field)!]:[]))];
    // Reserve every possible evaluator call across the whole operation, including
    // both update states. The separately bounded comparison ledger stays separate.
    const maxSteps=Math.floor(comparisonLimit/(states.length*(checks.length+selectedBlind.length+1)));if(maxSteps<1)fail();
    for(const state of states){
      const cut={...state.cut,maxSteps};
      for(const action of checks)decisions.push(evaluateSecurityAccess(policy,resolution,cut,{action,output:[]},state.resource).decision);
      const blind=new Map(selectedBlind.map(action=>[action,evaluateSecurityAccess(policy,resolution,cut,{action,output:[]},state.resource).decision]));
      const needsRead=changed.filter(field=>blind.get(blindActions.get(field)??'')!=='permit');
      if(!needsRead.length)continue;
      const read=evaluateSecurityOriginalRead(policy,resolution,cut,readProtection.readAction,needsRead.map(field=>type.fields.find(f=>id(f.ref)===field)!.ref),state.resource);
      for(const field of needsRead){
        if(read.decision==='permit'&&read.originalFields.some(ref=>id(ref)===field)){decisions.push('permit');continue;}
        const alternative=blind.get(blindActions.get(field)??'');
        decisions.push(read.decision==='indeterminate'||read.decision==='conflict'||alternative==='indeterminate'||alternative==='conflict'?'indeterminate':'deny');
      }
    }
    if(decisions.some(d=>d==='indeterminate'||d==='conflict'))return {decision:'indeterminate'};
    return {decision:decisions.every(d=>d==='permit')?'permit':'deny'};
  }catch{return {decision:'indeterminate'};}
}
