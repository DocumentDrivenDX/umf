// SPDX-License-Identifier: MIT OR Apache-2.0
import {ProtectionLiteralBudget} from './protection/literals';
import {createCandidateEntityTermScope,readCandidateEntityTermScope,readCandidateEntityTermScopeRoot,resolveCandidateEntityTerm} from './entity-terms-candidate';
import {resolveCandidateSecurityOntology} from './ontology-checks-candidate';
/** Private association-scope normalization. Residual terms prevent policy admission. */
import {copyJson} from '../../model/json';
import {resolveCandidateAssociationChecks,requireIssuedCandidateAssociationChecks,readCandidateAssociationSource,readCandidateAssociationSourceReference,type CandidateAssociationChecks} from './association-checks';
import {createCandidateAssociationScope,bindCandidateAssociationWitness,resolveCandidateAssociationScopeTerm,type CandidateAssociationScope} from './association-witness';
import {compileCandidateCompactCondition,normalizeCandidateConditionSource,candidateAssociationOperandDomain} from '#security-candidate-condition';
function canonical(v:any):string{return Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);}
const fail=():never=>{throw Error('SECURITY_ASSOCIATION_EXPRESSION_UNSUPPORTED');};
function shape(v:any,keys:string[]){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))fail();}
function reference(r:any,relationship=false){shape(r,relationship?['documentId','moduleId','relationshipId']:['documentId','moduleId','elementId']);for(const v of Object.values(r))if(typeof v!=='string'||!v)fail();}
function identity(r:any,relationship=false){reference(r,relationship);return JSON.stringify([relationship?'relationship':'record',r.documentId,r.moduleId,relationship?r.relationshipId:r.elementId]);}
function freeze(v:any):any{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
const issuedExpressions=new WeakSet<object>(),expressionSources=new WeakMap<object,unknown>(),expressionChecks=new WeakMap<object,readonly CandidateAssociationChecks[]>();
const expressionEntities=new WeakMap<object,unknown>();
// Issued immutable source checks permit reuse across rule-target conditions.
const sharedDocuments=new WeakMap<object,{document:any;fields:Map<string,any>;encoded:string}>();
const sharedClassifications=new WeakMap<object,readonly {key:string;encoded:string}[]>();
function sourceFor(checks:CandidateAssociationChecks){
 requireIssuedCandidateAssociationChecks(checks);const document:any=readCandidateAssociationSourceReference(checks);let source=sharedDocuments.get(document);
 if(!source){const fields=new Map<string,any>();for(const module of document.modules)for(const field of module.elements)fields.set(JSON.stringify([document.id,module.id,field.id]),field);source={document,fields,encoded:canonical(document)};sharedDocuments.set(document,source);}return source;
}
function classificationsFor(checks:CandidateAssociationChecks){
 let rows=sharedClassifications.get(checks);if(!rows){rows=(checks.classifications as any[]).map(record=>({key:identity(record.type),encoded:canonical({...record,fields:[...record.fields].sort((a:any,b:any)=>identity(a.ref)<identity(b.ref)?-1:identity(a.ref)>identity(b.ref)?1:0)})}));sharedClassifications.set(checks,rows);}return rows;
}
export function normalizeCandidateAssociationExpression(input:unknown,available:readonly CandidateAssociationChecks[],contextInput?:unknown,entityScope?:unknown,literalBudget=new ProtectionLiteralBudget()):{readonly expression:unknown;readonly residuals:readonly {path:string;reason:string}[]}{
 const packet:any=copyJson({input,...(contextInput===undefined?{}:{context:contextInput})}),expression=packet.input,contexts=Object.hasOwn(packet,'context')?packet.context:{},bindings=new Map<string,CandidateAssociationChecks>();
 const models=new Map<string,string>(),classifications=new Map<string,string>();
 if(!Array.isArray(available))return fail();const length=Object.getOwnPropertyDescriptor(available,'length');if(!length||!('value'in length)||typeof length.value!=='number'||!Number.isSafeInteger(length.value)||length.value<0||length.value>256)return fail();const count=length.value;
 for(let i=0;i<count;i++){
  const item=Object.getOwnPropertyDescriptor(available,String(i));if(!item||!('value'in item))return fail();const checks=item!.value;requireIssuedCandidateAssociationChecks(checks);
  const source=sourceFor(checks),captured=source.document,encoded=source.encoded,existing=models.get(captured.id);if(existing!==undefined&&existing!==encoded)fail();models.set(captured.id,encoded);
  for(const {key,encoded} of classificationsFor(checks)){const existing=classifications.get(key);if(existing!==undefined&&existing!==encoded)fail();classifications.set(key,encoded);}
  const graph=checks.kind==='candidate-graph-relationship-checks/0.1',key=identity(graph?checks.plan.relationship:checks.plan.type,graph);if(bindings.has(key))fail();bindings.set(key,checks);
 }
 if(entityScope!==undefined){
  const root:any=readCandidateEntityTermScopeRoot(entityScope);
  if(root.associations.length!==bindings.size)fail();
  const original=root.associations.every((checks:CandidateAssociationChecks)=>{const graph=checks.kind==='candidate-graph-relationship-checks/0.1',key=identity(graph?checks.plan.relationship:checks.plan.type,graph);return bindings.get(key)===checks;});
  if(!original){
   // Compatibility path for independently checked but source-equal inputs.
   for(const entry of root.documents){const existing=models.get(entry.document.id);if(existing!==undefined&&existing!==canonical(entry.document))fail();}
   for(const checks of root.associations){const graph=checks.kind==='candidate-graph-relationship-checks/0.1',key=identity(graph?checks.plan.relationship:checks.plan.type,graph),existing=bindings.get(key);if(!existing||canonical(existing)!==canonical(checks))fail();}
  }
 }
 if(!contexts||typeof contexts!=='object'||Array.isArray(contexts)||Object.keys(contexts).some(k=>!['subject','resource'].includes(k)))fail();
 const resolvedContexts=new Map<string,{checks:CandidateAssociationChecks;endpoint:any}>();
 for(const [name,context] of Object.entries(contexts) as [string,any][]){shape(context,['association','endpoint']);if(typeof context.endpoint!=='string'||!context.endpoint)fail();const checks=bindings.get(identity(context.association,Object.hasOwn(context.association??{},'relationshipId')));if(!checks)fail();const endpoint=checks!.plan.endpoints.find(e=>e.role===context.endpoint);if(!endpoint)fail();resolvedContexts.set(name,{checks:checks!,endpoint});}
 if(entityScope!==undefined)for(const [name,binding] of resolvedContexts){const intrinsic:any=resolveCandidateEntityTerm(entityScope,{kind:name,identity:true});if(canonical(intrinsic.term.type)!==canonical(binding.endpoint.target)||canonical(intrinsic.term.key)!==canonical(binding.endpoint.key))fail();}
 const residuals:{path:string;reason:string}[]=[];
 function term(value:any,scope:CandidateAssociationScope,path:string):unknown{
  if(entityScope!==undefined&&['subject','resource','context','constant'].includes(value?.kind))return {entity:resolveCandidateEntityTerm(entityScope,value)};
  if((value?.kind==='subject'||value?.kind==='resource')&&Object.hasOwn(contexts,value.kind)){
   const {checks,endpoint}=resolvedContexts.get(value.kind)!;
   if('identity'in value){shape(value,['kind','identity']);if(value.identity!==true)fail();return {context:value.kind,checks,term:{kind:'entity-identity',type:endpoint!.target,key:endpoint!.key}};}
   shape(value,['kind','field']);reference(value.field);
   const classified=(checks!.classifications as any[]).find(record=>identity(record.type)===identity(endpoint!.target));
   if(!classified?.fields.some((f:any)=>identity(f.ref)===identity(value.field)))fail();
   return {context:value.kind,checks,term:{kind:'record-attribute',type:endpoint!.target,field:value.field}};
  }
  if(value?.kind==='constant'){
   shape(value,['kind','field','value']);reference(value.field);if(candidateAssociationOperandDomain({term:{kind:'literal-shape',value:value.value}})!==true)fail();
   const candidates=[...bindings.values()].filter(checks=>(checks.classifications as any[]).some(record=>record.fields.some((f:any)=>identity(f.ref)===identity(value.field))));
   if(!candidates.length){residuals.push({path,reason:'constant-field-source-unresolved'});return {kind:'unresolved-term',source:value};}
   let definition:string|undefined;
   for(const checks of candidates){const source=sourceFor(checks),document=source.document,field=source.fields.get(JSON.stringify([value.field.documentId,value.field.moduleId,value.field.elementId]));if(!field)fail();const encoded=canonical(field);if(definition!==undefined&&definition!==encoded)fail();literalBudget.check(document,field,value.value);}
   return {checks:candidates[0],term:{kind:'constant',field:value.field,value:value.value}};
  }
  if(value?.kind!=='variable'){residuals.push({path,reason:'non-association-term-typing-unresolved'});return {kind:'unresolved-term',source:value};}
  if('endpoint'in value){shape(value,['kind','name','endpoint']);return resolveCandidateAssociationScopeTerm(scope,value.name,{kind:'endpoint',role:value.endpoint});}
  if('identity'in value){shape(value,['kind','name','identity']);if(value.identity!==true)fail();return resolveCandidateAssociationScopeTerm(scope,value.name,{kind:'identity'});}
  shape(value,['kind','name','field']);return resolveCandidateAssociationScopeTerm(scope,value.name,{kind:'attribute',field:value.field});
 }
 function operandType(bound:any):string|undefined{
  if(bound.entity)return bound.entity.domain;
  if(!bound.witness&&!bound.checks)return undefined;
  const selected=bound.term,checks=bound.witness?.checks??bound.checks;const source=sourceFor(checks),document=source.document;
  const fieldAt=(ref:any)=>{
   if(ref.documentId!==document.id)fail();
   return source.fields.get(JSON.stringify([ref.documentId,ref.moduleId,ref.elementId]))??fail();
  };
  const fields=selected.field?[fieldAt(selected.field)]:selected.key.fields.map((field:any)=>
   fieldAt({documentId:selected.type.documentId,moduleId:field.module,elementId:field.element}));
  return candidateAssociationOperandDomain({term:selected,fields}) as string;
 }
 const scopes=[createCandidateAssociationScope()],witnesses:unknown[]=[],operands:unknown[]=[];
 const normalized=normalizeCandidateConditionSource(expression,(request:unknown)=>{
  const event=request as any;
  if(event.kind==='term'){
   const index=operands.length;
   operands.push(term(event.term,scopes[event.scope]!,event.path));
   return index;
  }
  if(event.kind==='domains')return [operandType(operands[event.left])??null,operandType(operands[event.right])??null];
  if(event.kind==='bind'){
   const graph=Object.hasOwn(event.association??{},'relationshipId');
   const checks=bindings.get(identity(event.association,graph))??fail();
   const bound=bindCandidateAssociationWitness(scopes[event.scope]!,checks,event.alias);
   const scope=scopes.length,witness=witnesses.length;
   scopes.push(bound.scope);witnesses.push(bound.witness);
   return {scope,witness};
  }
  return fail();
 });
 function attach(value:any):unknown{
  switch(value.op){
   case 'eq':return {op:value.op,left:operands[value.left],right:operands[value.right]};
   case 'exists':return {op:value.op,witness:witnesses[value.witness],where:attach(value.where)};
   case 'not':return {op:value.op,arg:attach(value.arg)};
   case 'and':case 'or':return {op:value.op,args:value.args.map(attach)};
   default:return value;
  }
 }
 const result=freeze({expression:attach(normalized),residuals});
 issuedExpressions.add(result);
 expressionSources.set(result,packet);
 expressionChecks.set(result,[...bindings.values()]);
 if(entityScope!==undefined)expressionEntities.set(result,entityScope);
 return result;
}


function marshalCandidateCondition(input:{expression:any},association:(checks:CandidateAssociationChecks)=>number):unknown{
 let nextToken=0;const witnessTokens=new WeakMap<object,number>();
 const token=(witness:object):number=>{let value=witnessTokens.get(witness);if(value===undefined){value=nextToken++;if(value>=4096)fail();witnessTokens.set(witness,value);}return value;};
 function term(value:any):unknown{
  if(value.entity)return {kind:'entity',term:copyJson(value.entity.term),domain:value.entity.domain};
  if(value.witness)return {kind:'witness',token:token(value.witness),term:copyJson(value.term)};
  if(value.checks)return {kind:value.context?'context':'association',...(value.context?{context:value.context}:{}),association:association(value.checks),term:copyJson(value.term)};
  return fail();
 }
 function walk(value:any):unknown{
  if(value.op==='literal')return copyJson(value);
  if(value.op==='eq')return {op:'eq',left:term(value.left),right:term(value.right)};
  if(value.op==='not')return {op:'not',arg:walk(value.arg)};
  if(value.op==='and'||value.op==='or')return {op:value.op,args:value.args.map((v:any)=>walk(v))};
  if(value.op!=='exists')return fail();
  const witness=value.witness;return {op:'exists',token:token(witness),alias:witness.name,association:association(witness.checks),where:walk(value.where)};
 }
 return walk(input.expression);
}

/** Private JSON transport bridge, not a compiler or authorization admission token. */
export function serializeCandidateAssociationExpression(normalized:unknown):unknown{
 if(!normalized||typeof normalized!=='object'||!issuedExpressions.has(normalized))fail();
 const input=normalized as {expression:any;residuals:unknown[]};if(input.residuals.length)fail();
 const associations:any[]=[],associationIndexes=new Map<object,number>();
 function association(checks:CandidateAssociationChecks):number{let index=associationIndexes.get(checks);if(index===undefined){index=associations.length;associationIndexes.set(checks,index);associations.push({checks:copyJson(checks),source:readCandidateAssociationSource(checks)});}return index;}
 for(const checks of expressionChecks.get(normalized as object)!)association(checks);
 const lowered=compileCandidateCompactCondition(marshalCandidateCondition(input,association),associations.length) as any,expression=lowered.expression,entities=expressionEntities.get(normalized as object);return freeze({kind:entities===undefined?'candidate-association-expression-transport/0.1':'candidate-association-expression-transport/0.2',sourceExpression:copyJson(expressionSources.get(normalized as object)),associations,expression,...(entities===undefined?{}:{entities:readCandidateEntityTermScope(entities)})});
}


/** Recheck transported source and compare regenerated descriptors. No authority is issued. */
export function inspectCandidateAssociationExpressionTransport(input:unknown):unknown{
 const packet:any=copyJson(input),intrinsic=packet.kind==='candidate-association-expression-transport/0.2';shape(packet,intrinsic?['kind','sourceExpression','associations','expression','entities']:['kind','sourceExpression','associations','expression']);
 if(!['candidate-association-expression-transport/0.1','candidate-association-expression-transport/0.2'].includes(packet.kind)||!Array.isArray(packet.associations)||packet.associations.length>256)fail();
 let entityScope:unknown;if(intrinsic){shape(packet.entities,['kind','ontology','documents','target']);if(packet.entities.kind!=='candidate-entity-term-scope/0.1')fail();entityScope=createCandidateEntityTermScope(packet.entities.ontology,packet.entities.documents,packet.entities.target);}
 const checks=packet.associations.map((entry:any)=>{
  shape(entry,['checks','source']);const archived=entry.checks,plan=archived?.plan;
  // Draft interpretation profiles need an independently authenticated selection;
  // the receiver cannot acquire that authority from the transport itself.
  if(archived?.interpretedQualifier)fail();
  const graph=archived?.kind==='candidate-graph-relationship-checks/0.1';
  if(!graph&&archived?.kind!=='candidate-record-association-checks/0.1')fail();
  const entities=new Map<string,any>();for(const endpoint of plan.endpoints){const key=identity(endpoint.target),value={type:endpoint.target,keyId:endpoint.key.id},old=entities.get(key);if(old&&canonical(old)!==canonical(value))fail();entities.set(key,value);}
  let selector:any;
  if(graph){selector={kind:'core-relationship',relationship:plan.relationship,witness:plan.witness.kind==='record-key'?{kind:'record-key',type:plan.witness.type,keyId:plan.witness.key.id}:{kind:'opaque-existential'},endpoints:plan.endpoints.map((e:any)=>({role:e.role,side:e.side,target:e.target,keyId:e.key.id}))};}
  else selector={kind:'record-members',type:plan.type,keyId:plan.key.id,endpoints:plan.endpoints.map((e:any)=>({role:e.role,target:e.target,fields:e.fields}))};
  const result=resolveCandidateAssociationChecks(selector,entry.source,[...entities.values()],archived.classifications);if(canonical(result)!==canonical(archived))fail();return result;
 });
 const source=packet.sourceExpression;shape(source,Object.hasOwn(source??{},'context')?['input','context']:['input']);
 const normalized=normalizeCandidateAssociationExpression(source.input,checks,source.context,entityScope),regenerated=serializeCandidateAssociationExpression(normalized);
 if(canonical(regenerated)!==canonical(packet))fail();return regenerated;
}

/** Private compact IR; its association indices name the exact supplied issued table.
 * This omits per-condition source archives, never source checking or authority. */
const compactConditions=new WeakMap<object,{associations:readonly CandidateAssociationChecks[];entityScope:unknown}>();
export function requireIssuedCandidateCompactCondition(value:unknown,available:readonly CandidateAssociationChecks[],entityScope?:unknown):void{
 if(!value||typeof value!=='object'||!compactConditions.has(value)||!Array.isArray(available))fail();
 const binding=compactConditions.get(value as object)!,length=Object.getOwnPropertyDescriptor(available,'length');
 if(!length||!('value'in length)||length.value!==binding.associations.length||entityScope!==binding.entityScope)fail();
 for(let i=0;i<binding.associations.length;i++){const item=Object.getOwnPropertyDescriptor(available,String(i));if(!item||!('value'in item)||item.value!==binding.associations[i])fail();}
}
export function compileCandidateAssociationCondition(normalized:unknown,available:readonly CandidateAssociationChecks[]):unknown{
 if(!normalized||typeof normalized!=='object'||!issuedExpressions.has(normalized))fail();
 const input=normalized as {expression:any;residuals:unknown[]};if(input.residuals.length||!Array.isArray(available))fail();
 const length=Object.getOwnPropertyDescriptor(available,'length');
 if(!length||!('value'in length)||!Number.isSafeInteger(length.value)||length.value<0||length.value>256)fail();
 const indexes=new Map<CandidateAssociationChecks,number>();
 for(let i=0;i<length!.value;i++){
  const item=Object.getOwnPropertyDescriptor(available,String(i));if(!item||!('value'in item))fail();
  const checks=item!.value;requireIssuedCandidateAssociationChecks(checks);if(indexes.has(checks))fail();indexes.set(checks,i);
 }
 const original=expressionChecks.get(normalized as object)!;
 if(indexes.size!==original.length||original.some(checks=>!indexes.has(checks)))fail();
 const result=compileCandidateCompactCondition(marshalCandidateCondition(input,checks=>{const index=indexes.get(checks);if(index===undefined)fail();return index!;}),indexes.size) as any;
 freeze(result);compactConditions.set(result,{associations:Object.freeze([...indexes.keys()]),entityScope:expressionEntities.get(normalized as object)});return result;
}
