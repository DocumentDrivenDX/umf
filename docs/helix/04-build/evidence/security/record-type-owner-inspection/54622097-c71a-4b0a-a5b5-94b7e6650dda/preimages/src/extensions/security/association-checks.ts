/** Private composition of core validity and selected association checks.
 * No public ontology migration, policy typing or runtime permission is issued. */
import {copyJson} from '../../model/json';
import {validateDocument} from '../../validation/document';
import {resolveCandidateRecordAssociation,requireCandidateEndpointDomainCorrespondence,requireCandidateAssociationClassifications,checkCandidateRecordClassifications,type CandidateRecordAssociationPlan} from './association-candidate';
const issuedChecks=new WeakSet<object>(),checkedSources=new WeakMap<object,unknown>();
function issued<T extends object>(result:T,source:unknown):T{Object.freeze(result);issuedChecks.add(result);checkedSources.set(result,source);return result;}
export function readCandidateAssociationSource(result:CandidateAssociationChecks):unknown {requireIssuedCandidateAssociationChecks(result);return copyJson(checkedSources.get(result));}
export function requireIssuedCandidateAssociationChecks(result:CandidateAssociationChecks):void {if(!issuedChecks.has(result))throw Error('SECURITY_ASSOCIATION_CHECKS_UNISSUED');}
export interface CandidateRecordAssociationChecks {
 readonly kind:'candidate-record-association-checks/0.1';
 readonly plan:CandidateRecordAssociationPlan;
 readonly classifications:unknown;
}
export function resolveCandidateRecordAssociationChecks(selector:unknown,document:unknown,entities:unknown,classifications:unknown):CandidateRecordAssociationChecks {
 // Snapshot the whole input packet before validation or selection. The semantic
 // components will make their own bounded copies of this same captured content.
 const packet:any=copyJson({selector,document,entities,classifications});
 const core=validateDocument(packet.document);
 if(!core.valid||!core.complete)throw Error('SECURITY_ASSOCIATION_CORE_UNRESOLVED');
 const plan=resolveCandidateRecordAssociation(packet.selector,packet.document,packet.entities);
 requireCandidateEndpointDomainCorrespondence(plan);
 const retained=requireCandidateAssociationClassifications(plan,packet.classifications);
 return issued({kind:'candidate-record-association-checks/0.1' as const,plan,classifications:retained},packet.document);
}

import {resolveCandidateRelationship,type CandidateRelationshipPlan} from './relationship-candidate';
export interface CandidateGraphRelationshipChecks {
 readonly kind:'candidate-graph-relationship-checks/0.1';
 readonly plan:CandidateRelationshipPlan;readonly classifications:unknown;
 readonly interpretedQualifier?:{readonly profile:'association-record-key-agreement/0.1';readonly path:string;readonly keyId:string};
}
/** Core validity and classification around side-backed graph correspondence.
 * No Record member is invented to represent a native Relationship endpoint. */
export function resolveCandidateGraphRelationshipChecks(selector:unknown,document:unknown,entities:unknown,classifications:unknown,interpretation?:{profile:'association-record-key-agreement/0.1'}):CandidateGraphRelationshipChecks {
 const packet:any=copyJson({selector,document,entities,classifications,...(interpretation===undefined?{}:{interpretation})});
 const core=validateDocument(packet.document);
 if(!core.valid)throw Error('SECURITY_ASSOCIATION_CORE_UNRESOLVED');
 if(Object.hasOwn(packet,'interpretation')&&(!packet.interpretation||typeof packet.interpretation!=='object'||Array.isArray(packet.interpretation)||Object.keys(packet.interpretation).length!==1||packet.interpretation.profile!=='association-record-key-agreement/0.1'))throw Error('SECURITY_ASSOCIATION_INTERPRETATION_UNSUPPORTED');
 const plan=resolveCandidateRelationship(packet.selector,packet.document,packet.entities);
 let interpretedQualifier:CandidateGraphRelationshipChecks['interpretedQualifier'];
 if(!core.complete){
  const mi=packet.document.modules.findIndex((m:any)=>m.id===plan.relationship.moduleId),ri=packet.document.modules[mi].relationships.findIndex((r:any)=>r.id===plan.relationship.relationshipId),path=`/modules/${mi}/relationships/${ri}/associationRecord/key`;
  if(!packet.interpretation||plan.witness.kind!=='record-key'||core.diagnostics.length!==1||core.diagnostics[0]?.code!=='UNKNOWN_RELATIONSHIP_QUALIFIER'||core.diagnostics[0]?.path!==path)throw Error('SECURITY_ASSOCIATION_CORE_UNRESOLVED');
  const keyId=(plan.witness.key as any).id;
  if((plan.sourceRelationship as any).associationRecord.key!==keyId)throw Error('SECURITY_ASSOCIATION_KEY_AGREEMENT');
  interpretedQualifier=Object.freeze({profile:'association-record-key-agreement/0.1',path,keyId});
 }
 const scope=plan.endpoints.map(e=>e.target);
 if(plan.witness.kind==='record-key')scope.push(plan.witness.type);
 const retained=checkCandidateRecordClassifications(packet.document,scope,packet.classifications);
 return issued({kind:'candidate-graph-relationship-checks/0.1' as const,plan,classifications:retained,...(interpretedQualifier?{interpretedQualifier}:{})},packet.document);
}

export type CandidateAssociationChecks=CandidateRecordAssociationChecks|CandidateGraphRelationshipChecks;
/** Shared draft entrypoint, retaining each source's endpoint representation.
 * This result is still not a public policy/compiler admission token. */
export function resolveCandidateAssociationChecks(selector:unknown,document:unknown,entities:unknown,classifications:unknown,interpretation?:{profile:'association-record-key-agreement/0.1'}):CandidateAssociationChecks {
 const packet:any=copyJson({selector,document,entities,classifications,...(interpretation===undefined?{}:{interpretation})});
 if(!packet.selector||typeof packet.selector!=='object'||Array.isArray(packet.selector))throw Error('SECURITY_ASSOCIATION_SELECTOR_UNSUPPORTED');
 if(packet.selector.kind==='record-members'){
  if(Object.hasOwn(packet,'interpretation'))throw Error('SECURITY_ASSOCIATION_INTERPRETATION_UNSUPPORTED');
  return resolveCandidateRecordAssociationChecks(packet.selector,packet.document,packet.entities,packet.classifications);
 }
 if(packet.selector.kind==='core-relationship')return resolveCandidateGraphRelationshipChecks(packet.selector,packet.document,packet.entities,packet.classifications,packet.interpretation);
 throw Error('SECURITY_ASSOCIATION_SELECTOR_UNSUPPORTED');
}
