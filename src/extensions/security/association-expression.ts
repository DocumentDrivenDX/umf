import {createValidator} from '../../validation/schema';
import documentSchema from '../../../spec/core/schema-properties-document.schema.json';
import {checkSchemaLiteral} from '../../model/schema-literals';
import {createCandidateEntityTermScope,readCandidateEntityTermScope,resolveCandidateEntityTerm} from './entity-terms-candidate';
import {resolveCandidateSecurityOntology} from './ontology-checks-candidate';
/** Private association-scope normalization. Residual terms prevent policy admission. */
import {copyJson} from '../../model/json';
import {resolveCandidateAssociationChecks,requireIssuedCandidateAssociationChecks,readCandidateAssociationSource,type CandidateAssociationChecks} from './association-checks';
import {createCandidateAssociationScope,bindCandidateAssociationWitness,resolveCandidateAssociationScopeTerm,type CandidateAssociationScope} from './association-witness';
function canonical(v:any):string{return Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);}
const literalValidator=createValidator();literalValidator.addSchema(documentSchema);const literalShape=literalValidator.compile({$ref:documentSchema.$id+'#/$defs/literal'});
const fail=():never=>{throw Error('SECURITY_ASSOCIATION_EXPRESSION_UNSUPPORTED');};
function shape(v:any,keys:string[]){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))fail();}
function reference(r:any,relationship=false){shape(r,relationship?['documentId','moduleId','relationshipId']:['documentId','moduleId','elementId']);for(const v of Object.values(r))if(typeof v!=='string'||!v)fail();}
function identity(r:any,relationship=false){reference(r,relationship);return JSON.stringify([relationship?'relationship':'record',r.documentId,r.moduleId,relationship?r.relationshipId:r.elementId]);}
function freeze(v:any):any{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
const issuedExpressions=new WeakSet<object>(),expressionSources=new WeakMap<object,unknown>(),expressionChecks=new WeakMap<object,readonly CandidateAssociationChecks[]>();
const expressionEntities=new WeakMap<object,unknown>();
export function normalizeCandidateAssociationExpression(input:unknown,available:readonly CandidateAssociationChecks[],contextInput?:unknown,entityScope?:unknown):{readonly expression:unknown;readonly residuals:readonly {path:string;reason:string}[]}{
 const packet:any=copyJson({input,...(contextInput===undefined?{}:{context:contextInput})}),expression=packet.input,contexts=Object.hasOwn(packet,'context')?packet.context:{},bindings=new Map<string,CandidateAssociationChecks>();
 const sourceCache=new WeakMap<object,{document:any;fields:Map<string,any>}>(),models=new Map<string,string>(),classifications=new Map<string,string>();
 if(!Array.isArray(available))return fail();const length=Object.getOwnPropertyDescriptor(available,'length');if(!length||!('value'in length)||typeof length.value!=='number'||!Number.isSafeInteger(length.value)||length.value<0||length.value>256)return fail();const count=length.value;
 for(let i=0;i<count;i++){
  const item=Object.getOwnPropertyDescriptor(available,String(i));if(!item||!('value'in item))return fail();const checks=item.value;requireIssuedCandidateAssociationChecks(checks);
  const captured=sourceFor(checks).document,encoded=canonical(captured),existing=models.get(captured.id);if(existing!==undefined&&existing!==encoded)fail();models.set(captured.id,encoded);
  for(const record of checks.classifications as any[]){const key=identity(record.type),encoded=canonical({...record,fields:[...record.fields].sort((a:any,b:any)=>identity(a.ref)<identity(b.ref)?-1:identity(a.ref)>identity(b.ref)?1:0)}),existing=classifications.get(key);if(existing!==undefined&&existing!==encoded)fail();classifications.set(key,encoded);}
  const graph=checks.kind==='candidate-graph-relationship-checks/0.1',key=identity(graph?checks.plan.relationship:checks.plan.type,graph);if(bindings.has(key))fail();bindings.set(key,checks);
 }
 if(entityScope!==undefined){
  const archive:any=readCandidateEntityTermScope(entityScope),root=resolveCandidateSecurityOntology(archive.ontology,archive.documents);
  if(root.associations.length!==bindings.size)fail();
  for(const entry of archive.documents){const existing=models.get(entry.document.id);if(existing!==undefined&&existing!==canonical(entry.document))fail();}
  for(const checks of root.associations){const graph=checks.kind==='candidate-graph-relationship-checks/0.1',key=identity(graph?checks.plan.relationship:checks.plan.type,graph),existing=bindings.get(key);if(!existing||canonical(existing)!==canonical(checks))fail();}
 }
 if(!contexts||typeof contexts!=='object'||Array.isArray(contexts)||Object.keys(contexts).some(k=>!['subject','resource'].includes(k)))fail();
 const resolvedContexts=new Map<string,{checks:CandidateAssociationChecks;endpoint:any}>();
 for(const [name,context] of Object.entries(contexts) as [string,any][]){shape(context,['association','endpoint']);if(typeof context.endpoint!=='string'||!context.endpoint)fail();const checks=bindings.get(identity(context.association,Object.hasOwn(context.association??{},'relationshipId')));if(!checks)fail();const endpoint=checks!.plan.endpoints.find(e=>e.role===context.endpoint);if(!endpoint)fail();resolvedContexts.set(name,{checks:checks!,endpoint});}
 if(entityScope!==undefined)for(const [name,binding] of resolvedContexts){const intrinsic:any=resolveCandidateEntityTerm(entityScope,{kind:name,identity:true});if(canonical(intrinsic.term.type)!==canonical(binding.endpoint.target)||canonical(intrinsic.term.key)!==canonical(binding.endpoint.key))fail();}
 const residuals:{path:string;reason:string}[]=[];let nodes=0;
 function sourceFor(checks:CandidateAssociationChecks){let source=sourceCache.get(checks);if(!source){const document:any=readCandidateAssociationSource(checks),fields=new Map<string,any>();for(const module of document.modules)for(const field of module.elements)fields.set(JSON.stringify([document.id,module.id,field.id]),field);source={document,fields};sourceCache.set(checks,source);}return source;}
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
   shape(value,['kind','field','value']);reference(value.field);if(!literalShape(value.value))fail();
   const candidates=[...bindings.values()].filter(checks=>(checks.classifications as any[]).some(record=>record.fields.some((f:any)=>identity(f.ref)===identity(value.field))));
   if(!candidates.length){residuals.push({path,reason:'constant-field-source-unresolved'});return {kind:'unresolved-term',source:value};}
   let definition:string|undefined;
   for(const checks of candidates){const source=sourceFor(checks),document=source.document,field=source.fields.get(JSON.stringify([value.field.documentId,value.field.moduleId,value.field.elementId]));if(!field)fail();const encoded=canonical(field);if(definition!==undefined&&definition!==encoded)fail();definition=encoded;checkSchemaLiteral(document,field,value.value);}
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
  function domain(ref:any):unknown{
   if(ref.documentId!==document.id)fail();const field=source!.fields.get(JSON.stringify([ref.documentId,ref.moduleId,ref.elementId]));if(!field)fail();
   if(field.kind!=='field'||!['boolean','string','integer','decimal','binary'].includes(field.scalarType)||field.cardinality!=='one'||field.nullability!=='required'||field.references?.some((r:any)=>r.role==='record-type')||(field.extensions&&Object.keys(field.extensions).length))fail();
   const facets=field.facets??{};if(field.scalarType==='decimal'&&(!Number.isSafeInteger(facets.precision)||!Number.isSafeInteger(facets.scale)))fail();
   return {scalarType:field.scalarType,cardinality:field.cardinality,nullability:field.nullability,facets,allowedValues:field.allowedValues??null};
  }
  if(selected.kind==='record-attribute'||selected.kind==='constant')return 'scalar:'+canonical(domain(selected.field));
  if(!['entity-identity','record-identity'].includes(selected.kind))return fail();
  const domains=selected.key.fields.map((f:any)=>domain({documentId:selected.type.documentId,moduleId:f.module,elementId:f.element}));
  return 'identity:'+canonical({type:selected.type,keyId:selected.key.id,domains});
 }
 function walk(value:any,scope:CandidateAssociationScope,path:string,depth:number):unknown{
  if(++nodes>4096||depth>16)fail();
  if(value?.op==='literal'){shape(value,['op','value']);if(typeof value.value!=='boolean')fail();return value;}
  if(value?.op==='eq'){shape(value,['op','left','right']);const left=term(value.left,scope,path+'/left'),right=term(value.right,scope,path+'/right'),lt=operandType(left),rt=operandType(right);if(lt!==undefined&&rt!==undefined&&lt!==rt)fail();return {op:'eq',left,right};}
  if(value?.op==='not'){shape(value,['op','arg']);return {op:'not',arg:walk(value.arg,scope,path+'/arg',depth+1)};}
  if(value?.op==='and'||value?.op==='or'){shape(value,['op','args']);if(!Array.isArray(value.args)||!value.args.length||value.args.length>64)fail();return {op:value.op,args:value.args.map((v:any,i:number)=>walk(v,scope,path+'/args/'+i,depth+1))};}
  if(value?.op!=='exists')return fail();shape(value,['op','association','as','where']);
  const graph=Object.hasOwn(value.association??{},'relationshipId'),key=identity(value.association,graph),checks=bindings.get(key);if(!checks)return fail();
  const binding=bindCandidateAssociationWitness(scope,checks,value.as);
  return {op:'exists',witness:binding.witness,where:walk(value.where,binding.scope,path+'/where',depth+1)};
 }
 const result=freeze({expression:walk(expression,createCandidateAssociationScope(),'',1),residuals});issuedExpressions.add(result);expressionSources.set(result,packet);expressionChecks.set(result,[...bindings.values()]);if(entityScope!==undefined)expressionEntities.set(result,entityScope);return result;
}


