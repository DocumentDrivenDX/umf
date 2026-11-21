// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {createCodegenEngine,createRetainedCodegenEngine,type UmfCodegenEngine} from '../../bindings/core/node/index.js';
import {CODEGEN_RESOURCES} from '../../src/access/codegen-resources';
import fixture from '../../fixtures/actions/approve.json';
function outcome(engine:UmfCodegenEngine,name:string,args:unknown[]){
 try{return {value:(engine[name as keyof UmfCodegenEngine] as (...args:unknown[])=>unknown)(...args)};}
 catch(error){const e=error as {name:string;code:string;message:string;path?:string;pointer?:string};return {error:{name:e.name,code:e.code,message:e.message,path:e.path??null,pointer:e.pointer??null}};}
}
test('retained action methods match one-shot receipts and refusals across the complete action interface',()=>{
 const source=structuredClone(fixture),before=structuredClone(source),action=source.modules[0]!.extensions['umf.actions'].actions[0]!,frame=action.writes[0]!;
 const inputs={order:{key:{module:'sales',element:'order',key:'pk'},components:[{string:'o1'}]}};
 const rule={language:'umf.actions.rules',version:'1',expression:'{"literal":{"boolean":true}}',references:[]};
 const calls:Array<[string,unknown[]]>=[['inspectActions',[source]],['declareAction',[source,'sales',action]],['editAction',[source,{module:'sales',action:action.id},action]],['assessAction',[source,{module:'sales',action:action.id},{}]],['validateBulkOutcome',[{}]],['compileActionRule',[source,action,rule,'pre']],['admitActionDeclaration',[source,action]],['admitActionInputs',[source,action,inputs]],['selectActionIdentity',[source,action,frame,inputs]],['actionFieldValueKey',[{module:'sales',element:'id'}]],['compileActionSelector',[source,action,frame]],['evaluateActionRule',[source,action,rule,'pre',{inputs,pre:[],post:[]}]]];
 const original=createCodegenEngine(CODEGEN_RESOURCES),retained=createRetainedCodegenEngine(CODEGEN_RESOURCES);let successful=0;
 try{for(const [name,args] of calls){const expected=outcome(original,name,args);expect(outcome(retained,name,args)).toEqual(expected);if('value' in expected)successful++;}expect(successful).toBeGreaterThanOrEqual(7);expect(source).toEqual(before);}
 finally{retained.dispose();}
});
test('retained action calls re-admit inputs and cannot reuse mutated results',()=>{
 const original=createCodegenEngine(CODEGEN_RESOURCES),retained=createRetainedCodegenEngine(CODEGEN_RESOURCES),source=structuredClone(fixture);
 try{
  const result=retained.inspectActions(source) as {source:{id:string}};result.source.id='tampered';
  expect(retained.inspectActions(source)).toEqual(original.inspectActions(source));
  let reads=0;const hostile=Object.defineProperty({},'modules',{enumerable:true,get(){reads++;return [];}});
  expect(()=>retained.inspectActions(hostile)).toThrow();expect(reads).toBe(0);
  source.id='changed-input';expect(retained.inspectActions(source)).toEqual(original.inspectActions(source));
 }finally{retained.dispose();}
 expect(()=>retained.inspectActions(source)).toThrow('disposed');
});
test('retained action methods preserve live host cancellation and meter refusals',()=>{
 let calls=0;const metered=createRetainedCodegenEngine(CODEGEN_RESOURCES,{controls:{meter(){calls++;throw Error('caller stop');}}});
 const cancelled=createRetainedCodegenEngine(CODEGEN_RESOURCES,{controls:{isCancelled:()=>true}});
 try{
  for(const [engine,code] of [[metered,'METER_FAILURE'],[cancelled,'CANCELLED']] as const){let failure:unknown;try{engine.inspectActions(fixture);}catch(error){failure=error;}expect(failure).toMatchObject({code});}
  expect(calls).toBe(1);
 }finally{metered.dispose();cancelled.dispose();}
});
