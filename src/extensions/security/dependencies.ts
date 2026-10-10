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
