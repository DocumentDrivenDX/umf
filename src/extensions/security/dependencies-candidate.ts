/** Conservative candidate live-read closure; backend clock/writer mapping is not established. */
import {requireIssuedCandidateSecurityPolicyChecks} from './policy-checks-candidate';
const refId=(r:any)=>JSON.stringify([r.documentId,r.moduleId,r.elementId]);
const relationshipId=(r:any)=>JSON.stringify([r.documentId,r.moduleId,r.relationshipId]);
function freeze(v:any):any{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
export function candidateSecurityPolicyDependencies(input:unknown):unknown{
 requireIssuedCandidateSecurityPolicyChecks(input);const checked:any=input;if(checked.residuals.length)throw Error('SECURITY_POLICY_DEPENDENCIES_UNRESOLVED');
 const fields=new Map<string,any>(),associations=new Map<string,any>(),incidences=new Map<string,any>(),witnessRecords=new Map<string,any>(),contextFields=new Map<string,any>();
 const field=(ref:any)=>fields.set(refId(ref),ref);
 const key=(type:any,definition:any)=>definition.fields.forEach((f:any)=>field({documentId:type.documentId,moduleId:f.module,elementId:f.element}));
 function term(value:any){if(value.kind==='constant-term')return;const selected=value.term;
  if(selected.kind==='constant')return;
  if(selected.kind==='context-attribute'){contextFields.set(refId(selected.field),selected.field);return;}
  if(selected.kind==='record-attribute'){field(selected.field);return;}
  if(selected.kind==='entity-identity'||selected.kind==='record-identity'){
   key(selected.type,selected.key);
   if(selected.fields)selected.fields.forEach(field);
   if(selected.kind==='entity-identity'&&selected.relationship){const entry={relationship:selected.relationship,role:selected.role,side:selected.side,target:selected.type,keyId:selected.key.id};incidences.set(JSON.stringify([relationshipId(entry.relationship),entry.role,entry.side]),entry);}
   return;
  }
  throw Error('SECURITY_POLICY_DEPENDENCIES_UNRESOLVED');
 }
 function walk(expr:any,registry:any[]){
  if(expr.op==='literal')return;if(expr.op==='eq'){term(expr.left);term(expr.right);return;}
  if(expr.op==='and'||expr.op==='or'){expr.args.forEach((e:any)=>walk(e,registry));return;}if(expr.op==='not'){walk(expr.arg,registry);return;}
  if(expr.op!=='exists')throw Error('SECURITY_POLICY_DEPENDENCIES_UNRESOLVED');const checks=registry[expr.association].checks,plan=checks.plan,graph=checks.kind==='candidate-graph-relationship-checks/0.1';
  const entry=graph?{kind:'core-relationship',relationship:plan.relationship}:{kind:'record-members',type:plan.type};associations.set(JSON.stringify([entry.kind,graph?relationshipId(entry.relationship):refId(entry.type)]),entry);
  if(graph&&plan.witness.kind==='record-key'){const witness={relationship:plan.relationship,type:plan.witness.type,keyId:plan.witness.key.id};witnessRecords.set(relationshipId(plan.relationship),witness);}
  walk(expr.where,registry);
 }
 for(const condition of checked.conditions){if(!condition.transport)throw Error('SECURITY_POLICY_DEPENDENCIES_UNRESOLVED');walk(condition.transport.expression,condition.transport.associations);}
 const sorted=(map:Map<string,any>)=>[...map].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([,v])=>v);
 return freeze({kind:'candidate-security-dependencies/0.1',fields:sorted(fields),associations:sorted(associations),graphIncidences:sorted(incidences),graphWitnessRecords:sorted(witnessRecords),...(contextFields.size?{contextFields:sorted(contextFields)}:{})});
}
