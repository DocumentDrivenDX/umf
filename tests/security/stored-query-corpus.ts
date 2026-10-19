// SPDX-License-Identifier: MIT OR Apache-2.0
import {storedWriteFixture} from './catalog-write-fixture';
import {compileCandidateCatalogProgram} from '../../src/extensions/security/catalog-program-candidate';
import {inspectCandidateStoredQueryProperties} from '../../src/extensions/security/stored-query-candidate';
const ref=(elementId:string)=>({documentId:'domain',moduleId:'m',elementId});
export function storedQueryFixture(){const f=storedWriteFixture();f.catalog.transforms[0].determinism='keyed-deterministic';f.catalog.transforms[0].disclosureProfile=['equality'];f.catalog.transforms[0].queryUse={join:'disclosed',group:'disclosed',order:'disclosed',predicate:'disclosed',aggregate:'disclosed'};return f;}
export function runStoredQueryCorpus(){
 const rows:any[]=[];
 function run(id:string,change:(f:any)=>void,expected:string,operator='join',required=['equality'],ownerChange?:(o:any)=>void,useChange?:(u:any)=>void,copyHandle=false){
  const f=storedQueryFixture();change(f);const program=compileCandidateCatalogProgram(f.policy,f.catalog,f.closure,f.ontology),owner=structuredClone(f.owner),use:any={type:ref('Resource'),field:ref('token'),operator,required};ownerChange?.(owner);useChange?.(use);const before=JSON.stringify({owner,use});
  const result=inspectCandidateStoredQueryProperties(copyHandle?{...program as object}:program,owner,use),status=result.status==='selected'?result.report!.status:result.status;
  rows.push({id,expected,status,passed:status===expected&&JSON.stringify({owner,use})===before&&!result.complete&&!result.authority&&(!result.report||!result.report.complete&&!result.report.authority),result});
 }
 for(const operator of ['predicate','join','group','aggregate'])run(operator,()=>{},'compatible-properties',operator);
 run('missing-order',()=>{},'refused','order');
 run('omitted-mode',f=>{delete f.catalog.transforms[0].queryUse.join;},'prohibited');
 run('original-mode',f=>{f.catalog.transforms[0].queryUse.join='original-authorized';},'requires-original-action');
 run('implied-unauthored-equality',f=>{f.catalog.transforms[0].disclosureProfile=[];},'compatible-properties');
 for(const operator of ['join','group'])run('random-token-'+operator,f=>{f.catalog.transforms[0].determinism='random';},'refused',operator);
 run('read-policy-withheld',f=>{f.policy.rules[0].disclosure.push({field:ref('token'),disposition:{kind:'withheld'}});},'compatible-properties');
 run('copied-program',()=>{},'refused','join',['equality'],undefined,undefined,true);
 const invalidOwners:[string,(o:any)=>void][]=[
  ['incomplete-unselected',o=>o.storage.shift()],['duplicate',o=>o.storage.push(structuredClone(o.storage[0]))],
  ['canonical-downgrade',o=>{const x=o.storage.find((e:any)=>e.field.elementId==='token');x.storageEffect='canonical';delete x.storageTransform;}],
  ['wrong-storage-version',o=>{o.storage.find((e:any)=>e.field.elementId==='token').storageTransform.version='wrong';}],
  ['wrong-storage-output',o=>{const x=o.storage.find((e:any)=>e.field.elementId==='salary');x.storageEffect='stored-transformed';x.storageTransform={id:'vault',version:'1'};}],
  ['foreign-type',o=>{o.storage[0].type=ref('Other');}],['unknown-owner',o=>{o.authority=true;}],
  ['unknown-storage',o=>{o.storage[0].unknown=true;}],['read-action-purpose',o=>{o.disclosure={readAction:'vault-write'};}],
  ['too-many-storage',o=>{o.storage=Array.from({length:4097},()=>o.storage[0]);}]
 ];
 for(const [id,change] of invalidOwners)run(id,()=>{},'refused','join',['equality'],change);
 for(const [id,change] of [
  ['input-not-output',(u:any)=>{u.field=ref('clear');}],['canonical-field',(u:any)=>{u.field=ref('salary');}],
  ['wrong-type',(u:any)=>{u.type=ref('Project');}],['action-substitution',(u:any)=>{u.originalAction='reverse';}],
  ['empty-dependencies',(u:any)=>{u.required=[];}],['unknown-property',(u:any)=>{u.required=['future'];}],
  ['unknown-operator',(u:any)=>{u.operator='future';}],['too-many-dependencies',(u:any)=>{u.required=Array(33).fill('equality');}]
 ] as [string,(u:any)=>void][])run(id,()=>{},'refused','join',['equality'],undefined,change);
 return rows;
}
