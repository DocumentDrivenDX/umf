/** Private lexical witness custody for policy normalization, not runtime facts. */
import {copyJson} from '../../model/json';
import {requireIssuedCandidateAssociationChecks,type CandidateAssociationChecks} from './association-checks';
import {resolveCandidateRelationshipTerm,type CandidateRelationshipTerm} from './relationship-candidate';
export interface CandidateAssociationScope {readonly kind:'candidate-association-scope/0.1'}
export interface CandidateAssociationWitness {readonly name:string;readonly checks:CandidateAssociationChecks}
const scopes=new WeakMap<object,ReadonlyMap<string,CandidateAssociationWitness>>(),witnesses=new WeakSet<object>();
const fail=():never=>{throw Error('SECURITY_ASSOCIATION_WITNESS_UNSUPPORTED');};
function scope(names:ReadonlyMap<string,CandidateAssociationWitness>):CandidateAssociationScope{const s=Object.freeze({kind:'candidate-association-scope/0.1' as const});scopes.set(s,names);return s;}
export function createCandidateAssociationScope():CandidateAssociationScope{return scope(new Map());}
export function bindCandidateAssociationWitness(parent:CandidateAssociationScope,checks:CandidateAssociationChecks,name:string):{readonly scope:CandidateAssociationScope;readonly witness:CandidateAssociationWitness}{
 const names=scopes.get(parent);if(!names)return fail();requireIssuedCandidateAssociationChecks(checks);
 if(typeof name!=='string'||!name)return fail();let n=0;for(const c of name)if(++n>4096)fail();if(names.has(name))fail();
 const witness=Object.freeze({name,checks});witnesses.add(witness);const next=new Map(names);next.set(name,witness);
 return Object.freeze({scope:scope(next),witness});
}
/** The witness reference is retained on every selected term. Sibling bindings
 * remain distinct even when their display names and checked plans are equal. */
export function resolveCandidateAssociationWitnessTerm(witness:CandidateAssociationWitness,input:CandidateRelationshipTerm):{readonly witness:CandidateAssociationWitness;readonly term:unknown}{
 if(!witnesses.has(witness))return fail();const term:any=copyJson(input),checks=witness.checks;
 if(checks.kind==='candidate-graph-relationship-checks/0.1')return Object.freeze({witness,term:resolveCandidateRelationshipTerm(checks.plan,term)});
 const plan=checks.plan;let selected:unknown;
 if(term.kind==='endpoint'){
  if(Object.keys(term).length!==2||typeof term.role!=='string')return fail();const endpoint=plan.endpoints.find(e=>e.role===term.role);if(!endpoint)return fail();
  selected=Object.freeze({kind:'entity-identity',association:plan.type,role:endpoint.role,type:endpoint.target,key:endpoint.key,fields:endpoint.fields});
 }else if(term.kind==='identity'){
  if(Object.keys(term).length!==1)return fail();selected=Object.freeze({kind:'record-identity',type:plan.type,key:plan.key});
 }else if(term.kind==='attribute'){
  if(Object.keys(term).length!==2||!term.field||typeof term.field!=='object'||Array.isArray(term.field)||Object.keys(term.field).length!==3||!['documentId','moduleId','elementId'].every(k=>Object.hasOwn(term.field,k)&&typeof term.field[k]==='string'))return fail();
  if(term.field.documentId!==plan.type.documentId||!(plan.sourceRecord as any).members.some((r:any)=>r.module===term.field.moduleId&&r.element===term.field.elementId))return fail();
  selected=Object.freeze({kind:'record-attribute',type:plan.type,field:Object.freeze(term.field)});
 }else return fail();
 return Object.freeze({witness,term:selected});
}

/** Resolve through the active lexical scope, rather than accepting an arbitrary
 * issued witness handle from another branch. This is the policy-typer surface. */
export function resolveCandidateAssociationScopeTerm(active:CandidateAssociationScope,name:string,input:CandidateRelationshipTerm):{readonly witness:CandidateAssociationWitness;readonly term:unknown}{
 const names=scopes.get(active);if(!names||typeof name!=='string')return fail();const witness=names.get(name);if(!witness)return fail();
 return resolveCandidateAssociationWitnessTerm(witness,input);
}
