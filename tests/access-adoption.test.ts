// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {constants} from 'node:fs';
import {lstat,mkdtemp,open,rename,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {generatePythonClient} from '../src/access';
import {LOCAL_ERROR_CODES, MAX_BATCH_ITEMS} from '../src/access/constants';
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
 const importedName=model();importedName.modules[0].extensions['umf.actions'].actions[0].parameters.find((p:any)=>p.id==='note').name='write_outcomes_unknown';
 expect(()=>generate(importedName)).toThrow(expect.objectContaining({path:'example.open-project/note'}));
 const d=model(),originalAction=d.modules[0].extensions['umf.actions'].actions[0];
 originalAction.id='branch.open-project';
 const secondAction=structuredClone(originalAction);secondAction.id='open-project';
 d.modules.push({id:'example.branch',namespace:'example.branch',elements:[],extensions:{'umf.actions':{actions:[secondAction]}}});
 expect(()=>generate(d)).toThrow(expect.objectContaining({path:'/modules/1/extensions/umf.actions/actions/0/id'}));
});

test('check is usable as an action parameter and as an independent precondition ID',async()=>{
 const d=model(),action=d.modules[0].extensions['umf.actions'].actions[0];
 action.parameters.find((p:any)=>p.id==='note').name='check';
 action.preconditions[0].id='check';
 const generated=generate(d),directory=await mkdtemp(join(tmpdir(),'umf-adoption-check-'));
 const journal=join(directory,'.umf-adoption-stage');
 const stages=new Set([
  'parent-generated','parent-written','parent-before-spawn',
  'child-before-asyncio-import','child-after-asyncio-import',
  'child-before-generated-imports','child-after-generated-imports',
  'child-before-precondition-assertion','child-after-precondition-assertion',
  'child-before-async-action','child-after-async-action',
  'child-before-sync-action','child-after-sync-action','child-run-complete'
 ]);
 const writeParentStage=async(stage:string)=>{
  const temporary=join(directory,'.umf-adoption-stage.parent.tmp');
  await Bun.write(temporary,stage+'\n');
  await rename(temporary,journal);
 };
 let cleanupOwnedChild:(()=>void)|undefined;
 try{
  await writeParentStage('parent-generated');
  for(const file of generated.files)await Bun.write(join(directory,file.path),file.text);
  await writeParentStage('parent-written');
  const script=`import os\ndef record(stage):\n with open('.umf-adoption-stage.tmp','w',encoding='ascii') as journal:\n  journal.write(stage+'\\n')\n os.replace('.umf-adoption-stage.tmp','.umf-adoption-stage')\nrecord('child-before-asyncio-import')\nimport asyncio\nrecord('child-after-asyncio-import')\nrecord('child-before-generated-imports')\nfrom adoption import Actions, Client, SyncActions, SyncClient, CustomerKey, OpenProjectPrecondition\nrecord('child-after-generated-imports')\nrecord('child-before-precondition-assertion')\nassert OpenProjectPrecondition.CHECK == 'check'\nrecord('child-after-precondition-assertion')\nclass AsyncHost:\n async def execute(self, request):\n  assert request['inputs']['note'] == 'value'\n  return {'schema':request['schema'],'status':'committed','created':[],'changed':[],'counts':{},'consistency_token':'cut'}\nclass SyncHost:\n def execute(self, request):\n  assert request['inputs']['note'] == 'value'\n  return {'schema':request['schema'],'status':'committed','created':[],'changed':[],'counts':{},'consistency_token':'cut'}\nasync def main():\n record('child-before-async-action')\n await Actions(Client(AsyncHost())).open_project(code='P',title='T',client=CustomerKey(code='C1'),check='value')\n record('child-after-async-action')\n record('child-before-sync-action')\n SyncActions(SyncClient(SyncHost())).open_project(code='P',title='T',client=CustomerKey(code='C1'),check='value')\n record('child-after-sync-action')\nasyncio.run(main())\nrecord('child-run-complete')\n`;
  await writeParentStage('parent-before-spawn');
  const proc=Bun.spawn([process.env.UMF_UNIFIED_PYTHON??'python3.11','-S','-c',script],{cwd:directory,stdout:'pipe',stderr:'pipe',env:{...process.env,PYTHONPATH:directory,PYTHONDONTWRITEBYTECODE:'1'}});
  cleanupOwnedChild=()=>{if(proc.exitCode===null)proc.kill();};
  const [exit,stdout,stderr]=await Promise.all([proc.exited,new Response(proc.stdout).text(),new Response(proc.stderr).text()]);
  expect({exit,stdout,stderr}).toEqual({exit:0,stdout:'',stderr:''});
 }catch(error){
  try{
   cleanupOwnedChild?.();
  }catch{}
  try{
   const before=await lstat(journal);
   if(before.isFile()&&!before.isSymbolicLink()&&before.size<=128){
    const noFollow=constants.O_NOFOLLOW??0;
    const handle=await open(journal,constants.O_RDONLY|noFollow);
    try{
     const opened=await handle.stat();
     if(opened.isFile()&&opened.size<=128&&opened.dev===before.dev&&opened.ino===before.ino){
      const buffer=new Uint8Array(128);
      const {bytesRead}=await handle.read(buffer,0,128,0);
      const after=await handle.stat();
      if(bytesRead===opened.size&&after.size===opened.size&&after.dev===opened.dev&&after.ino===opened.ino){
       const contents=String.fromCharCode(...buffer.subarray(0,bytesRead));
       const stage=contents.endsWith('\n')?contents.slice(0,-1):'';
       if(contents===stage+'\n'&&stages.has(stage))console.error(`access-adoption-check-stage=${stage}`);
      }
     }
    }finally{await handle.close();}
   }
  }catch{}
  throw error;
 }finally{await rm(directory,{recursive:true,force:true});}
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
 expect(r.description.limits).toEqual({page:100,getManyKeys:100,batchItems:MAX_BATCH_ITEMS});
 expect(r.description.errorCodes).toContain('LIMIT_EXCEEDED');
 expect(r.description.localErrorCodes).toContain('LIMIT');
 expect(r.description.localErrorCodes).toContain('KEY_TYPE');
 for(const change of [(d:any)=>{d.modules[0].extensions['umf.actions'].actions[0].preconditions[1].id='Fresh';},(d:any)=>{d.modules[0].elements[5].name='OpenProjectInput';}]){
  const d=model();change(d);expect(()=>generate(d)).toThrow(/collision/);
 }
});

test('local error inventory covers every literal generated runtime diagnostic',async()=>{
 const sources=await Promise.all(['src/access/python-runtime.ts','src/access/table-runtime.ts']
  .map(path=>Bun.file(resolve(path)).text()));
 const codes=new Set(sources.flatMap(source=>[...source.matchAll(/(?:AccessError|Unsupported|SchemaMismatch|PreconditionFailed|WriteOutcomeUnknown)\('([A-Z][A-Z0-9_]*)'/g)].map(match=>match[1]!)));
 expect([...codes].sort()).toEqual([...LOCAL_ERROR_CODES].sort());
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
