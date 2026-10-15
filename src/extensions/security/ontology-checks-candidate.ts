/** Whole draft ontology consistency. Authenticated revisions and policy admission remain host obligations. */
import {checkActionPurposeDeclarations} from './action-purpose-declarations';
import {copyJson} from '../../model/json';
import {createValidator} from '../../validation/schema';
import {captureCandidateCoreSource,readCandidateCoreSource} from './core-source-candidate';
import schema from '../../../spec/extensions/security-v0.2/ontology.schema.json';
import {checkCandidateRecordClassifications} from './association-candidate';
import {type CandidateAssociationChecks,resolveCandidateAssociationChecks} from './association-checks';
function close(value:any):any{if(Array.isArray(value))return value.map(close);if(value&&typeof value==='object'){const out:any=Object.fromEntries(Object.entries(value).map(([k,v])=>[k,close(v)]));if(out.properties)out.additionalProperties=false;return out;}return value;}
const check=createValidator().compile(close(schema));
const issuedOntologies=new WeakSet<object>();
export function requireIssuedCandidateSecurityOntology(value:unknown):void{if(!value||typeof value!=='object'||!issuedOntologies.has(value))throw Error('SECURITY_ONTOLOGY_CANDIDATE_UNISSUED');}
const fail=():never=>{throw Error('SECURITY_ONTOLOGY_CANDIDATE_UNRESOLVED');};
const id=(r:any)=>JSON.stringify([r.documentId,r.moduleId,r.elementId]);
function shape(v:any,keys:string[]):void{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))fail();}
function freeze(v:any):any{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
export function resolveCandidateSecurityOntology(input:unknown,documentsInput:unknown,extensionClosure?:unknown):{readonly kind:'candidate-security-ontology-checks/0.1';readonly ontology:unknown;readonly documents:unknown;readonly associations:readonly CandidateAssociationChecks[]}{
 const packet:any=copyJson({ontology:input,documents:documentsInput}),ontology=packet.ontology;if(!Boolean(check(ontology))||!Array.isArray(packet.documents)||packet.documents.length>256)fail();
 const pins=new Map<string,string>(),documents=new Map<string,any>(),sourceHandles=new Map<string,unknown>();
 for(const pin of ontology.documents){if(pins.has(pin.documentId))fail();pins.set(pin.documentId,pin.revision);}
 for(const entry of packet.documents){shape(entry,['revision','document']);const handle=captureCandidateCoreSource(entry.document,extensionClosure),document=readCandidateCoreSource(handle);if(documents.has(document.id)||pins.get(document.id)!==entry.revision)fail();entry.document=document;documents.set(document.id,document);sourceHandles.set(document.id,handle);}
 if(documents.size!==pins.size)fail();
 const entities=new Map<string,any>(),sourceFields=new Set<string>();
 for(const document of documents.values())for(const module of document.modules)for(const field of module.elements)if(field.kind==='field')sourceFields.add(id({documentId:document.id,moduleId:module.id,elementId:field.id}));
 for(const entity of ontology.entities){const token=id(entity.type);if(entities.has(token))fail();entities.set(token,entity);const document=documents.get(entity.type.documentId);if(!document)fail();const record=document.modules.find((m:any)=>m.id===entity.type.moduleId)?.elements.find((e:any)=>e.id===entity.type.elementId);if(record?.kind!=='record')fail();const keys=record.keys?.filter((k:any)=>k.id===entity.keyId);if(keys?.length!==1||!keys[0].fields?.length)fail();
  for(const member of keys[0].fields){const field=document.modules.find((m:any)=>m.id===member.module)?.elements.find((e:any)=>e.id===member.element);if(field?.kind!=='field'||!['boolean','string','integer','decimal','binary'].includes(field.scalarType)||field.cardinality!=='one'||field.nullability!=='required'||field.references?.some((r:any)=>r.role==='record-type')||Object.keys(field.extensions??{}).length)fail();if(field.scalarType==='decimal'&&(!Number.isSafeInteger(field.facets?.precision)||!Number.isSafeInteger(field.facets?.scale)))fail();}
  checkCandidateRecordClassifications(sourceHandles.get(entity.type.documentId),[entity.type],[{type:entity.type,fields:entity.fields}]);
 }
 if(!entities.has(id(ontology.subject)))fail();const contexts=new Set<string>();for(const context of ontology.context){const token=id(context);if(contexts.has(token)||!sourceFields.has(token))fail();contexts.add(token);}
 if(new Set(ontology.actions).size!==ontology.actions.length)fail();checkActionPurposeDeclarations(ontology);
 const associations:any[]=[],seen=new Set<string>();
 for(const selector of ontology.associations){const graph=selector.kind==='core-relationship',ref=graph?selector.relationship:selector.type,token=JSON.stringify([graph?'relationship':'record',ref.documentId,ref.moduleId,graph?ref.relationshipId:ref.elementId]);if(seen.has(token))fail();seen.add(token);
  const witness=graph?selector.witness:selector.kind==='record-members'?{kind:'record-key',type:selector.type,keyId:selector.keyId}:undefined;if(!witness)fail();if(witness.kind==='record-key'&&entities.get(id(witness.type))?.keyId!==witness.keyId)fail();
  const scope=new Set<string>(selector.endpoints.map((e:any)=>id(e.target)));if(witness.kind==='record-key')scope.add(id(witness.type));for(const record of scope)if(!entities.has(record))fail();const declarations=[...scope].map(token=>{const entity=entities.get(token);return {type:entity.type,fields:entity.fields};});
  associations.push(resolveCandidateAssociationChecks(selector,sourceHandles.get(ref.documentId),ontology.entities.map((e:any)=>({type:e.type,keyId:e.keyId})),declarations));
 }
 const result=freeze({kind:'candidate-security-ontology-checks/0.1',ontology:packet.ontology,documents:packet.documents,associations});issuedOntologies.add(result);return result;
}
