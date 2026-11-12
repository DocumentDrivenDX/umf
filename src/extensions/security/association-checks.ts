// SPDX-License-Identifier: MIT OR Apache-2.0
/** Private composition of core validity and selected association checks.
 * No public ontology migration, policy typing or runtime permission is issued. */
import {copyJson} from '../../model/json';
import {validateDocument} from '../../validation/document';
import {readCandidateCoreSource,isIssuedCandidateCoreSource} from './core-source-candidate';
import {resolveCandidateRecordAssociation,requireCandidateEndpointDomainCorrespondence,requireCandidateAssociationClassifications,checkCandidateRecordClassifications,type CandidateRecordAssociationPlan} from './association-candidate';
const issuedChecks=new WeakSet<object>(),checkedSources=new WeakMap<object,unknown>();
function issued<T extends object>(result:T,source:unknown):T{Object.freeze(result);issuedChecks.add(result);checkedSources.set(result,source);return result;}
export function readCandidateAssociationSource(result:CandidateAssociationChecks):unknown {requireIssuedCandidateAssociationChecks(result);return copyJson(checkedSources.get(result));}
/** Private readonly reference for the shared compiler; public transport keeps detached copies. */
export function readCandidateAssociationSourceReference(result:CandidateAssociationChecks):unknown {requireIssuedCandidateAssociationChecks(result);const freeze=(v:any):any=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};return freeze(checkedSources.get(result));}
export function requireIssuedCandidateAssociationChecks(result:CandidateAssociationChecks):void {if(!issuedChecks.has(result))throw Error('SECURITY_ASSOCIATION_CHECKS_UNISSUED');}
export interface CandidateRecordAssociationChecks {
 readonly kind:'candidate-record-association-checks/0.1';
 readonly plan:CandidateRecordAssociationPlan;
 readonly classifications:unknown;
}
export function resolveCandidateRecordAssociationChecks(selector:unknown,document:unknown,entities:unknown,classifications:unknown):CandidateRecordAssociationChecks {
 // Snapshot the whole input packet before validation or selection. The semantic
 // components will make their own bounded copies of this same captured content.
 const shared=isIssuedCandidateCoreSource(document),packet:any=copyJson({selector,...(!shared?{document}:{}),entities,classifications});if(shared)packet.document=readCandidateCoreSource(document);
 const core=shared?{valid:true,complete:true,diagnostics:[]}:validateDocument(packet.document);
 if(!core.valid||!core.complete)throw Error('SECURITY_ASSOCIATION_CORE_UNRESOLVED');
 const plan=resolveCandidateRecordAssociation(packet.selector,shared?document:packet.document,packet.entities,packet.classifications);
 requireCandidateEndpointDomainCorrespondence(plan);
 const retained=requireCandidateAssociationClassifications(plan,packet.classifications);
 return issued({kind:'candidate-record-association-checks/0.1' as const,plan,classifications:retained},packet.document);
}

import {resolveCandidateRelationship,readCandidateRelationshipClassifications,readCandidateRelationshipInterpretation,type CandidateRelationshipPlan} from './relationship-candidate';
export interface CandidateGraphRelationshipChecks {
 readonly kind:'candidate-graph-relationship-checks/0.1';
 readonly plan:CandidateRelationshipPlan;readonly classifications:unknown;
 readonly interpretedQualifier?:{readonly profile:'association-record-key-agreement/0.1';readonly path:string;readonly keyId:string};
}
/** Core validity and classification around side-backed graph correspondence.
 * No Record member is invented to represent a native Relationship endpoint. */
export function resolveCandidateGraphRelationshipChecks(selector:unknown,document:unknown,entities:unknown,classifications:unknown,interpretation?:{profile:'association-record-key-agreement/0.1'}):CandidateGraphRelationshipChecks {
 const shared=isIssuedCandidateCoreSource(document),packet:any=copyJson({selector,...(!shared?{document}:{}),entities,classifications,...(interpretation===undefined?{}:{interpretation})});if(shared)packet.document=readCandidateCoreSource(document);
 const core=shared?{valid:true,complete:true,diagnostics:[]}:validateDocument(packet.document);
 if(!core.valid)throw Error('SECURITY_ASSOCIATION_CORE_UNRESOLVED');
 if(Object.hasOwn(packet,'interpretation')&&(!packet.interpretation||typeof packet.interpretation!=='object'||Array.isArray(packet.interpretation)||Object.keys(packet.interpretation).length!==1||packet.interpretation.profile!=='association-record-key-agreement/0.1'))throw Error('SECURITY_ASSOCIATION_INTERPRETATION_UNSUPPORTED');
 const plan=resolveCandidateRelationship(packet.selector,shared?document:packet.document,packet.entities,packet.interpretation,packet.classifications,core);
 const interpretedQualifier=readCandidateRelationshipInterpretation(plan) as CandidateGraphRelationshipChecks['interpretedQualifier'];
 const scope=plan.endpoints.map(e=>e.target);
 if(plan.witness.kind==='record-key')scope.push(plan.witness.type);
 const retained=readCandidateRelationshipClassifications(plan)??checkCandidateRecordClassifications(shared?document:packet.document,scope,packet.classifications);
 return issued({kind:'candidate-graph-relationship-checks/0.1' as const,plan,classifications:retained,...(interpretedQualifier?{interpretedQualifier}:{})},packet.document);
}

export type CandidateAssociationChecks=CandidateRecordAssociationChecks|CandidateGraphRelationshipChecks;
/** Shared draft entrypoint, retaining each source's endpoint representation.
 * This result is still not a public policy/compiler admission token. */
export function resolveCandidateAssociationChecks(selector:unknown,document:unknown,entities:unknown,classifications:unknown,interpretation?:{profile:'association-record-key-agreement/0.1'}):CandidateAssociationChecks {
 const shared=isIssuedCandidateCoreSource(document),packet:any=copyJson({selector,...(!shared?{document}:{}),entities,classifications,...(interpretation===undefined?{}:{interpretation})});if(shared)packet.document=readCandidateCoreSource(document);
 if(!packet.selector||typeof packet.selector!=='object'||Array.isArray(packet.selector))throw Error('SECURITY_ASSOCIATION_SELECTOR_UNSUPPORTED');
 if(packet.selector.kind==='record-members'){
  if(Object.hasOwn(packet,'interpretation'))throw Error('SECURITY_ASSOCIATION_INTERPRETATION_UNSUPPORTED');
  return resolveCandidateRecordAssociationChecks(packet.selector,shared?document:packet.document,packet.entities,packet.classifications);
 }
 if(packet.selector.kind==='core-relationship')return resolveCandidateGraphRelationshipChecks(packet.selector,shared?document:packet.document,packet.entities,packet.classifications,packet.interpretation);
 throw Error('SECURITY_ASSOCIATION_SELECTOR_UNSUPPORTED');
}
