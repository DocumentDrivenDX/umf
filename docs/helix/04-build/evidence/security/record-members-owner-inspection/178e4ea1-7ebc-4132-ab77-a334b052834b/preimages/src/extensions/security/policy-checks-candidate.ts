/** Draft whole-policy consistency and per-target expression checks; no enforcement authority. */
import {copyJson} from '../../model/json';
import {createValidator} from '../../validation/schema';
import {checkSchemaLiteral} from '../../model/schema-literals';
import schema from '../../../docs/helix/02-design/spikes/security/policy-v0.2.schema.json';
import {resolveCandidateSecurityOntology} from './ontology-checks-candidate';
import {createCandidateEntityTermScope} from './entity-terms-candidate';
import {normalizeCandidateAssociationExpression,serializeCandidateAssociationExpression} from './association-expression';
function close(v:any):any{if(Array.isArray(v))return v.map(close);if(v&&typeof v==='object'){const out:any=Object.fromEntries(Object.entries(v).map(([k,x])=>[k,close(x)]));if(out.properties)out.additionalProperties=false;return out;}return v;}
const issued=new WeakSet<object>();
export function requireIssuedCandidateSecurityPolicyChecks(value:unknown):void{if(!value||typeof value!=='object'||!issued.has(value))throw Error('SECURITY_POLICY_CANDIDATE_UNISSUED');}
const check=createValidator().compile(close(schema));
const fail=():never=>{throw Error('SECURITY_POLICY_CANDIDATE_UNRESOLVED');};
const id=(r:any)=>JSON.stringify([r.documentId,r.moduleId,r.elementId]);
const associationId=(r:any)=>JSON.stringify([Object.hasOwn(r,'relationshipId')?'relationship':'record',r.documentId,r.moduleId,r.relationshipId??r.elementId]);
function shape(v:any,keys:string[]):void{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))fail();}
function unique(values:string[]):void{if(new Set(values).size!==values.length)fail();}
function freeze(v:any):any{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
export function resolveCandidateSecurityPolicy(input:unknown,ontologyInput:unknown,documentsInput:unknown,bindingsInput:unknown=[]):unknown{
 const packet:any=copyJson({policy:input,ontology:ontologyInput,documents:documentsInput,bindings:bindingsInput}),policy=packet.policy;
 if(!Boolean(check(policy))||!Array.isArray(packet.bindings)||packet.bindings.length>4096)fail();
 const pending=policy.rules.map((r:any)=>r.condition);let expressionNodes=0;while(pending.length){const expr=pending.pop();if(++expressionNodes>4096)fail();if(expr.op==='and'||expr.op==='or')pending.push(...expr.args);else if(expr.op==='not')pending.push(expr.arg);else if(expr.op==='exists')pending.push(expr.where);}
 const checked=resolveCandidateSecurityOntology(packet.ontology,packet.documents),ontology:any=checked.ontology;
 if(policy.ontology.documentId!==ontology.documentId||policy.ontology.revision!==ontology.revision)fail();
 const entities=new Map<string,any>(ontology.entities.map((e:any)=>[id(e.type),e])),fields=new Map<string,{document:any;field:any}>();
 for(const entity of ontology.entities){const document=packet.documents.find((d:any)=>d.document.id===entity.type.documentId).document;for(const classified of entity.fields){const field=document.modules.find((m:any)=>m.id===classified.ref.moduleId)?.elements.find((e:any)=>e.id===classified.ref.elementId);fields.set(id(classified.ref),{document,field});}}
 unique(policy.rules.map((r:any)=>r.id));const bindings=new Map<string,any>();
 for(const binding of packet.bindings){shape(binding,['ruleId','target','context']);if(typeof binding.ruleId!=='string')fail();shape(binding.target,['documentId','moduleId','elementId']);const rule=policy.rules.find((r:any)=>r.id===binding.ruleId);if(!rule||!rule.target.some((t:any)=>id(t)===id(binding.target)))fail();const key=JSON.stringify([binding.ruleId,id(binding.target)]);if(bindings.has(key))fail();shape(binding.context,Object.keys(binding.context??{}));if(Object.keys(binding.context).some(k=>!['subject','resource'].includes(k)))fail();
  for(const [name,context] of Object.entries(binding.context) as [string,any][]){shape(context,['association','endpoint']);shape(context.association,Object.hasOwn(context.association??{},'relationshipId')?['documentId','moduleId','relationshipId']:['documentId','moduleId','elementId']);const association=checked.associations.find(c=>associationId(c.kind==='candidate-graph-relationship-checks/0.1'?c.plan.relationship:c.plan.type)===associationId(context.association));const endpoint=association?.plan.endpoints.find(e=>e.role===context.endpoint);if(!endpoint||id(endpoint.target)!==id(name==='subject'?ontology.subject:binding.target))fail();}
  bindings.set(key,binding.context);
 }
 const conditions:any[]=[],residuals:any[]=[];
 for(const [index,rule] of policy.rules.entries()){
  unique(rule.actions);unique(rule.target.map(id));if(rule.actions.some((a:string)=>!ontology.actions.includes(a)))fail();if(rule.effect!=='permit'&&rule.disclosure!==undefined)fail();unique((rule.disclosure??[]).map((d:any)=>id(d.field)));
  for(const target of rule.target){const entity=entities.get(id(target));if(!entity)fail();
   for(const disclosure of rule.disclosure??[]){if(!entity.fields.some((f:any)=>id(f.ref)===id(disclosure.field)))fail();if(disclosure.disposition.kind==='transformed'){const output=fields.get(id(disclosure.disposition.field));if(!output||output.field?.kind!=='field'||!['boolean','string','integer','decimal','binary'].includes(output.field.scalarType)||output.field.cardinality!=='one'||output.field.nullability!=='required'||output.field.references?.some((r:any)=>r.role==='record-type')||Object.keys(output.field.extensions??{}).length)fail();if(output!.field.scalarType==='decimal'&&(!Number.isSafeInteger(output!.field.facets?.precision)||!Number.isSafeInteger(output!.field.facets?.scale)))fail();checkSchemaLiteral(output!.document,output!.field,disclosure.disposition.value);}}
   const entityScope=createCandidateEntityTermScope(packet.ontology,packet.documents,target),normalized=normalizeCandidateAssociationExpression(rule.condition,checked.associations,bindings.get(JSON.stringify([rule.id,id(target)])),entityScope);residuals.push(...normalized.residuals.map(r=>({ruleId:rule.id,target,path:'/rules/'+index+'/condition'+r.path,reason:r.reason})));conditions.push({ruleId:rule.id,target,...(normalized.residuals.length?{normalized}:{transport:serializeCandidateAssociationExpression(normalized)})});
  }
 }
 const result=freeze({kind:'candidate-security-policy-checks/0.1',policy:packet.policy,ontology:checked,conditions,residuals});issued.add(result);return result;
}