/** Private JSON transport bridge, not a compiler or authorization admission token. */
export function serializeCandidateAssociationExpression(normalized:unknown):unknown{
 if(!normalized||typeof normalized!=='object'||!issuedExpressions.has(normalized))fail();
 const input=normalized as {expression:any;residuals:unknown[]};if(input.residuals.length)fail();
 const associations:any[]=[],associationIndexes=new Map<object,number>();let nextOccurrence=0;
 function association(checks:CandidateAssociationChecks):number{let index=associationIndexes.get(checks);if(index===undefined){index=associations.length;associationIndexes.set(checks,index);associations.push({checks:copyJson(checks),source:readCandidateAssociationSource(checks)});}return index;}
 function term(value:any,scope:Map<object,number>):unknown{
  if(value.entity)return {kind:'entity-term',term:copyJson(value.entity.term),domain:value.entity.domain};
  if(value.witness){const occurrence=scope.get(value.witness);if(occurrence===undefined)fail();return {kind:'witness-term',occurrence,term:copyJson(value.term)};}
  if(value.checks)return {kind:value.context?'context-term':'constant-term',...(value.context?{context:value.context}:{}),association:association(value.checks),term:copyJson(value.term)};
  return fail();
 }
 function walk(value:any,scope:Map<object,number>):unknown{
  if(value.op==='literal')return copyJson(value);
  if(value.op==='eq')return {op:'eq',left:term(value.left,scope),right:term(value.right,scope)};
  if(value.op==='not')return {op:'not',arg:walk(value.arg,scope)};
  if(value.op==='and'||value.op==='or')return {op:value.op,args:value.args.map((v:any)=>walk(v,scope))};
  if(value.op!=='exists')return fail();const occurrence=nextOccurrence++,nested=new Map(scope);nested.set(value.witness,occurrence);
  return {op:'exists',occurrence,alias:value.witness.name,association:association(value.witness.checks),where:walk(value.where,nested)};
 }
 for(const checks of expressionChecks.get(normalized as object)!)association(checks);
 const expression=walk(input.expression,new Map()),entities=expressionEntities.get(normalized as object);return freeze({kind:entities===undefined?'candidate-association-expression-transport/0.1':'candidate-association-expression-transport/0.2',sourceExpression:copyJson(expressionSources.get(normalized as object)),associations,expression,...(entities===undefined?{}:{entities:readCandidateEntityTermScope(entities)})});
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
