// SPDX-License-Identifier: MIT OR Apache-2.0
/** Host custody of the private logical catalog program's issued handles. */
import {copyJson} from '../../model/json';
import {resolveCandidateSecurityOntology} from './ontology-checks-candidate';
import {createCandidateEntityTermScopeSet,resolveCandidateEntityTerm} from './entity-terms-candidate';
import {normalizeCandidateAssociationExpression,compileCandidateAssociationCondition,requireIssuedCandidateCompactCondition} from './association-expression';
import {checkProtectionFunctionDefinitions} from './protection/functions';
import {inspectProtectionObligationsFromCheckedParameters} from './protection/obligations';
import {planCandidateCatalogProgram,prepareCandidateCatalogProgram} from '#security-candidate-condition';

interface Expansion {
 targets:number;
 nodes:number;
 operands:number;
 conditionText:number;
}
interface ProgramPlan {
 descriptorUnits:number;
 expandedText:number;
 tasks:ReadonlyArray<{ruleIndex:number;targetIndex:number;bindingIndex:number|null;inline:readonly number[]}>;
}
const programs=new WeakMap<object,any>();
const fail=(message:string):never=>{throw Error('SECURITY_CATALOG_PROGRAM_UNRESOLVED: '+message);};
const targetKey=(target:{documentId:string;moduleId:string;elementId:string})=>JSON.stringify([target.documentId,target.moduleId,target.elementId]);
function freeze<T>(value:T):T {
 if(value&&typeof value==='object'&&!Object.isFrozen(value)){
  Object.values(value).forEach(freeze);
  Object.freeze(value);
 }
 return value;
}

/** Keep the original ontology, recipe and condition handles in host custody. */
export function compileCandidateCatalogProgram(
 policyInput:unknown,catalogInput:unknown,closureInput:unknown,ontologyInput:unknown,
 bindingsInput:unknown=[],extensionClosure?:unknown,
):unknown {
 const packet:any=copyJson({policy:policyInput,catalog:catalogInput,closure:closureInput,ontology:ontologyInput,bindings:bindingsInput});
 const {catalogRequired,...charged}=prepareCandidateCatalogProgram(packet) as Expansion&{catalogRequired:boolean};
 let policy=packet.policy,catalog:any=null,definitions:any[]=[],obligations:any[]=[],functionDefinitions:unknown=null;
 if(catalogRequired){
  const typed=checkProtectionFunctionDefinitions(policy,packet.catalog,packet.closure);
  if(typed.status==='refused')fail('Whole catalog function/domain closure failed');
  const declared=inspectProtectionObligationsFromCheckedParameters(typed.policy,typed.catalog,typed.closure,packet.ontology);
  if(declared.status==='refused')fail('Exact declared obligations/purposes required');
  functionDefinitions=typed;
  policy=typed.policy;
  catalog=typed.catalog;
  definitions=[...typed.definitions];
  obligations=[...declared.obligations];
 }
 const root=resolveCandidateSecurityOntology(packet.ontology,packet.closure.documents,extensionClosure);
 const {tasks,descriptorUnits,expandedText}=planCandidateCatalogProgram({
  policy,catalog,root,pins:packet.closure.pins,bindings:packet.bindings,charged,
 }) as ProgramPlan;
 const scopeFor=createCandidateEntityTermScopeSet(root);
 const scopes=new Map<string,unknown>();
 const conditions=tasks.map(({ruleIndex,targetIndex,bindingIndex,inline})=>{
  const rule=policy.rules[ruleIndex];
  const target=rule.target[targetIndex];
  const key=targetKey(target);
  if(!scopes.has(key))scopes.set(key,scopeFor(target));
  const scope=scopes.get(key);
  for(const index of inline){
   const {field,value}=rule.disclosure[index].disposition;
   resolveCandidateEntityTerm(scope,{kind:'constant',field,value});
  }
  const context=bindingIndex===null?undefined:packet.bindings[bindingIndex].context;
  const normalized=normalizeCandidateAssociationExpression(rule.condition,root.associations,context,scope);
  if(normalized.residuals.length)fail('Residual condition meaning');
  const condition=compileCandidateAssociationCondition(normalized,root.associations);
  requireIssuedCandidateCompactCondition(condition,root.associations,scope);
  return freeze({ruleIndex,target,condition,scope});
 });
 const source=freeze({
  ...(extensionClosure===undefined?{}:{extensionClosure}),policy,catalog,ontology:root,
  closure:{pins:packet.closure.pins,documents:root.documents},definitions,functionDefinitions,obligations,
  bindings:packet.bindings,conditions,charged:{...charged,descriptorUnits,expandedText},
 });
 const handle=Object.freeze({kind:'candidate-catalog-program/0.1',complete:false,authority:false});
 programs.set(handle,source);
 return handle;
}

/** Only the exact original compiled handle resolves. */
export function readCandidateCatalogProgram(handle:unknown):any {
 if(!handle||typeof handle!=='object'||!programs.has(handle))fail('Original compiled program required');
 return programs.get(handle as object);
}
