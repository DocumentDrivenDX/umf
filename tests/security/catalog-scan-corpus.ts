// SPDX-License-Identifier: MIT OR Apache-2.0
/** Independent complete-population expectations; supplied logical facts, no native authority. */
import {catalogRuntimeFixture,graphRuntimeFixture} from './catalog-runtime-fixture';
import source from './protection/current-query-source.json';
import readScenarios from './protection/current-query-read-scenarios.json';
import {compileCandidateCatalogProgram} from '../../src/extensions/security/catalog-program-candidate';
import {evaluateCandidateCatalogScan,evaluateCandidateCatalogCollection} from '../../src/extensions/security/catalog-runtime-candidate';
const ref=(elementId:string)=>({documentId:'domain',moduleId:'m',elementId});
const original=(value:any)=>({field:ref('salary'),disposition:'original',value});
function fixture(graph=false){const f:any=graph?graphRuntimeFixture():catalogRuntimeFixture();f.owner.revision='scan-owner-r1';f.owner.disclosure={readAction:'read'};f.cut.owner.revision=f.owner.revision;return f;}
const program=(f:any)=>compileCandidateCatalogProgram(f.policy,f.catalog,f.closure,f.ontology);
const selected=(f:any)=>({type:ref('Resource'),fields:[ref('salary')]});
function second(f:any,owned=true){
 const row=structuredClone(f.cut.facts.find((r:any)=>r.type.elementId==='Resource'));row.key=[{string:'r2'}];row.fields.find((x:any)=>x.field.elementId==='resourceId').value={string:'r2'};row.fields.find((x:any)=>x.field.elementId==='salary').value={integerToken:'200'};f.cut.facts.push(row);
 if(owned){const owner=structuredClone(f.cut.facts.find((r:any)=>r.type.elementId==='Ownership'));owner.key=[{string:'o2'}];owner.fields.find((x:any)=>x.field.elementId==='ownerId').value={string:'o2'};owner.fields.find((x:any)=>x.field.elementId==='ownerResource').value={string:'r2'};f.cut.facts.push(owner);
 if(f.cut.graphs.length){const edge=structuredClone(f.cut.graphs.find((x:any)=>x.relationship.relationshipId==='OwnedBy'));edge.witness.key=[{string:'o2'}];edge.endpoints.find((x:any)=>x.role==='resource').key=[{string:'r2'}];f.cut.graphs.push(edge);}}
 return row;
}
function empty(f:any){f.cut.facts=f.cut.facts.filter((r:any)=>!['Resource','Ownership'].includes(r.type.elementId));f.cut.graphs=f.cut.graphs.filter((r:any)=>r.relationship.relationshipId!=='OwnedBy');}
function nullable(f:any){f.closure.documents[0].document.modules[0].elements.find((e:any)=>e.id==='salary').nullability='absent-allowed';}
export function runCatalogScanCorpus(){
 const rows:{id:string;passed:boolean;observed:unknown}[]=[];
 const record=(id:string,expected:unknown,observed:unknown)=>rows.push({id,passed:JSON.stringify(expected)===JSON.stringify(observed),observed});
 const result=(f:any,s:any=selected(f),p:any=program(f))=>evaluateCandidateCatalogScan(p,f.owner,f.cut,s);
 const observe=(id:string,f:any,expected:any,s:any=selected(f))=>{const before=JSON.stringify(f),r=result(f,s);record(id,{status:expected.status??'rendered',rows:expected.rows,complete:false,authority:false},{status:r.status,rows:r.rows,complete:r.complete,authority:r.authority});record(id+':inputs-unchanged',before,JSON.stringify(f));};
 for(const graph of [false,true]){
  const prefix=graph?'graph':'flat';observe(prefix+':membership',fixture(graph),{rows:[[original({integerToken:'100'})]]});
  const two=fixture(graph);second(two);observe(prefix+':every-typed-row',two,{rows:[[original({integerToken:'100'})],[original({integerToken:'200'})]]});
  const denied=fixture(graph);second(denied,false);observe(prefix+':deny-filters',denied,{rows:[[original({integerToken:'100'})]]});
  const inactive=fixture(graph);inactive.cut.facts.find((r:any)=>r.type.elementId==='Assignment').fields.find((x:any)=>x.field.elementId==='active').value={boolean:false};observe(prefix+':inactive',inactive,{rows:[]});
  observe(prefix+':field-free-row-read',fixture(graph),{rows:[[]]},{type:ref('Resource'),fields:[]});
  const none=fixture(graph);empty(none);observe(prefix+':empty-population',none,{rows:[]});none.cut.coverage.find((x:any)=>x.type.elementId==='Assignment').fields=[];observe(prefix+':empty-still-preflights',none,{status:'refused',rows:[]});
 }
 const two=fixture();second(two);observe('field-free-every-row',two,{rows:[[],[]]},{type:ref('Resource'),fields:[]});
 for(const [id,change] of [
  ['caller-resource-subset',(f:any,s:any)=>{s.resources=[];}],['caller-action',(f:any,s:any)=>{s.action='update';}],
  ['missing-owner-read-role',(f:any)=>{delete f.owner.disclosure;}],['wrong-owner-read-role',(f:any)=>{f.owner.disclosure.readAction='update';}],
  ['stale-owner',(f:any)=>{f.cut.owner.revision='stale';}],['incomplete-target',(f:any)=>{f.cut.coverage.find((c:any)=>c.type.elementId==='Resource').complete=false;}],
  ['malformed-unselected-fact',(f:any)=>{f.cut.facts.find((r:any)=>r.type.elementId==='Project').fields[0].value={integerToken:'1'};}],
  ['unknown-target',(f:any,s:any)=>{s.type=ref('salary');}],['duplicate-field',(f:any,s:any)=>{s.fields.push(ref('salary'));}],
  ['aggregate-fact-budget',(f:any)=>{f.cut.maxFacts=f.cut.facts.length+f.cut.graphs.length;}],['shared-work-budget',(f:any)=>{f.cut.maxSteps=10;}],
 ] as [string,(f:any,s:any)=>void][]){const f=fixture(),s=selected(f);change(f,s);observe(id,f,{status:'refused',rows:[]},s);}
 {const f=fixture();empty(f);f.cut.coverage.find((x:any)=>x.type.elementId==='Resource').fields=[ref('resourceId')];observe('empty-output-dependency',f,{status:'refused',rows:[]});}
 {const f=fixture();f.policy.rules[0].disclosure[0].disposition={kind:'withheld'};f.cut.facts.find((r:any)=>r.type.elementId==='Resource').fields.pop();f.cut.coverage.find((x:any)=>x.type.elementId==='Resource').fields=[ref('resourceId')];observe('withheld-no-invented-input',f,{rows:[[{field:ref('salary'),disposition:'withheld'}]]});}
 {const f=fixture();f.policy.rules[0].disclosure[0].disposition={kind:'transformed',transform:'constant',version:'0.1.0',field:ref('salary'),value:{integerToken:'0'}};observe('transformed-tag',f,{rows:[[{field:ref('salary'),disposition:'transformed',outputType:ref('salary'),value:{integerToken:'0'}}]]});}
 for(const state of ['null','absent']){const f=fixture();nullable(f);const row=f.cut.facts.find((r:any)=>r.type.elementId==='Resource');if(state==='null')row.fields.find((x:any)=>x.field.elementId==='salary').value=null;else{row.fields.pop();row.absent=[ref('salary')];}observe(state,f,{rows:[[state==='null'?original(null):{field:ref('salary'),disposition:'absent'}]]});}
 {const f=fixture();nullable(f);const row=second(f,false);row.fields.pop();row.absent=[ref('salary')];f.policy.rules=[{...f.policy.rules[0],condition:{op:'eq',left:{kind:'resource',field:ref('salary')},right:{kind:'constant',field:ref('salary'),value:{integerToken:'100'}}}}];
 const p=program(f),subset=evaluateCandidateCatalogCollection(p,f.owner,f.cut,f.request);record('legal-old-subset-is-not-complete-scan',{status:'rendered',rows:[[original({integerToken:'100'})]]},{status:subset.status,rows:subset.rows});observe('late-unknown-refuses-whole-scan',f,{status:'refused',rows:[]});observe('field-free-late-unknown-still-refuses',f,{status:'refused',rows:[]},{type:ref('Resource'),fields:[]});}
 {const f=fixture();second(f);const r=structuredClone(f.policy.rules[0]);r.id='conflicting';r.condition={op:'eq',left:{kind:'resource',field:ref('salary')},right:{kind:'constant',field:ref('salary'),value:{integerToken:'200'}}};r.disclosure[0].disposition={kind:'transformed',transform:'constant',version:'0.1.0',field:ref('salary'),value:{integerToken:'2'}};f.policy.rules[0].disclosure[0].disposition={kind:'transformed',transform:'constant',version:'0.1.0',field:ref('salary'),value:{integerToken:'1'}};f.policy.rules.push(r);observe('late-conflict-refuses-whole-scan',f,{status:'refused',rows:[]});}
 for(const permitted of [false,true]){const f:any=structuredClone({...source,policy:permitted?readScenarios.policy:source.policy,cut:readScenarios.cut});f.owner.revision='scan-token-owner-r1';f.owner.disclosure={readAction:'read'};f.cut.owner.revision=f.owner.revision;f.cut.policy.revision=f.policy.revision;observe(permitted?'explicit-token-original-read':'no-inferred-token-read',f,permitted?{rows:[[{field:ref('token'),disposition:'original',value:{string:'opaque-token'}}]]}:{status:'refused',rows:[]},{type:ref('Resource'),fields:[ref('token')]});}
 {const f=fixture();const r=result(f);record('result-frozen',true,Object.isFrozen(r)&&Object.isFrozen(r.rows)&&Object.isFrozen(r.rows[0])&&Object.isFrozen(r.rows[0]![0]));f.cut.facts.find((r:any)=>r.type.elementId==='Resource').fields[1].value={integerToken:'999'};record('result-detached',{integerToken:'100'},(r.rows[0]![0] as any).value);record('forged-issued-handle','refused',result(f,selected(f),{}).status);
 let calls=0;const selection:any={};Object.defineProperty(selection,'type',{enumerable:true,get(){calls++;return ref('Resource');}});selection.fields=[];record('getter-refuses','refused',result(f,selection).status);record('getter-never-executed',0,calls);}
 return rows;
}
