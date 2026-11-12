// SPDX-License-Identifier: MIT OR Apache-2.0
/** Host custody for checked ontology and association sources. */
import {copyJson} from '../../model/json';
import {captureCandidateCoreSource,readCandidateCoreSource} from './core-source-candidate';
import {checkCandidateRecordClassifications} from './association-candidate';
import {type CandidateAssociationChecks,resolveCandidateAssociationChecks} from './association-checks';
import {prepareCandidateCatalogOntology,planCandidateCatalogOntology} from '#security-candidate-condition';

interface AssociationJob {
 readonly documentIndex:number;
 readonly scope:readonly number[];
}
const issuedOntologies=new WeakSet<object>();
export function requireIssuedCandidateSecurityOntology(value:unknown):void {
 if(!value||typeof value!=='object'||!issuedOntologies.has(value))throw Error('SECURITY_ONTOLOGY_CANDIDATE_UNISSUED');
}
function freeze<T>(value:T):T {
 if(value&&typeof value==='object'&&!Object.isFrozen(value)){
  Object.values(value).forEach(freeze);
  Object.freeze(value);
 }
 return value;
}
export function resolveCandidateSecurityOntology(
 input:unknown,documentsInput:unknown,extensionClosure?:unknown,
):{readonly kind:'candidate-security-ontology-checks/0.1';readonly ontology:unknown;readonly documents:unknown;readonly associations:readonly CandidateAssociationChecks[]} {
 const packet:any=copyJson({ontology:input,documents:documentsInput});
 const ontology=packet.ontology;
 prepareCandidateCatalogOntology(packet);
 const handles=packet.documents.map((entry:any)=>{
  const handle=captureCandidateCoreSource(entry.document,extensionClosure);
  entry.document=readCandidateCoreSource(handle);
  return handle;
 });
 const jobs=planCandidateCatalogOntology(packet) as readonly AssociationJob[];
 const handlesById=new Map(packet.documents.map((entry:any,index:number)=>[entry.document.id,handles[index]]));
 const entities=ontology.entities.map((entity:any)=>({type:entity.type,keyId:entity.keyId}));
 for(const entity of ontology.entities){
  checkCandidateRecordClassifications(handlesById.get(entity.type.documentId),[entity.type],[{type:entity.type,fields:entity.fields}]);
 }
 const associations=jobs.map(({documentIndex,scope},index)=>resolveCandidateAssociationChecks(
  ontology.associations[index],handles[documentIndex],entities,
  scope.map(position=>{
   const {type,fields}=ontology.entities[position];
   return {type,fields};
  }),
 ));
 const result=freeze({kind:'candidate-security-ontology-checks/0.1' as const,ontology,documents:packet.documents,associations});
 issuedOntologies.add(result);
 return result;
}
