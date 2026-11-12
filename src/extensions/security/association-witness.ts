// SPDX-License-Identifier: MIT OR Apache-2.0
/** Private lexical witness custody for policy normalization, not runtime facts. */
import {copyJson} from '../../model/json';
import {requireIssuedCandidateAssociationChecks,type CandidateAssociationChecks} from './association-checks';
import {resolveCandidateRelationshipTerm,type CandidateRelationshipTerm} from './relationship-candidate';
import {resolveCandidateRelationshipTerm as resolveNativeWitnessTerm} from '#security-candidate-condition';
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
 if(!witnesses.has(witness))return fail();
 const checks=witness.checks;
 const term=checks.kind==='candidate-graph-relationship-checks/0.1'
  ?resolveCandidateRelationshipTerm(checks.plan,input)
  :resolveNativeWitnessTerm({plan:checks.plan,term:copyJson(input)});
 return Object.freeze({witness,term:freeze(term)});
}

function freeze<T>(value:T):T{
 if(value&&typeof value==='object'&&!Object.isFrozen(value)){
  Object.values(value).forEach(freeze);
  Object.freeze(value);
 }
 return value;
}

/** Resolve through the active lexical scope, rather than accepting an arbitrary
 * issued witness handle from another branch. This is the policy-typer surface. */
export function resolveCandidateAssociationScopeTerm(active:CandidateAssociationScope,name:string,input:CandidateRelationshipTerm):{readonly witness:CandidateAssociationWitness;readonly term:unknown}{
 const names=scopes.get(active);if(!names||typeof name!=='string')return fail();const witness=names.get(name);if(!witness)return fail();
 return resolveCandidateAssociationWitnessTerm(witness,input);
}
