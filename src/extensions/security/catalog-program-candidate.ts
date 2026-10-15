/** Private canonical .2 logical source compiler. No fact supply or enforcement authority. */
import {copyJson} from '../../model/json';
import {inspectSecurityPolicyV2Source} from './policy-representation-v2';
import {resolveCandidateSecurityOntology} from './ontology-checks-candidate';
import {createCandidateEntityTermScopeSet,resolveCandidateEntityTerm} from './entity-terms-candidate';
import {normalizeCandidateAssociationExpression,compileCandidateAssociationCondition,requireIssuedCandidateCompactCondition} from './association-expression';
import {checkProtectionFunctionDefinitions} from './protection/functions';
import {inspectProtectionObligations} from './protection/obligations';
const programs=new WeakMap<object,any>();
const fail=(message:string):never=>{throw Error('SECURITY_CATALOG_PROGRAM_UNRESOLVED: '+message);};
const id=(r:any)=>JSON.stringify([r.documentId,r.moduleId,r.elementId]);
const associationId=(r:any)=>JSON.stringify([Object.hasOwn(r,'relationshipId')?'relationship':'record',r.documentId,r.moduleId,r.relationshipId??r.elementId]);
function shape(v:any,keys:string[]):void{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))fail('Closed source shape required');}
function unique(values:string[]):void{if(new Set(values).size!==values.length)fail('Duplicate source identity');}
function freeze(v:any):any{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
function textBound(v:any):void{let units=0;const pending=[v];while(pending.length){const x=pending.pop();if(typeof x==='string')units+=x.length;else if(x&&typeof x==='object')for(const [key,child] of Object.entries(x)){units+=key.length;pending.push(child);}if(units>4_000_000)fail('Source text budget exhausted');}}
/** Every condition expansion is charged before any rule-target normalization/helper allocation. */
function expansion(policy:any):{targets:number;nodes:number;operands:number;conditionText:number}{
 let sourceNodes=0,nodes=0,targets=0,operands=0,conditionText=0;
 for(const rule of policy.rules){let count=0,terms=0;const pending=[rule.condition];while(pending.length){const x=pending.pop();if(++count+sourceNodes>4096)fail('Source expression budget exhausted');if(x.op==='eq')terms+=2;if(x.op==='and'||x.op==='or')pending.push(...x.args);else if(x.op==='not')pending.push(x.arg);else if(x.op==='exists')pending.push(x.where);}
  sourceNodes+=count;targets+=rule.target.length;nodes+=count*rule.target.length;operands+=terms*rule.target.length;conditionText+=JSON.stringify(rule.condition).length*rule.target.length;if(targets>4096||nodes>65536||conditionText>64_000_000)fail('Rule-target expansion budget exhausted');
 }return {targets,nodes,operands,conditionText};
}
/** Catalog must be null for a genuinely unpinned policy; no synthetic catalog or rules. */
export function compileCandidateCatalogProgram(policyInput:unknown,catalogInput:unknown,closureInput:unknown,ontologyInput:unknown,bindingsInput:unknown=[]):unknown{
 const packet:any=copyJson({policy:policyInput,catalog:catalogInput,closure:closureInput,ontology:ontologyInput,bindings:bindingsInput});textBound(packet);
 const inspection=inspectSecurityPolicyV2Source(packet.policy);if(!inspection.valid||inspection.diagnostics.some(d=>d.code==='SECURITY_V2_UNKNOWN'))fail('Known canonical policy source required');
 let policy:any=inspection.source,catalog:any=null,definitions:any[]=[],obligations:any[]=[],functionDefinitions:unknown=null;
 const charged=expansion(policy);
 shape(packet.closure,['pins','documents']);if(!Array.isArray(packet.closure.pins)||!Array.isArray(packet.closure.documents)||packet.closure.pins.length>256||packet.closure.documents.length>256)fail('Bounded core closure required');
 for(const pin of packet.closure.pins){shape(pin,['documentId','revision']);if(typeof pin.documentId!=='string'||!pin.documentId||typeof pin.revision!=='string'||!pin.revision)fail('Exact closure pins required');}
 unique(packet.closure.pins.map((p:any)=>p.documentId));
 if(Object.hasOwn(policy,'protection')){
  const typed=checkProtectionFunctionDefinitions(policy,packet.catalog,packet.closure);if(typed.status==='refused')fail('Whole catalog function/domain closure failed');
  const declared=inspectProtectionObligations(typed.policy,typed.catalog,typed.closure,packet.ontology);if(declared.status==='refused')fail('Exact declared obligations/purposes required');
  functionDefinitions=typed;policy=typed.policy;catalog=typed.catalog;definitions=[...typed.definitions];obligations=[...declared.obligations];
 }else if(packet.catalog!==null)fail('Unpinned policy cannot acquire catalog semantics');
 const root=resolveCandidateSecurityOntology(packet.ontology,packet.closure.documents),ontology:any=root.ontology;
 if(policy.ontology.documentId!==ontology.documentId||policy.ontology.revision!==ontology.revision)fail('Exact ontology pin required');
 const pins=new Map(packet.closure.pins.map((p:any)=>[p.documentId,p.revision]));
 if(pins.size!==ontology.documents.length||ontology.documents.some((p:any)=>pins.get(p.documentId)!==p.revision))fail('Ontology and core closure pins must coincide');
 for(const entry of root.documents as any[])if(entry.document.umf!=='0.8.0')fail('Known core0.8 source profile required');
 const entities=new Map<string,any>(ontology.entities.map((e:any)=>[id(e.type),e]));
 // Conservative descriptor/domain charge before any condition normalization.
 // It includes DTO refs and full Key component definitions, not merely AST counts.
 const sourceFields=new Map<string,any>();let descriptorUnits=128;
 for(const entry of root.documents as any[])for(const module of entry.document.modules)for(const field of module.elements)if(field.kind==='field'){
  const ref={documentId:entry.document.id,moduleId:module.id,elementId:field.id};sourceFields.set(id(ref),field);descriptorUnits=Math.max(descriptorUnits,JSON.stringify(field).length+JSON.stringify(ref).length+128);
 }
 for(const entity of ontology.entities){const doc=(root.documents as any[]).find(e=>e.document.id===entity.type.documentId).document,record=doc.modules.find((m:any)=>m.id===entity.type.moduleId).elements.find((e:any)=>e.id===entity.type.elementId),key=record.keys.find((k:any)=>k.id===entity.keyId);
  let units=JSON.stringify(entity.type).length+JSON.stringify(key).length+128;for(const field of key.fields)units+=JSON.stringify(sourceFields.get(id({documentId:entity.type.documentId,moduleId:field.module,elementId:field.element}))).length+128;descriptorUnits=Math.max(descriptorUnits,units);
 }
 const expandedText=charged.conditionText+charged.operands*descriptorUnits;
 if(!Number.isSafeInteger(expandedText)||expandedText>64_000_000)fail('Expanded condition/descriptor text budget exhausted');

 unique(policy.rules.map((r:any)=>r.id));
 if(!Array.isArray(packet.bindings)||packet.bindings.length>4096)fail('Bounded binding table required');
 const bindings=new Map<string,any>();
 for(const binding of packet.bindings){
  shape(binding,['ruleId','target','context']);shape(binding.target,['documentId','moduleId','elementId']);const rule=policy.rules.find((r:any)=>r.id===binding.ruleId);
  if(!rule||!rule.target.some((t:any)=>id(t)===id(binding.target)))fail('Binding must name actual rule target');
  const key=JSON.stringify([binding.ruleId,id(binding.target)]);if(bindings.has(key))fail('Duplicate binding');
  if(!binding.context||typeof binding.context!=='object'||Array.isArray(binding.context)||Object.keys(binding.context).some(k=>!['subject','resource'].includes(k)))fail('Exact intrinsic binding names required');
  for(const [name,context] of Object.entries(binding.context) as [string,any][]){shape(context,['association','endpoint']);shape(context.association,Object.hasOwn(context.association??{},'relationshipId')?['documentId','moduleId','relationshipId']:['documentId','moduleId','elementId']);const association=root.associations.find(c=>associationId(c.kind==='candidate-graph-relationship-checks/0.1'?c.plan.relationship:c.plan.type)===associationId(context.association)),endpoint=association?.plan.endpoints.find(e=>e.role===context.endpoint);if(!endpoint||id(endpoint.target)!==id(name==='subject'?ontology.subject:binding.target))fail('Binding endpoint/type correspondence failed');}
  bindings.set(key,binding.context);
 }
 const scopeFor=createCandidateEntityTermScopeSet(root),scopes=new Map<string,unknown>(),conditions:any[]=[];
 for(const [ruleIndex,rule] of policy.rules.entries()){
  unique(rule.actions);unique(rule.target.map(id));if(rule.actions.some((a:string)=>!ontology.actions.includes(a)))fail('Undeclared action');
  if(rule.effect!=='permit'&&rule.disclosure!==undefined)fail('Only permits may disclose');unique((rule.disclosure??[]).map((d:any)=>id(d.field)));
  for(const target of rule.target){
   const key=id(target),entity=entities.get(key);if(!entity)fail('Missing target entity');let scope=scopes.get(key);if(!scope){scope=scopeFor(target);scopes.set(key,scope);}
   for(const disclosure of rule.disclosure??[]){
    if(!entity.fields.some((f:any)=>id(f.ref)===id(disclosure.field)))fail('Disclosure input must be a live target Field');const d=disclosure.disposition;
    if(d.kind==='transformed'){
     if(d.vocabulary==='umf.security.protection'){
      const transform=catalog?.transforms.find((t:any)=>t.id===d.transform&&t.version===d.version);if(!transform||id(transform.inputDomain)!==id(disclosure.field)||id(transform.outputDomain)!==id(d.field))fail('Exact catalog input/output domains required');
     }else resolveCandidateEntityTerm(scope,{kind:'constant',field:d.field,value:d.value});
    }
   }
   const normalized=normalizeCandidateAssociationExpression(rule.condition,root.associations,bindings.get(JSON.stringify([rule.id,key])),scope);if(normalized.residuals.length)fail('Residual condition meaning');
   const condition=compileCandidateAssociationCondition(normalized,root.associations);requireIssuedCandidateCompactCondition(condition,root.associations,scope);conditions.push(freeze({ruleIndex,target,condition,scope}));
  }
 }
 const source=freeze({policy,catalog,ontology:root,closure:{pins:packet.closure.pins,documents:root.documents},definitions,functionDefinitions,obligations,bindings:packet.bindings,conditions,charged:{...charged,descriptorUnits,expandedText}});
 const handle=Object.freeze({kind:'candidate-catalog-program/0.1',complete:false,authority:false});programs.set(handle,source);return handle;
}
/** Private runtime bridge: only the exact original compiled handle resolves. */
export function readCandidateCatalogProgram(handle:unknown):any{if(!handle||typeof handle!=='object'||!programs.has(handle))fail('Original compiled program required');return programs.get(handle as object);}
