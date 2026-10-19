// SPDX-License-Identifier: MIT OR Apache-2.0
/** Current source-owner correspondence, independent of compiler/native authority. */
import fixture from './current-query-source.json';
import {validateDocument} from '../../../src/validation/document';
import {compileCandidateCatalogProgram} from '../../../src/extensions/security/catalog-program-candidate';
import {inspectCandidateStoredQueryProperties} from '../../../src/extensions/security/stored-query-candidate';
const clone=()=>structuredClone(fixture) as any;
const ref=(elementId:string)=>({documentId:'domain',moduleId:'m',elementId});
export function runCurrentQuerySourceCorpus(){
 const rows:{id:string;passed:boolean;observed:unknown}[]=[];
 const record=(id:string,expected:unknown,observed:unknown)=>rows.push({id,passed:JSON.stringify(expected)===JSON.stringify(observed),observed});
 const f=clone(),before=JSON.stringify(f),document=f.closure.documents[0].document;
 record('core0.8-valid',true,validateDocument(document).valid);
 record('explicit-queryable-element-names',true,document.modules.every((m:any)=>m.elements.every((e:any)=>typeof e.name==='string'&&e.name.length>0)));
 const handle=compileCandidateCatalogProgram(f.policy,f.catalog,f.closure,f.ontology);
 for(const query of f.queries)for(const expected of query.expectedStoredUses){
  const result=inspectCandidateStoredQueryProperties(handle,f.owner,{type:ref('Resource'),field:ref(expected.field),operator:expected.operator,required:expected.required});
  record(query.id+':'+expected.path,['selected',expected.status,false,false], [result.status,result.report?.status,result.complete,result.authority]);
 }
 record('source-inputs-unchanged',before,JSON.stringify(f));
 for(const [id,change] of [
  ['stale-core-pin',(x:any)=>{x.closure.pins[0].revision='stale';}],
  ['stale-core-document',(x:any)=>{x.closure.documents[0].revision='stale';}],
  ['stale-ontology',(x:any)=>{x.ontology.revision='stale';}],
  ['stale-catalog',(x:any)=>{x.catalog.revision='stale';}],
  ['legacy-policy-substitution',(x:any)=>{x.policy.version='0.1.0';}],
  ['missing-live-token-member',(x:any)=>{const r=x.closure.documents[0].document.modules[0].elements.find((e:any)=>e.id==='Resource');r.members=r.members.filter((m:any)=>m.element!=='token');}],
 ] as [string,(x:any)=>void][]){const x=clone();change(x);let refused=false;try{compileCandidateCatalogProgram(x.policy,x.catalog,x.closure,x.ontology);}catch{refused=true;}record(id,true,refused);}
 for(const [id,change] of [
  ['wrong-storage-transform-version',(x:any)=>{x.owner.storage.at(-1).storageTransform.version='stale';}],
  ['missing-unselected-storage',(x:any)=>{x.owner.storage.shift();}],
  ['canonical-token-downgrade',(x:any)=>{const s=x.owner.storage.at(-1);s.storageEffect='canonical';delete s.storageTransform;}],
  ['random-token-equality',(x:any)=>{x.catalog.transforms[0].determinism='random';}],
 ] as [string,(x:any)=>void][]){const x=clone();change(x);const p=compileCandidateCatalogProgram(x.policy,x.catalog,x.closure,x.ontology),result=inspectCandidateStoredQueryProperties(p,x.owner,{type:ref('Resource'),field:ref('token'),operator:'join',required:['equality']});record(id,'refused',result.status==='selected'?result.report?.status:result.status);}
 {const x=clone();x.catalog.transforms[0].queryUse.join='original-authorized';const p=compileCandidateCatalogProgram(x.policy,x.catalog,x.closure,x.ontology),r=inspectCandidateStoredQueryProperties(p,x.owner,{type:ref('Resource'),field:ref('token'),operator:'join',required:['equality']});record('original-mode-still-needs-action','requires-original-action',r.report?.status);}
 return rows;
}
