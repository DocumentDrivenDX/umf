// SPDX-License-Identifier: MIT OR Apache-2.0
/** Independent atomic-preparation controls, not a compiler or native-authority oracle. */
import {catalogRuntimeFixture,graphRuntimeFixture} from './catalog-runtime-fixture';
import {compileCandidateCatalogProgram} from '../../src/extensions/security/catalog-program-candidate';
import {evaluateCandidateCatalogScan,evaluateCandidateCatalogScanBatch} from '../../src/extensions/security/catalog-runtime-candidate';
const ref=(elementId:string)=>({documentId:'domain',moduleId:'m',elementId});
function fixture(graph=false):any{const f:any=graph?graphRuntimeFixture():catalogRuntimeFixture();f.owner.revision='batch-owner-r1';f.owner.disclosure={readAction:'read'};f.cut.owner.revision=f.owner.revision;return f;}
const program=(f:any)=>compileCandidateCatalogProgram(f.policy,f.catalog,f.closure,f.ontology);
const scan=(name='s0',fields=[ref('salary')])=>({scan:name,type:ref('Resource'),fields});
const salary={field:ref('salary'),disposition:'original',value:{integerToken:'100'}};
export function runCatalogScanBatchCorpus(){
 const rows:{id:string;passed:boolean;expected:unknown;observed:unknown}[]=[];
 const check=(id:string,expected:unknown,observed:unknown)=>rows.push({id,passed:JSON.stringify(expected)===JSON.stringify(observed),expected,observed});
 const invoke=(f:any,requests:any=[scan(),scan('s1')],p:any=program(f))=>evaluateCandidateCatalogScanBatch(p,f.owner,f.cut,requests);
 const observe=(id:string,f:any,requests:any,expected:any)=>{const before=JSON.stringify({f,requests}),r=invoke(f,requests);check(id,{status:expected.status??'rendered',scans:expected.scans,complete:false,authority:false},{status:r.status,scans:r.scans.map(s=>({scan:s.scan,rows:s.rows})),complete:r.complete,authority:r.authority});check(id+':input-unchanged',true,before===JSON.stringify({f,requests}));};
 for(const graph of [false,true]){
  const prefix=graph?'graph':'flat';observe(prefix+':self-join-occurrences',fixture(graph),[scan(),scan('s1')],{scans:[{scan:'s0',rows:[[salary]]},{scan:'s1',rows:[[salary]]}]});
  observe(prefix+':field-free',fixture(graph),[scan('s0',[]),scan('t0',[])],{scans:[{scan:'s0',rows:[[]]},{scan:'t0',rows:[[]]}]});
  const denied=fixture(graph);denied.cut.facts.find((x:any)=>x.type.elementId==='Assignment').fields.find((x:any)=>x.field.elementId==='active').value={boolean:false};observe(prefix+':denial-filters-all',denied,[scan(),scan('s1')],{scans:[{scan:'s0',rows:[]},{scan:'s1',rows:[]}]});
 }
 observe('order-and-occurrence-labels',fixture(),[scan('s10',[]),scan('s2')],{scans:[{scan:'s10',rows:[[]]},{scan:'s2',rows:[[salary]]}]});
 {const f=fixture();f.policy.rules[0].disclosure=[];observe('late-missing-protected-disclosure',f,[scan('s0',[]),scan('s1')],{status:'refused',scans:[]});}
 for(const [id,requests] of [
  ['late-unknown-target',[scan(),{...scan('s1'),type:ref('missing')}]],
  ['late-duplicate-field',[scan(),scan('s1',[ref('salary'),ref('salary')])]],
  ['late-action-override',[scan(),{...scan('s1'),action:'update'}]],
  ['late-resource-subset',[scan(),{...scan('s1'),resources:[]}]],
  ['empty',[]],['duplicate-label',[scan(),scan()]],['invalid-label',[scan('caller')]],
  ['unknown-scan-member',[{...scan(),complete:true}]],['too-many',Array.from({length:257},(_,i)=>scan('s'+i,[]))],
 ] as [string,any][]){observe(id,fixture(),requests,{status:'refused',scans:[]});}
 {const f=fixture();f.cut.maxFacts=f.cut.facts.length+f.cut.graphs.length+1;const p=program(f);check('single-fact-budget-positive','rendered',evaluateCandidateCatalogScan(p,f.owner,f.cut,{type:ref('Resource'),fields:[ref('salary')]}).status);observe('cumulative-visit-budget',f,[scan(),scan('s1')],{status:'refused',scans:[]});}
 {const f=fixture(),p=program(f);let low=1,high=100000;while(low<high){const mid=Math.floor((low+high)/2);f.cut.maxSteps=mid;const r=evaluateCandidateCatalogScan(p,f.owner,f.cut,{type:ref('Resource'),fields:[ref('salary')]});if(r.status==='rendered')high=mid;else low=mid+1;}f.cut.maxSteps=low;
  check('reset-ledger-negative-control-each-single-passes',['rendered','rendered'],[0,1].map(()=>evaluateCandidateCatalogScan(p,f.owner,f.cut,{type:ref('Resource'),fields:[ref('salary')]}).status));observe('one-whole-operation-work-budget',f,[scan(),scan('s1')],{status:'refused',scans:[]});}
 {const f=fixture();const replace=(x:any):void=>{if(x&&typeof x==='object')for(const key of Object.keys(x)){if(x[key]==='alice')x[key]='a'.repeat(512);else replace(x[key]);}};replace(f.cut);f.cut.maxSteps=1000000;f.cut.maxFacts=10000;const p=program(f);check('large-literal-scope-single-positive','rendered',evaluateCandidateCatalogScan(p,f.owner,f.cut,{type:ref('Resource'),fields:[ref('salary')]}).status);observe('shared-literal-scope-budget',f,Array.from({length:64},(_,i)=>scan('s'+i)),{status:'refused',scans:[]});}
 {const f=fixture();f.owner.revision='r'.repeat(800000);f.cut.owner.revision=f.owner.revision;f.cut.maxSteps=1000000;f.cut.maxFacts=10000;const p=program(f);check('large-snapshot-single-positive','rendered',evaluateCandidateCatalogScan(p,f.owner,f.cut,{type:ref('Resource'),fields:[ref('salary')]}).status);observe('shared-snapshot-text-budget',f,[scan(),scan('s1')],{status:'refused',scans:[]});}
 {const f=fixture(),p=program(f),r=invoke(f,undefined,p);check('deeply-frozen',true,Object.isFrozen(r)&&Object.isFrozen(r.scans)&&r.scans.every(s=>Object.isFrozen(s)&&Object.isFrozen(s.rows)&&Object.isFrozen(s.rows[0])));check('forged-handle-refuses','refused',invoke(f,undefined,{}).status);check('copied-handle-refuses','refused',invoke(f,undefined,structuredClone(p)).status);}
 {const f=fixture(),requests:any=[scan(),scan('s1')];let calls=0;Object.defineProperty(requests[1],'fields',{enumerable:true,get(){calls++;return [];}});check('accessor-refuses','refused',invoke(f,requests).status);check('getter-not-invoked',0,calls);}
 {const f=fixture(),requests=[scan(),scan('s1')],r=invoke(f,requests);f.cut.facts.find((x:any)=>x.type.elementId==='Resource').fields.find((x:any)=>x.field.elementId==='salary').value={integerToken:'999'};requests[0]!.fields.length=0;check('detached-result',{integerToken:'100'},(r.scans[0]!.rows[0]![0] as any).value);}
 {const f=fixture();f.cut.facts=f.cut.facts.filter((x:any)=>!['Resource','Ownership'].includes(x.type.elementId));observe('empty-population-still-all-occurrences',f,[scan(),scan('s1')],{scans:[{scan:'s0',rows:[]},{scan:'s1',rows:[]}]});f.cut.coverage.find((x:any)=>x.type.elementId==='Assignment').fields=[];observe('empty-population-preflight',f,[scan(),scan('s1')],{status:'refused',scans:[]});}
 return rows;
}
