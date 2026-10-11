import {requireSecurityInterpretation} from './policy';
import {securityRefIdentity as id,type SecurityPolicy,type SecurityResolution,type SecurityRef,type SecurityExpr,type SecurityTerm,type SecurityEntity,type SecurityAssociation} from './types';

export interface SecurityDependencies {fields:SecurityRef[];associations:SecurityRef[]}
/** Conservative dependency closure over complete typed meaning; no label-based ownership inference. */
export function securityPolicyDependencies(policyInput:SecurityPolicy,resolutionInput:SecurityResolution):SecurityDependencies {
  const inspected=requireSecurityInterpretation(policyInput,resolutionInput);
  const policy=inspected.source as unknown as SecurityPolicy,resolution=inspected.resolution as unknown as SecurityResolution;
  const fields=new Map<string,SecurityRef>(),associations=new Map<string,SecurityRef>();
  const types=[...resolution.ontology.entities,...resolution.ontology.associations];
  const add=(ref:SecurityRef)=>fields.set(id(ref),ref);
  const key=(type:SecurityEntity)=>{
    const record=resolution.documents.find(d=>d.document.id===type.type.documentId)!.document.modules.find(m=>m.id===type.type.moduleId)!.elements.find(e=>e.id===type.type.elementId)!;
    const definition=(record.keys as {id:string;fields:{module:string;element:string}[]}[]).find(k=>k.id===type.keyId)!;
    for(const field of definition.fields)add({documentId:type.type.documentId,moduleId:field.module,elementId:field.element});
  };
  const subject=types.find(t=>id(t.type)===id(resolution.ontology.subject))!;
  const term=(value:SecurityTerm,target:SecurityEntity,variables:Map<string,SecurityAssociation>)=>{
    if(value.kind==='constant')return; // A literal's declared domain is not a live attribute read.
    if('field'in value){add(value.field);return;}
    if(value.kind==='subject'){key(subject);return;}
    if(value.kind==='resource'){key(target);return;}
    if(value.kind==='variable'){
      const association=variables.get(value.name)!;
      if('identity'in value){key(association);return;}
      const endpoint=association.endpoints.find(e=>e.role===value.endpoint)!;
      endpoint.fields.forEach(add);key(types.find(t=>id(t.type)===id(endpoint.target))!);
    }
  };
  const expression=(expr:SecurityExpr,target:SecurityEntity,variables:Map<string,SecurityAssociation>):void=>{
    if(expr.op==='eq'){term(expr.left,target,variables);term(expr.right,target,variables);}
    else if(expr.op==='and'||expr.op==='or')expr.args.forEach(e=>expression(e,target,variables));
    else if(expr.op==='not')expression(expr.arg,target,variables);
    else if(expr.op==='exists'){
      const association=resolution.ontology.associations.find(a=>id(a.type)===id(expr.association))!;
      associations.set(id(association.type),association.type);
      const nested=new Map(variables);nested.set(expr.as,association);expression(expr.where,target,nested);
    }
  };
  for(const rule of policy.rules)for(const target of rule.target)expression(rule.condition,types.find(t=>id(t.type)===id(target))!,new Map());
  const sorted=(map:Map<string,SecurityRef>)=>[...map].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([,ref])=>ref);
  return {fields:sorted(fields),associations:sorted(associations)};
}

export interface SecurityIdentityTransportDependencies extends SecurityDependencies {
  /** Keep policy reads distinct from extra key/endpoint transport requirements. */
  policyFields:SecurityRef[];
  records:{type:SecurityRef;keyId:string;keyFields:SecurityRef[];endpoints:{role:string;target:SecurityRef;fields:SecurityRef[]}[]}[];
}
/** Identity/endpoint reconstruction closure, not complete disclosure or issuer authority.
 *
 * Key and endpoint component order comes from the validated original model. Native
 * providers must preserve that order; neither row position nor field labels infer
 * identity. Extra property/disclosure/query requirements need separate admission.
 */
export function securityIdentityTransportDependencies(policyInput:SecurityPolicy,resolutionInput:SecurityResolution):SecurityIdentityTransportDependencies {
  const inspected=requireSecurityInterpretation(policyInput,resolutionInput);
  const policy=inspected.source as unknown as SecurityPolicy,resolution=inspected.resolution as unknown as SecurityResolution;
  const dependencies=securityPolicyDependencies(policy,resolution);
  const types=new Map([...resolution.ontology.entities,...resolution.ontology.associations].map(t=>[id(t.type),t]));
  const selected=new Map<string,SecurityEntity>();
  const select=(ref:SecurityRef)=>selected.set(id(ref),types.get(id(ref))!);
  select(resolution.ontology.subject);
  for(const rule of policy.rules)rule.target.forEach(select);
  for(const ref of dependencies.associations){
    select(ref);
    (types.get(id(ref)) as SecurityAssociation).endpoints.forEach(endpoint=>select(endpoint.target));
  }
  const fields=new Map(dependencies.fields.map(ref=>[id(ref),ref]));
  const records=[...selected].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([,type])=>{
    const record=resolution.documents.find(d=>d.document.id===type.type.documentId)!.document.modules.find(m=>m.id===type.type.moduleId)!.elements.find(e=>e.id===type.type.elementId)!;
    const key=(record.keys as {id:string;fields:{module:string;element:string}[]}[]).find(k=>k.id===type.keyId)!;
    const keyFields=key.fields.map(field=>({documentId:type.type.documentId,moduleId:field.module,elementId:field.element}));
    keyFields.forEach(ref=>fields.set(id(ref),ref));
    const endpoints=('endpoints' in type?(type as SecurityAssociation).endpoints:[]).map(endpoint=>{
      endpoint.fields.forEach(ref=>fields.set(id(ref),ref));
      return {role:endpoint.role,target:endpoint.target,fields:endpoint.fields};
    });
    return {type:type.type,keyId:type.keyId,keyFields,endpoints};
  });
  return {policyFields:dependencies.fields,fields:[...fields].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([,ref])=>ref),associations:dependencies.associations,records};
}
