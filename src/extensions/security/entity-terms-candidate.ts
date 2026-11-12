// SPDX-License-Identifier: MIT OR Apache-2.0
/** Intrinsic subject/resource/context typing, independent of association incidence.
 * Private candidate source checks; no identity authentication or enforcement authority.
 */
import {copyJson} from '../../model/json';
import {ProtectionLiteralBudget} from './protection/literals';
import {resolveCandidateCatalogEntityTerm} from '#security-candidate-condition';
import {resolveCandidateSecurityOntology,requireIssuedCandidateSecurityOntology} from './ontology-checks-candidate';

const sourceIndexes=new WeakMap<object,any>(),scopes=new WeakMap<object,any>(),terms=new WeakMap<object,{scope:object;domain:string}>();
const fail=():never=>{throw Error('SECURITY_ENTITY_TERM_UNRESOLVED');};
const id=(r:any)=>JSON.stringify([r.documentId,r.moduleId,r.elementId]);
function shape(v:any,keys:string[]):void{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))fail();}
function ref(r:any):void{shape(r,['documentId','moduleId','elementId']);if(Object.values(r).some(v=>typeof v!=='string'||!v))fail();}
function freeze(v:any):any{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
export function createCandidateEntityTermScope(ontologyInput:unknown,documentsInput:unknown,targetInput:unknown,literalBudget=new ProtectionLiteralBudget()):unknown{
 return createCandidateEntityTermScopeFromChecks(resolveCandidateSecurityOntology(ontologyInput,documentsInput),targetInput,literalBudget);
}
/** Private shared-program path: the root must be the original issued immutable check. */
export function createCandidateEntityTermScopeFromChecks(checkedInput:unknown,targetInput:unknown,literalBudget=new ProtectionLiteralBudget()):unknown{
 requireIssuedCandidateSecurityOntology(checkedInput);const checked:any=checkedInput,ontology=checked.ontology,target:any=copyJson(targetInput);ref(target);
 let index=sourceIndexes.get(checked);if(!index){
  const entities=new Map<string,any>(ontology.entities.map((e:any)=>[id(e.type),e]));
  const documents=new Map<string,any>(checked.documents.map((d:any)=>[d.document.id,d.document]));
  const fields=new Map<string,{document:any;field:any}>();
  for(const document of documents.values())for(const module of document.modules)for(const field of module.elements)if(field.kind==='field')fields.set(id({documentId:document.id,moduleId:module.id,elementId:field.id}),{document,field});
  index={ontology,entities,documents,fields};sourceIndexes.set(checked,index);
 }
 if(!index.entities.has(id(target)))fail();
 const result=freeze({kind:'candidate-entity-term-scope/0.1',ontology,documents:checked.documents,target});
 scopes.set(result,{...index,target,checked,literalBudget});return result;
}
/** One compiler-owned literal budget across every target scope; callers cannot inject a checker. */
export function createCandidateEntityTermScopeSet(checkedInput:unknown):(target:unknown)=>unknown{
 requireIssuedCandidateSecurityOntology(checkedInput);const budget=new ProtectionLiteralBudget();
 return target=>createCandidateEntityTermScopeFromChecks(checkedInput,target,budget);
}
/** Private original source root; never reconstructed from scope metadata or JSON copies. */
export function readCandidateEntityTermScopeRoot(scope:unknown):unknown{
 if(!scope||typeof scope!=='object'||!scopes.has(scope))fail();return scopes.get(scope as object).checked;
}
/** Original captured source packet; copying it does not issue another scope. */
export function readCandidateEntityTermScope(scope:unknown):unknown{
 if(!scope||typeof scope!=='object'||!scopes.has(scope))return fail();return copyJson(scope);
}
export function resolveCandidateEntityTerm(scopeInput:unknown,termInput:unknown):unknown{
 if(!scopeInput||typeof scopeInput!=='object'||!scopes.has(scopeInput))return fail();
 const scope=scopes.get(scopeInput);
 const value:any=copyJson(termInput);
 const target=value?.kind==='subject'?scope.ontology.subject:scope.target;
 const entity=scope.entities.get(id(target));
 const selected=value?.field&&typeof value.field==='object'?scope.fields.get(id(value.field)):undefined;
 const identity=value?.identity===true;
 const result=freeze(resolveCandidateCatalogEntityTerm({
  term:value,entity:entity??null,field:selected?.field??null,
  document:identity?scope.documents.get(target.documentId)??null:null,
  context:value?.kind==='context'?scope.ontology.context:[],
 }) as {kind:'candidate-entity-term/0.1';term:{kind:string;value?:unknown};domain:string});
 if(result.term.kind==='constant')scope.literalBudget.check(selected.document,selected.field,result.term.value);
 terms.set(result,{scope:scopeInput,domain:result.domain});
 return result;
}
/** Equal domains alone cannot compose independently captured ontology/source cuts. */
export function candidateEntityTermsCompatible(left:unknown,right:unknown):boolean{
 if(!left||typeof left!=='object'||!right||typeof right!=='object')return fail();const l=terms.get(left),r=terms.get(right);if(!l||!r||l.scope!==r.scope)return fail();return l.domain===r.domain;
}
