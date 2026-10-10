/** Intrinsic subject/resource/context typing, independent of association incidence.
 * Private candidate source checks; no identity authentication or enforcement authority.
 */
import {copyJson} from '../../model/json';
import {checkSchemaLiteral} from '../../model/schema-literals';
import {createValidator} from '../../validation/schema';
import documentSchema from '../../../spec/core/schema-properties-document.schema.json';
import {resolveCandidateSecurityOntology} from './ontology-checks-candidate';

const validator=createValidator();validator.addSchema(documentSchema);
const literalShape=validator.compile({$ref:documentSchema.$id+'#/$defs/literal'});
const scopes=new WeakMap<object,any>(),terms=new WeakMap<object,{scope:object;domain:string}>();
const fail=():never=>{throw Error('SECURITY_ENTITY_TERM_UNRESOLVED');};
const id=(r:any)=>JSON.stringify([r.documentId,r.moduleId,r.elementId]);
function shape(v:any,keys:string[]):void{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))fail();}
function ref(r:any):void{shape(r,['documentId','moduleId','elementId']);if(Object.values(r).some(v=>typeof v!=='string'||!v))fail();}
function canonical(v:any):string{return Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);}
function freeze(v:any):any{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
function scalar(field:any):any{
 if(field?.kind!=='field'||!['boolean','string','integer','decimal','binary'].includes(field.scalarType)||field.cardinality!=='one'||field.nullability!=='required'||field.references?.some((r:any)=>r.role==='record-type')||Object.keys(field.extensions??{}).length)fail();
 const facets=field.facets??{};if(field.scalarType==='decimal'&&(!Number.isSafeInteger(facets.precision)||!Number.isSafeInteger(facets.scale)))fail();
 return {scalarType:field.scalarType,cardinality:field.cardinality,nullability:field.nullability,facets,allowedValues:field.allowedValues??null};
}
export function createCandidateEntityTermScope(ontologyInput:unknown,documentsInput:unknown,targetInput:unknown):unknown{
 const checked=resolveCandidateSecurityOntology(ontologyInput,documentsInput),ontology:any=checked.ontology,target:any=copyJson(targetInput);ref(target);
 const entities=new Map<string,any>(ontology.entities.map((e:any)=>[id(e.type),e]));if(!entities.has(id(target)))fail();
 const documents=new Map<string,any>((checked.documents as any[]).map(d=>[d.document.id,d.document]));
 const fields=new Map<string,{document:any;field:any}>();
 for(const entity of ontology.entities){const document=documents.get(entity.type.documentId);for(const classified of entity.fields){const field=document.modules.find((m:any)=>m.id===classified.ref.moduleId).elements.find((f:any)=>f.id===classified.ref.elementId);fields.set(id(classified.ref),{document,field});}}
 const result=freeze({kind:'candidate-entity-term-scope/0.1',ontology:checked.ontology,documents:checked.documents,target});
 scopes.set(result,{ontology,entities,fields,target});return result;
}
/** Original captured source packet; copying it does not issue another scope. */
export function readCandidateEntityTermScope(scope:unknown):unknown{
 if(!scope||typeof scope!=='object'||!scopes.has(scope))return fail();return copyJson(scope);
}
export function resolveCandidateEntityTerm(scopeInput:unknown,termInput:unknown):unknown{
 if(!scopeInput||typeof scopeInput!=='object'||!scopes.has(scopeInput))return fail();
 const scope=scopes.get(scopeInput),value:any=copyJson(termInput);let descriptor:any,domain:string;
 if(value?.kind==='subject'||value?.kind==='resource'){
  const entity=scope.entities.get(id(value.kind==='subject'?scope.ontology.subject:scope.target));
  if(Object.hasOwn(value,'identity')){
   shape(value,['kind','identity']);if(value.identity!==true)fail();
   const document=scope.fields.get(id(entity.fields[0].ref)).document;
   const key=document.modules.find((m:any)=>m.id===entity.type.moduleId).elements.find((e:any)=>e.id===entity.type.elementId).keys.find((k:any)=>k.id===entity.keyId);
   const domains=key.fields.map((f:any)=>scalar(scope.fields.get(id({documentId:entity.type.documentId,moduleId:f.module,elementId:f.element})).field));
   descriptor={kind:'entity-identity',context:value.kind,type:entity.type,key};domain='identity:'+canonical({type:entity.type,keyId:key.id,domains});
  }else{
   shape(value,['kind','field']);ref(value.field);if(!entity.fields.some((f:any)=>id(f.ref)===id(value.field)))fail();
   descriptor={kind:'record-attribute',context:value.kind,type:entity.type,field:value.field};domain='scalar:'+canonical(scalar(scope.fields.get(id(value.field)).field));
  }
 }else if(value?.kind==='context'){
  shape(value,['kind','field']);ref(value.field);if(!scope.ontology.context.some((f:any)=>id(f)===id(value.field)))fail();
  descriptor={kind:'context-attribute',field:value.field};domain='scalar:'+canonical(scalar(scope.fields.get(id(value.field)).field));
 }else if(value?.kind==='constant'){
  shape(value,['kind','field','value']);ref(value.field);if(!literalShape(value.value))fail();const source=scope.fields.get(id(value.field));if(!source)fail();
  domain='scalar:'+canonical(scalar(source.field));checkSchemaLiteral(source.document,source.field,value.value);
  descriptor={kind:'constant',field:value.field,value:value.value};
 }else return fail();
 const result=freeze({kind:'candidate-entity-term/0.1',term:descriptor,domain});terms.set(result,{scope:scopeInput,domain});return result;
}
/** Equal domains alone cannot compose independently captured ontology/source cuts. */
export function candidateEntityTermsCompatible(left:unknown,right:unknown):boolean{
 if(!left||typeof left!=='object'||!right||typeof right!=='object')return fail();const l=terms.get(left),r=terms.get(right);if(!l||!r||l.scope!==r.scope)return fail();return l.domain===r.domain;
}
