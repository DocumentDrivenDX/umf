// SPDX-License-Identifier: MIT OR Apache-2.0
/** Private draft normalization. No public ontology version, fact authority,
 * policy admission or runtime permission is established by these plans. */
import {copyJson} from '../../model/json';
import {readCandidateCoreSource} from './core-source-candidate';
import {validateCandidateRelationshipAssociation,resolveCandidateRelationshipTerm as resolveNativeRelationshipTerm,candidateWitnessTermCapability} from '#security-candidate-condition';
import type {SecurityRef} from './types';
type RelationshipRef={documentId:string;moduleId:string;relationshipId:string};
export interface CandidateRelationshipPlan {
 readonly kind:'candidate-relationship-semantics/0.1';
 readonly relationship:RelationshipRef;
 readonly sourceRelationship:unknown;
 readonly witness:{kind:'opaque-existential'}|{kind:'record-key';type:SecurityRef;key:unknown;sourceRecord:unknown;attributes:SecurityRef[]};
 readonly endpoints:readonly {role:string;side:'source'|'target';target:SecurityRef;key:unknown}[];
}
const issued=new WeakSet<object>();
const nativeClassifications=new WeakMap<object,unknown>();
const nativeInterpretations=new WeakMap<object,unknown>();
const fail=():never=>{throw Error('SECURITY_RELATIONSHIP_CANDIDATE_UNSUPPORTED');};
function freeze(value:any):any{if(value&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;}
/** Inputs are snapshotted JSON. Full core/source validation and identity custody
 * remain caller obligations. Only the selected directed singular relationship
 * and original Record Key/member correspondence are normalized here. */
export function resolveCandidateRelationship(selector:unknown,document:unknown,entities:unknown,interpretation?:unknown,classifications?:unknown,core?:unknown):CandidateRelationshipPlan {
 const packet:any=copyJson(selector),model:any=readCandidateCoreSource(document),identities:any=copyJson(entities);
 const receipt:any=validateCandidateRelationshipAssociation({selector:packet,ontology:{entities:identities},documents:[{document:model}],...(interpretation===undefined?{}:{interpretation}),...(classifications===undefined?{}:{classifications}),...(core===undefined?{}:{core})});
 const plan=freeze(receipt?.plan);if(!plan||plan.kind!=='candidate-relationship-semantics/0.1')fail();issued.add(plan);if(receipt.classifications!==undefined)nativeClassifications.set(plan,freeze(receipt.classifications));if(receipt.interpretedQualifier!==undefined)nativeInterpretations.set(plan,freeze(receipt.interpretedQualifier));return plan;
}
export function readCandidateRelationshipClassifications(plan:CandidateRelationshipPlan):unknown{if(!issued.has(plan))return fail();return nativeClassifications.get(plan);}
export function readCandidateRelationshipInterpretation(plan:CandidateRelationshipPlan):unknown{if(!issued.has(plan))return fail();return nativeInterpretations.get(plan);}
export type CandidateRelationshipTerm = {kind:'endpoint';role:string}|{kind:'identity'}|{kind:'attribute';field:SecurityRef};
export type CandidateResolvedRelationshipTerm =
 | {readonly kind:'entity-identity';readonly relationship:RelationshipRef;readonly role:string;readonly side:'source'|'target';readonly type:SecurityRef;readonly key:unknown}
 | {readonly kind:'record-identity';readonly relationship:RelationshipRef;readonly type:SecurityRef;readonly key:unknown}
 | {readonly kind:'record-attribute';readonly relationship:RelationshipRef;readonly type:SecurityRef;readonly field:SecurityRef};
/** Selected-term correspondence only. Field domains, classification, source-cut
 * custody and policy authorization must be checked separately before execution. */
export function resolveCandidateRelationshipTerm(plan:CandidateRelationshipPlan,input:CandidateRelationshipTerm):CandidateResolvedRelationshipTerm {
 if(!issued.has(plan))return fail();
 const result:any=resolveNativeRelationshipTerm({plan,term:copyJson(input)});if(!result||!['entity-identity','record-identity','record-attribute'].includes(result.kind))return fail();return freeze(result);
}
export function requireCandidateWitnessTerm(plan:CandidateRelationshipPlan,term:'exists'|'endpoint'|'identity'|'attribute'|'count'|'distinct'|'disclose'):void {
 if(!issued.has(plan))return fail();
 const allowed=candidateWitnessTermCapability({plan,term});
 if(allowed!==true)return fail();
}
