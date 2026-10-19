// SPDX-License-Identifier: MIT OR Apache-2.0
/** Private conditional source plan. No branch activation, designation, permission or native admission. */
import wire from '../../../spec/extensions/security-protection/schema.json';
import {copyJson} from '../../model/json';
import {canonicalSchemaJson} from '../../model/schema-literals';
import type {Json} from '../../model/types';
import {createValidator} from '../../validation/schema';
import {readCandidateCatalogProgram} from './catalog-program-candidate';
import {validateCandidateCatalogStorage} from './catalog-storage-candidate';
import {ProtectionLiteralBudget} from './protection/literals';
import {checkProtectionParametersWithinBudget} from './protection/parameters';
import {compareSelectedProtectionQueryProperties} from './protection/queries';
const defs:any=copyJson(wire.$defs);
function close(v:any):void{if(v&&typeof v==='object'){if(v.properties)v.additionalProperties=false;Object.values(v).forEach(close);}}close(defs);
const reference={type:'object',properties:{documentId:{type:'string',minLength:1,maxLength:4096},moduleId:{type:'string',minLength:1,maxLength:4096},elementId:{type:'string',minLength:1,maxLength:4096}},required:['documentId','moduleId','elementId'],additionalProperties:false};
const check=createValidator().compile({type:'object',properties:{scan:{type:'string',maxLength:32,pattern:'^[st][0-9]+$'},path:{type:'string',minLength:1,maxLength:4096},type:reference,field:reference,operator:{enum:['predicate','join','group','order','aggregate']},operation:{type:'string',minLength:1,maxLength:128},required:{type:'array',minItems:1,maxItems:32,items:{$ref:'#/$defs/property'}}},required:['scan','path','type','field','operator','operation','required'],additionalProperties:false,$defs:defs});
const id=(r:any)=>JSON.stringify([r.documentId,r.moduleId,r.elementId]);
const fail=():never=>{throw Error('SECURITY_QUERY_VALUE_ROUTES_REFUSED');};
function freeze<T>(v:T):T{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
export interface CandidateQueryValueRouteInspection {
 status:'inspected'|'refused';complete:false;authority:false;use:Json;
 sources:Json;domains:readonly Json[];transforms:readonly Json[];branches:readonly Json[];composition:Json;diagnostics:readonly string[];
}
/** Original source program only; caller scan/path labels and completeness remain unverified. */
export function inspectCandidateQueryValueRoutes(handle:unknown,ownerInput:unknown,useInput:unknown):CandidateQueryValueRouteInspection {
 let use:Json=null,sources:Json=null,composition:Json=null;const domains:Json[]=[],transforms:Json[]=[],branches:Json[]=[],diagnostics:string[]=[];
 const finish=(ok:boolean)=>freeze<CandidateQueryValueRouteInspection>({status:ok?'inspected':'refused',complete:false,authority:false,use,sources:ok?sources:null,domains:ok?domains:[],transforms:ok?transforms:[],branches:ok?branches:[],composition:ok?composition:null,diagnostics});
 try{
  const program=readCandidateCatalogProgram(handle),packet:any=copyJson({owner:ownerInput,use:useInput}),{owner}=packet;use=packet.use;
  const budget=new ProtectionLiteralBudget(),pending=[packet];let sourceText=0,retained=0;
  while(pending.length){budget.step();const x=pending.pop();if(typeof x==='string')sourceText+=x.length;else if(x&&typeof x==='object')for(const [key,v]of Object.entries(x)){sourceText+=key.length;pending.push(v);}if(sourceText>4000000)fail();}
  if(!check(use))fail();const u:any=use,ontology=program.ontology.ontology;if(u.scan.trim()!==u.scan)fail();
  const storage=validateCandidateCatalogStorage(program,owner,()=>budget.step());if(!owner.disclosure)fail();
  const entity=ontology.entities.find((e:any)=>id(e.type)===id(u.type)),member=entity?.fields.find((f:any)=>id(f.ref)===id(u.field));if(!member)fail();
  const own=storage.get(JSON.stringify([id(u.type),id(u.field)]));if(!own)fail();
  const retain=(v:any)=>{budget.step();retained+=JSON.stringify(v).length+2;if(retained>4000000)fail();return v;};
  const indexed=new Map<string,any>();
  for(const entry of program.closure.documents)for(const module of entry.document.modules)for(const element of module.elements){budget.step();if(element.kind==='field')indexed.set(id({documentId:entry.document.id,moduleId:module.id,elementId:element.id}),{document:entry.document,element});}
  const domainKeys=new Set<string>();
  const domain=(ref:any)=>{const key=id(ref),f=indexed.get(key);if(!f)fail();if(!domainKeys.has(key)){domainKeys.add(key);domains.push(retain({field:ref,identity:{documentId:f.document.id,revision:program.closure.pins.find((p:any)=>p.documentId===f.document.id).revision,module:ref.moduleId,element:ref.elementId},element:f.element}));}return ref;};
  domain(u.field);
  for(const property of u.required){budget.step();if(property&&typeof property==='object'&&property.kind==='range'){const f=indexed.get(id(property.bucket.field));if(!f||canonicalSchemaJson(property.bucket.value).length>4096)fail();budget.identity(f.document,f.element,property.bucket.value);}}
  const mode=(v:any)=>{if(!['prohibited','disclosed','original-authorized'].includes(v))fail();return v;};
  const ontologyConstraint={source:'ontology',mode:mode(member.queryUse?.[u.operator]??(member.protection==='protected'?'prohibited':'disclosed'))};
  const parameters=program.catalog?checkProtectionParametersWithinBudget(program.policy,program.catalog,program.closure,budget):null;if(parameters?.status==='refused')fail();
  const transformIndices=new Map<any,number>();
  const selectedTransform=(name:string,version:string)=>{const index=program.catalog?.transforms.findIndex((t:any)=>{budget.step();return t.id===name&&t.version===version;})??-1;if(index<0)fail();const t=program.catalog.transforms[index];if(!transformIndices.has(t)){transformIndices.set(t,index);transforms.push(retain({index,declaration:t}));}return t;};
  const properties=(t:any)=>{if(!parameters)fail();const report=compareSelectedProtectionQueryProperties(parameters!,{type:u.type,field:u.field,operator:u.operator,required:u.required},t,budget,[]);if(report.diagnostics.some(d=>d.severity==='error'&&d.code!=='PROTECTION_QUERY_MISSING'))fail();return {status:report.status,effective:report.effectiveProperties,required:report.requiredProperties,missing:report.missingProperties};};
  const stored=own.storageEffect==='stored-transformed'?selectedTransform(own.storageTransform.id,own.storageTransform.version):null;
  const storageConstraint=stored?{source:'storage-catalog',catalogIndex:transformIndices.get(stored),transform:{id:stored.id,version:stored.version},mode:mode(stored.queryUse[u.operator]??'prohibited'),properties:properties(stored)}:null;
  if(stored)domain(stored.inputDomain);
  sources=retain({policy:{id:program.policy.id,revision:program.policy.revision},ontology:{documentId:ontology.documentId,revision:ontology.revision},catalog:program.catalog?{id:program.catalog.id,revision:program.catalog.revision}:null,owner:{id:owner.id,revision:owner.revision},readAction:owner.disclosure.readAction,baseConstraints:[ontologyConstraint,...(storageConstraint?[storageConstraint]:[])],originalLiveField:u.field,storageEffect:own.storageEffect,...(stored?{preStorageInput:{field:stored.inputDomain,origin:'pre-storage-input',selectable:false}}:{})});
  const groups:{kind:string;disposition:any;ruleIndices:number[];disclosureIndices:(number|null)[];sourceDispositions:any[]}[]=[],groupIndex=new Map<string,number>();
  const add=(kind:string,disposition:any,ruleIndex:number,disclosureIndex:number|null)=>{
   let key=canonicalSchemaJson(disposition);if(kind==='transformed'&&disposition.vocabulary!=='umf.security.protection'){const f=indexed.get(id(disposition.field));if(!f)fail();const literal=disposition.value===null?(budget.check(f.document,f.element,null),budget.retain('null')):budget.identity(f.document,f.element,disposition.value);key=canonicalSchemaJson([disposition.transform,disposition.version,id(disposition.field),literal]);}
   let index=groupIndex.get(key);if(index===undefined){if(groups.length>=256)fail();index=groups.length;groupIndex.set(key,index);groups.push({kind,disposition,ruleIndices:[],disclosureIndices:[],sourceDispositions:[]});}groups[index]!.ruleIndices.push(ruleIndex);groups[index]!.disclosureIndices.push(disclosureIndex);groups[index]!.sourceDispositions.push(disclosureIndex===null?null:disposition);
  };
  const readRules:number[]=[],readConditions:any[]=[];const bindings=new Map<string,any>();for(const binding of program.bindings){budget.step();if(id(binding.target)===id(u.type))bindings.set(binding.ruleId,binding.context);}
  for(const [ruleIndex,rule]of program.policy.rules.entries()){
   budget.step();if(!rule.actions.includes(owner.disclosure.readAction)||!rule.target.some((t:any)=>id(t)===id(u.type)))continue;readConditions.push({ruleIndex,ruleId:rule.id,effect:rule.effect,condition:rule.condition,...(bindings.has(rule.id)?{contextBindings:bindings.get(rule.id)}:{})});if(rule.effect!=='permit')continue;readRules.push(ruleIndex);
   const disclosureIndex=rule.disclosure?.findIndex((d:any)=>{budget.step();return id(d.field)===id(u.field);})??-1;
   if(disclosureIndex<0){if(member.protection==='unprotected')add('original',{kind:'original'},ruleIndex,null);else add('missing',{kind:'missing'},ruleIndex,null);continue;}
   const d=rule.disclosure[disclosureIndex].disposition;add(d.kind,d,ruleIndex,disclosureIndex);
  }
  // Branch guards reference original source rules. No rule truth or effective disposition is asserted here.
  for(const [index,group]of groups.entries()){
   budget.step();const d=group.disposition,readTransform=d.kind==='transformed'&&d.vocabulary==='umf.security.protection'?selectedTransform(d.transform,d.version):null;
   const constraints:any[]=[ontologyConstraint,...(storageConstraint?[storageConstraint]:[]),...(readTransform?[{source:'read-catalog',catalogIndex:transformIndices.get(readTransform),transform:{id:readTransform.id,version:readTransform.version},mode:mode(readTransform.queryUse[u.operator]??'prohibited'),properties:properties(readTransform)}]:[])];
   const modes=constraints.map(c=>c.mode),conflict=new Set(modes).size>1;
   let status:string,valueOrigin:string='none',valueDomain:any=null;
   if(modes.includes('prohibited'))status='prohibited';else if(conflict)status='conflicting-modes';
   else if(modes[0]==='original-authorized'){status='requires-original-action';valueOrigin='live-field';valueDomain=domain(u.field);}
   else if(d.kind==='withheld')status='no-disclosed-value';
   else if(d.kind==='missing')status='unresolved-disclosure';
   else if(d.kind==='transformed'&&!readTransform)status='unresolved-legacy-properties';
   else if(constraints.some(c=>c.properties&&c.properties.status!=='compatible-properties'))status='unresolved-properties';
   else{status='compatible-disclosed-properties';valueOrigin=d.kind==='transformed'?'read-transform-output':'live-field';valueDomain=domain(d.kind==='transformed'?d.field:u.field);}
   const projection=d.kind==='missing'?{kind:'unresolved-missing-disclosure'}:d.kind==='transformed'?{kind:'transformed',field:domain(d.field)}:{kind:d.kind,...(d.kind==='original'?{field:u.field}:{})};
   const excludes=groups.flatMap((other,j)=>{budget.step();return j!==index&&(d.kind==='missing'||(d.kind==='original'&&['withheld','transformed'].includes(other.kind))||(d.kind==='transformed'&&(other.kind==='withheld'||other.kind==='transformed')))?[j]:[];});
   branches.push(retain({index,sourceOccurrences:group.ruleIndices.map((ruleIndex,i)=>({ruleIndex,ruleId:program.policy.rules[ruleIndex].id,disclosureIndex:group.disclosureIndices[i],disposition:group.sourceDispositions[i]})),guard:{readDecision:'permit',anyActiveContributorGroup:index,noActiveGroups:excludes},representativeDisposition:d.kind==='missing'?null:d,projection,constraints,conflictingModes:conflict,status,queryValue:{origin:valueOrigin,field:valueDomain},requirements:status==='requires-original-action'?['exact-weft-issued-designation','separate-current-action-permission','present-live-field','independent-public-projection-admission-if-selected']:status==='compatible-disclosed-properties'?['available-effective-read-value']:[]}));
  }
  composition=retain({selection:'requires-actual-policy-and-disclosure-fold',readRuleIndices:readRules,readConditions,withholdingDominates:true,distinctActiveTransforms:'conflict',originalIsFallback:true,protectedMissingActiveDisposition:'indeterminate',absenceIsNotScalarNull:true,branchActivationUnverified:true,additionalRequirements:['actual-compiler-occurrence-and-descriptor-correspondence','row-read-eligibility','exact-operand-domain-and-presence-profile','paired-key-transform-runtime-scope','native-current-authority-and-guarded-release']});
  diagnostics.push('Conditional source alternatives only; no active rule, selected branch, scalar availability, injectivity, paired scope, designation, permission or native query admission is established');
  return finish(true);
 }catch{diagnostics.push('Original source/value-route inspection refused; no partial branches retained');return finish(false);}
}
