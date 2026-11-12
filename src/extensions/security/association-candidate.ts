// SPDX-License-Identifier: MIT OR Apache-2.0
/** Private selected-source correspondence; no policy/domain/runtime admission. */
import {copyJson} from '../../model/json';
import {readCandidateCoreSource,isIssuedCandidateCoreSource} from './core-source-candidate';
import {resolveCandidateRecordAssociation as resolveNativeAssociation} from '#security-candidate-condition';
import type {SecurityRef} from './types';
const sources=new WeakMap<object,any>(),sourceHandles=new WeakMap<object,unknown>(),sourceClassifications=new WeakMap<object,unknown>(),nativeDomainChecks=new WeakSet<object>();
const fail=():never=>{throw Error('SECURITY_ASSOCIATION_CANDIDATE_UNSUPPORTED');};
const id=(r:SecurityRef)=>JSON.stringify([r.documentId,r.moduleId,r.elementId]);
function shape(v:any,keys:string[]){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))fail();}
function text(v:unknown){if(typeof v!=='string'||!v)return fail();let n=0;for(const c of v)if(++n>4096)fail();}
function ref(v:any){shape(v,['documentId','moduleId','elementId']);Object.values(v).forEach(text);}
function freeze(v:any):any{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
export interface CandidateRecordAssociationPlan {
 readonly kind:'candidate-record-association/0.1';
 readonly type:SecurityRef;readonly key:unknown;readonly sourceRecord:unknown;
 readonly endpoints:readonly {role:string;target:SecurityRef;key:unknown;fields:readonly SecurityRef[]}[];
}
export function resolveCandidateRecordAssociation(input:unknown,document:unknown,entities:unknown,classifications?:unknown):CandidateRecordAssociationPlan {
 const s:any=copyJson(input),d:any=readCandidateCoreSource(document),choices:any=copyJson(entities);
 const result:any=resolveNativeAssociation({selector:s,document:d,entities:choices,...(classifications===undefined?{}:{classifications})});const plan=freeze(result?.plan);if(!plan||plan.kind!=='candidate-record-association/0.1')return fail();if(result.classifications!==undefined)sourceClassifications.set(plan,freeze(result.classifications));
 sources.set(plan,d);nativeDomainChecks.add(plan);if(isIssuedCandidateCoreSource(document))sourceHandles.set(plan,document);return plan;
}

/** Exact selected-field equality-domain correspondence within the issuance
 * snapshot. Not full core validity, classification or authority admission. */
export function requireCandidateEndpointDomainCorrespondence(plan:CandidateRecordAssociationPlan):void {
 if(!sources.has(plan)||!nativeDomainChecks.has(plan))return fail();
}

/** Explicit classification coverage for every member of selected Records.
 * Retained query-use declarations are not compiler or runtime authorization. */
export function requireCandidateAssociationClassifications(plan:CandidateRecordAssociationPlan,input:unknown):unknown {
 const native=sourceClassifications.get(plan);if(native!==undefined)return native;
 const document=sources.get(plan);if(!document)return fail();
 return checkCandidateRecordClassifications(sourceHandles.get(plan)??document,[plan.type,...plan.endpoints.map(e=>e.target)],input);
}
/** Coverage utility over captured source content; caller must establish core validity. */
export function checkCandidateRecordClassifications(source:unknown,scope:unknown,input:unknown):unknown {
 const shared=isIssuedCandidateCoreSource(source),packet:any=copyJson({...(!shared?{source}:{}),scope,input}),document=shared?readCandidateCoreSource(source):packet.source,declarations=packet.input;
 if(!Array.isArray(packet.scope)||packet.scope.length>257)fail();packet.scope.forEach((r:any)=>{ref(r);if(r.documentId!==document.id)fail();});
 if(!Array.isArray(declarations)||declarations.length>257)return fail();
 const required=new Map<string,SecurityRef>(packet.scope.map((r:SecurityRef)=>[id(r),r])),seen=new Set<string>();
 for(const declaration of declarations){
  shape(declaration,['type','fields']);ref(declaration.type);const token=id(declaration.type);
  if(!required.has(token)||seen.has(token)||!Array.isArray(declaration.fields))fail();seen.add(token);
  const record=document.modules.find((m:any)=>m.id===declaration.type.moduleId).elements.find((e:any)=>e.id===declaration.type.elementId);
  const members=new Set<string>(record.members.map((r:any)=>id({documentId:document.id,moduleId:r.module,elementId:r.element}))),classified=new Set<string>();
  for(const field of declaration.fields){
   if(!field||typeof field!=='object'||Array.isArray(field)||Object.keys(field).some(k=>!['ref','protection','queryUse'].includes(k))||!Object.hasOwn(field,'ref')||!Object.hasOwn(field,'protection'))fail();
   ref(field.ref);const key=id(field.ref);if(!members.has(key)||classified.has(key)||!['protected','unprotected'].includes(field.protection))fail();classified.add(key);
   if(field.queryUse!==undefined){if(!field.queryUse||typeof field.queryUse!=='object'||Array.isArray(field.queryUse))fail();for(const [operator,use] of Object.entries(field.queryUse))if(!['predicate','order','group','join','aggregate'].includes(operator)||!['disclosed','original-authorized','prohibited'].includes(use as string))fail();}
  }
  if(classified.size!==members.size)fail();
 }
 if(seen.size!==required.size)fail();return freeze(declarations);
}
