// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import source from './protection/query-value-route-guards.json';
import {compileCandidateCatalogProgram} from '../../src/extensions/security/catalog-program-candidate';
import {evaluateCandidateCatalogReadRuleScan} from '../../src/extensions/security/catalog-runtime-candidate';
import {evaluateCandidateQueryValueRoutes} from '../../src/extensions/security/query-value-route-evaluation-candidate';
const ref=(elementId:string)=>({documentId:'domain',moduleId:'m',elementId});
const use=()=>({scan:'s0',path:'filters/0/left',type:ref('Resource'),field:ref('salary'),operator:'predicate',operation:'equal',required:['equality']});
const fixture=()=>{const f:any=structuredClone(source);f.logicalCut.context=Array.from({length:6},(_,i)=>({field:ref('guard'+i),value:{boolean:i===3}}));return f;};
const f=fixture(),program=compileCandidateCatalogProgram(f.policy,f.catalog,f.closure,f.ontology);
test('route composition matches the separate original read kernel with fresh cuts and unchanged input',()=>{
 for(const mask of [0,1,2,3,4,8,16,24,31,32,42,63]){
  const current=fixture();current.logicalCut.context.forEach((entry:any,i:number)=>entry.value.boolean=Boolean(mask&(1<<i)));
  const before=JSON.stringify(current),route=evaluateCandidateQueryValueRoutes(program,current.owner,current.logicalCut,use()),read=evaluateCandidateCatalogReadRuleScan(program,current.owner,current.logicalCut,{type:ref('Resource')});
  expect(route.status).toBe('evaluated');expect(read.status).toBe('evaluated');expect(route.complete).toBe(false);expect(route.authority).toBe(false);
  expect(JSON.stringify(route.rows.map(row=>({resource:row.resource,decision:row.readDecision,rules:row.rules})))).toBe(JSON.stringify(read.rows));
  expect(JSON.stringify(current)).toBe(before);
 }
});
test('route composition retains original work, inventory, datatype and complete-dependency refusals',()=>{
 const mutations=[
  (x:any)=>{x.logicalCut.maxSteps=1;},
  (x:any)=>{x.logicalCut.maxSteps=1000001;},
  (x:any)=>{x.logicalCut.context.pop();},
  (x:any)=>{x.logicalCut.coverage[0].complete=false;},
  (x:any)=>{x.logicalCut.coverage.find((c:any)=>c.type.elementId==='Assignment').fields=[];},
  (x:any)=>{x.logicalCut.context[0].value={string:'wrong domain'};},
  (x:any)=>{x.owner.storage=[];},
 ];
 for(const [index,mutate] of mutations.entries()){const current=fixture();mutate(current);const before=JSON.stringify(current);
  expect(evaluateCandidateCatalogReadRuleScan(program,current.owner,current.logicalCut,{type:ref('Resource')}).status, 'mutation '+index).toBe('refused');
  const route=evaluateCandidateQueryValueRoutes(program,current.owner,current.logicalCut,use());expect(route.status).toBe('refused');expect(route.rows).toEqual([]);expect(JSON.stringify(current)).toBe(before);
 }
});
test('all public route inputs are copied before interpretation and hostile getters are never read',()=>{
 for(const slot of ['owner','cut','use']){const current=fixture(),request=use();let reads=0;const target=slot==='owner'?current.owner:slot==='cut'?current.logicalCut:request;Object.defineProperty(target,'hostile',{enumerable:true,get(){reads++;return true;}});
  const result=evaluateCandidateQueryValueRoutes(program,current.owner,current.logicalCut,request);expect(result.status).toBe('refused');expect(result.rows).toEqual([]);expect(reads).toBe(0);
 }
 const current=fixture();const cycle:any={};cycle.self=cycle;current.logicalCut.hostile=cycle;expect(evaluateCandidateQueryValueRoutes(program,current.owner,current.logicalCut,use()).status).toBe('refused');
});
