// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {generatePythonClient} from '../src/access';
import {analyzeAction} from '../src/extensions/actions/analysis';
import {evaluateActionRule} from '../src/extensions/actions/evaluation';
import type {Action} from '../src/extensions/actions/types';
import type {Document} from '../src/model/types';
const original=await Bun.file(new URL('./unified/adoption.json',import.meta.url)).text();
function model(){return JSON.parse(original);}
function generate(d:any){return generatePythonClient({text:JSON.stringify(d),package:'adoption'});}

// @covers US-091-AC11 US-091-AC13
test('legacy action content refuses at its original path even beside standard actions or an empty selection',()=>{
 for(const legacy of [[{id:'old'}],{},null])for(const location of ['module','ddd']){
  const d=model(),m=d.modules[0];
  const path=location==='module'?'/modules/0/actions':'/modules/0/extensions/umf.ddd/actions';
  if(location==='module')m.actions=legacy;
  else {d.vocabularies['umf.ddd']={version:'0.1.0'};m.extensions['umf.ddd']={actions:legacy};}
  expect(()=>generate(d)).toThrow(expect.objectContaining({code:'ACCESS_UNSUPPORTED',path}));
  expect(()=>generatePythonClient({text:JSON.stringify(d),package:'adoption',actions:[]})).toThrow();
 }
 const d=model();d.modules[0].actions=[];expect(()=>generate(d)).not.toThrow();
});

test('malformed and future standard action inventories cannot silently generate an empty client',()=>{
 for(const payload of [null,5,[],{}, {actions:null}, {actions:{}}, {actions:[],futureMeaning:true}]){
  const d=model();d.modules[0].extensions['umf.actions']=payload;
  expect(()=>generate(d)).toThrow(expect.objectContaining({code:'ACCESS_UNSUPPORTED'}));
 }
 const d=model();d.vocabularies['umf.actions'].version='0.2.0';
 expect(()=>generate(d)).toThrow(expect.objectContaining({path:'/vocabularies/umf.actions/version'}));
});

test('action inventory and normalized parameter identities refuse with source locations',()=>{
 const path='/modules/0/extensions/umf.actions/actions/0';
 for(const raw of [null,[],5,{}, {id:''}, {id:'invalid'}]){
  const d=model();d.modules[0].extensions['umf.actions'].actions=[raw];
  expect(()=>generate(d)).toThrow(expect.objectContaining({code:'ACCESS_UNSUPPORTED',path}));
 }
 const collision=model(),action=collision.modules[0].extensions['umf.actions'].actions[0];
 action.parameters.find((p:any)=>p.id==='title').name='code';
 expect(()=>generate(collision)).toThrow(expect.objectContaining({path:path+'/parameters/1'}));
 const d=model(),originalAction=d.modules[0].extensions['umf.actions'].actions[0];
 originalAction.id='branch.open-project';
 const secondAction=structuredClone(originalAction);secondAction.id='open-project';
 d.modules.push({id:'example.branch',namespace:'example.branch',elements:[],extensions:{'umf.actions':{actions:[secondAction]}}});
 expect(()=>generate(d)).toThrow(expect.objectContaining({path:'/modules/1/extensions/umf.actions/actions/0/id'}));
});

// @covers US-091-AC12 US-091-AC13
test('canonical preconditions evaluate absent/present key frames; optional assignments require version 2',()=>{
 const d=model(),a=d.modules[0].extensions['umf.actions'].actions[0];
 const analysis=analyzeAction(d as Document,a as Action,'/action');
 expect(analysis.diagnostics.filter(x=>x.severity==='error')).toEqual([]);
 const inputs={code:{string:'P1'},title:{string:'Example'},client:{key:{module:'example',element:'Customer',key:'pk'},components:[{string:'C1'}]}};
 for(const project of [false,true])for(const customer of [false,true]){
  const state={inputs,pre:{frames:{projectRead:{exists:project,values:{}},clientRead:{exists:customer,values:{}}},links:[]}};
  expect(evaluateActionRule(d,a,a.preconditions[0].rule,'pre',state)).toBe(!project);
  expect(evaluateActionRule(d,a,a.preconditions[1].rule,'pre',state)).toBe(customer);
 }
 expect(()=>generate(d)).not.toThrow();
 a.binding.profile.version='1';expect(()=>generate(d)).toThrow(/ACTION_EFFECT/);
 a.binding.profile.version='2';a.parameters.find((p:any)=>p.id==='title').required=false;
 expect(()=>generate(d)).toThrow(/ACTION_EFFECT/);
});

test('description publishes action conditions, operation coverage, exact error inventory and batch cap',()=>{
 const r=generate(model()),a=(r.description.actions as any)['example.open-project'];
 expect(a.preconditions.map((c:any)=>c.id)).toEqual(['fresh','exists']);
 expect(a.operations).toEqual(['apply','apply_batch','validate']);
 expect(r.description.limits).toEqual({page:100,getManyKeys:100,batchItems:100});
 expect(r.description.errorCodes).toContain('LIMIT_EXCEEDED');
 for(const change of [(d:any)=>{d.modules[0].extensions['umf.actions'].actions[0].preconditions[1].id='Fresh';},(d:any)=>{d.modules[0].elements[5].name='OpenProjectInput';}]){
  const d=model();change(d);expect(()=>generate(d)).toThrow(/collision/);
 }
});

// @covers US-092-AC13 US-092-AC14 US-092-AC15
test('isolated sync and async clients preserve optional inputs, batch settlement, validation and write uncertainty',async()=>{
 const generated=generate(model()),directory=await mkdtemp(join(tmpdir(),'umf-adoption-'));
 try{
  for(const file of generated.files)await Bun.write(join(directory,file.path),file.text);
  const proc=Bun.spawn([process.env.UMF_UNIFIED_PYTHON??'python3.11','-S',resolve('tests/unified/adoption_probe.py'),directory],{stdout:'pipe',stderr:'pipe',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
  const [exit,stdout,stderr]=await Promise.all([proc.exited,new Response(proc.stdout).text(),new Response(proc.stderr).text()]);
  expect({exit,stderr}).toEqual({exit:0,stderr:''});
  expect(JSON.parse(stdout)).toEqual({modes:2,preconditions:true,optional:true,batches:true,validation:true,uncertainty:true,noRetries:true});
 }finally{await rm(directory,{recursive:true,force:true});}
});
