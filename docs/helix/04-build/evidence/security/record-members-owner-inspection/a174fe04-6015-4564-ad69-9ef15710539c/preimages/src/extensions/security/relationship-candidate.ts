/** Private draft normalization. No public ontology version, fact authority,
 * policy admission or runtime permission is established by these plans. */
import {copyJson} from '../../model/json';
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
const fail=():never=>{throw Error('SECURITY_RELATIONSHIP_CANDIDATE_UNSUPPORTED');};
function shape(value:any,keys:string[]):void {if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))fail();}
function text(value:unknown):string{if(typeof value!=='string'||!value)return fail();let size=0;for(const character of value){if(++size>4096)return fail();}return value;}
function ref(value:any):void {shape(value,['documentId','moduleId','elementId']);for(const v of Object.values(value))text(v);}
const identity=(value:SecurityRef)=>JSON.stringify([value.documentId,value.moduleId,value.elementId]);
function freeze(value:any):any{if(value&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;}
/** Inputs are snapshotted JSON. Full core/source validation and identity custody
 * remain caller obligations. Only the selected directed singular relationship
 * and original Record Key/member correspondence are normalized here. */
export function resolveCandidateRelationship(selector:unknown,document:unknown,entities:unknown):CandidateRelationshipPlan {
 const packet:any=copyJson(selector),model:any=copyJson(document),identities:any=copyJson(entities);
 shape(packet,['kind','relationship','witness','endpoints']);if(packet.kind!=='core-relationship')fail();
 shape(packet.relationship,['documentId','moduleId','relationshipId']);for(const v of Object.values(packet.relationship))text(v);
 if(!['0.7.0','0.8.0'].includes(model.umf)||packet.relationship.documentId!==model.id||!Array.isArray(model.modules)||!Array.isArray(identities)||identities.length>256)fail();
 const chosen=new Map<string,string>();for(const e of identities){shape(e,['type','keyId']);ref(e.type);text(e.keyId);if(chosen.has(identity(e.type)))fail();chosen.set(identity(e.type),e.keyId);}
 const module=model.modules.filter((m:any)=>m.id===packet.relationship.moduleId);if(module.length!==1||!Array.isArray(module[0].relationships))fail();
 const relations=module[0].relationships.filter((r:any)=>r.id===packet.relationship.relationshipId);if(relations.length!==1)fail();const relation=relations[0];
 if(relation.directed!==true||!Array.isArray(relation.source)||relation.source.length!==1||!Array.isArray(relation.target)||relation.target.length!==1||!Array.isArray(packet.endpoints)||packet.endpoints.length!==2)fail();
 const key=(type:SecurityRef,keyId:string)=>{
  ref(type);text(keyId);if(type.documentId!==model.id)fail();
  const modules=model.modules.filter((m:any)=>m.id===type.moduleId);if(modules.length!==1||!Array.isArray(modules[0].elements))fail();
  const records=modules[0].elements.filter((r:any)=>r.id===type.elementId);if(records.length!==1)fail();const record=records[0];
  if(record.kind!=='record'||!Array.isArray(record.keys)||!Array.isArray(record.members))fail();
  const keys=record.keys.filter((k:any)=>k.id===keyId);if(keys.length!==1)fail();const selected=keys[0];
  if(Object.keys(selected).some(k=>!['id','name','fields','primary'].includes(k))||('primary'in selected&&typeof selected.primary!=='boolean')||!Array.isArray(selected.fields)||!selected.fields.length)fail();
  const fields=new Set<string>();for(const field of selected.fields){shape(field,['module','element']);const token=JSON.stringify([field.module,field.element]);if(fields.has(token)||!record.members.some((m:any)=>m.module===field.module&&m.element===field.element))fail();fields.add(token);}
  return {record,selected};
 };
 const roles=new Set<string>(),sides=new Set<string>();
 const endpoints=packet.endpoints.map((e:any)=>{
  shape(e,['role','side','target','keyId']);ref(e.target);text(e.role);if(roles.has(e.role)||!['source','target'].includes(e.side)||sides.has(e.side))fail();roles.add(e.role);sides.add(e.side);
  const native=relation[e.side][0];if(e.target.documentId!==model.id||e.target.moduleId!==native.module||e.target.elementId!==native.element||(native.key!==undefined&&native.key!==e.keyId)||chosen.get(identity(e.target))!==e.keyId)fail();
  return {...e,key:key(e.target,e.keyId).selected,keyId:undefined};
 }).map(({keyId,...e}:any)=>e);
 let witness:CandidateRelationshipPlan['witness'];
 if(packet.witness.kind==='opaque-existential'){shape(packet.witness,['kind']);if(relation.associationRecord!==undefined)fail();witness={kind:'opaque-existential'};}
 else{
  shape(packet.witness,['kind','type','keyId']);if(packet.witness.kind!=='record-key')fail();ref(packet.witness.type);
  const a=relation.associationRecord;if(!a||packet.witness.type.documentId!==model.id||packet.witness.type.moduleId!==a.module||packet.witness.type.elementId!==a.element||(a.key!==undefined&&a.key!==packet.witness.keyId))fail();
  const {record,selected}=key(packet.witness.type,packet.witness.keyId);
  witness={kind:'record-key',type:packet.witness.type,key:selected,sourceRecord:record,attributes:record.members.map((m:any)=>({documentId:model.id,moduleId:m.module,elementId:m.element}))};
 }
 const result=freeze({kind:'candidate-relationship-semantics/0.1',relationship:packet.relationship,sourceRelationship:relation,witness,endpoints});issued.add(result);return result;
}
/** A term capability is not authorization. Counts/disclosure are not supported
 * by this draft, even for Record-backed witnesses. */
export function requireCandidateWitnessTerm(plan:CandidateRelationshipPlan,term:'exists'|'endpoint'|'identity'|'attribute'|'count'|'distinct'|'disclose'):void {
 if(!issued.has(plan))return fail();
 if(term==='exists'||term==='endpoint')return;
 if(plan.witness.kind==='record-key'&&(term==='identity'||term==='attribute'))return;
 return fail();
}

export type CandidateRelationshipTerm = {kind:'endpoint';role:string}|{kind:'identity'}|{kind:'attribute';field:SecurityRef};
export type CandidateResolvedRelationshipTerm =
 | {readonly kind:'entity-identity';readonly relationship:RelationshipRef;readonly role:string;readonly side:'source'|'target';readonly type:SecurityRef;readonly key:unknown}
 | {readonly kind:'record-identity';readonly relationship:RelationshipRef;readonly type:SecurityRef;readonly key:unknown}
 | {readonly kind:'record-attribute';readonly relationship:RelationshipRef;readonly type:SecurityRef;readonly field:SecurityRef};
/** Selected-term correspondence only. Field domains, classification, source-cut
 * custody and policy authorization must be checked separately before execution. */
export function resolveCandidateRelationshipTerm(plan:CandidateRelationshipPlan,input:CandidateRelationshipTerm):CandidateResolvedRelationshipTerm {
 if(!issued.has(plan))return fail();
 const term:any=copyJson(input);
 if(term.kind==='endpoint'){
  shape(term,['kind','role']);text(term.role);
  const endpoint=plan.endpoints.find(e=>e.role===term.role);if(!endpoint)return fail();
  return freeze({kind:'entity-identity',relationship:plan.relationship,role:endpoint.role,side:endpoint.side,type:endpoint.target,key:endpoint.key});
 }
 if(term.kind==='identity'){
  shape(term,['kind']);requireCandidateWitnessTerm(plan,'identity');
  if(plan.witness.kind!=='record-key')return fail();
  return freeze({kind:'record-identity',relationship:plan.relationship,type:plan.witness.type,key:plan.witness.key});
 }
 if(term.kind==='attribute'){
  shape(term,['kind','field']);ref(term.field);requireCandidateWitnessTerm(plan,'attribute');
  if(plan.witness.kind!=='record-key'||!plan.witness.attributes.some(f=>identity(f)===identity(term.field)))return fail();
  return freeze({kind:'record-attribute',relationship:plan.relationship,type:plan.witness.type,field:term.field});
 }
 return fail();
}
