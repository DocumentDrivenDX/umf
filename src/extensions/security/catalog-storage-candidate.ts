// SPDX-License-Identifier: MIT OR Apache-2.0
/** Private native validation over detached issued-program/owner sources. No authority. */
import {validateCandidateCatalogStorage as validateNative} from '#security-candidate-condition';
const id=(r:any)=>JSON.stringify([r.documentId,r.moduleId,r.elementId]);

/** Rust validates membership, completeness, custody, and read-purpose semantics.
 * The host replays the exact successful operation-ledger charges and builds its Map. */
export function validateCandidateCatalogStorage(program:any,owner:any,step:(units?:number)=>void,maxSteps:number):Map<string,any> {
 const source=program.ontology.ontology;
 const ontology={
  entities:source.entities.map((entity:any)=>({type:entity.type,fields:entity.fields.map((field:any)=>({ref:field.ref}))})),
  actionPurposes:source.actionPurposes??[],
 };
 const transforms=(program.catalog?.transforms??[]).map((transform:any)=>({
  id:transform.id,version:transform.version,kind:transform.kind,outputDomain:transform.outputDomain,
  ...(transform.custody?.storageEffect===undefined?{}:{custody:{storageEffect:transform.custody.storageEffect}}),
 }));
 const dto={ontology:{ontology},catalog:{transforms}};
 const result:any=validateNative(dto,owner,maxSteps);
 if(!Number.isSafeInteger(result.steps)||result.steps<0||!Array.isArray(result.storage))throw new Error('SECURITY_CATALOG_STORAGE: Invalid native result');
 step(result.steps);
 return new Map(result.storage.map((entry:any)=>[JSON.stringify([id(entry.type),id(entry.field)]),entry]));
}
