// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import vectors from '../../fixtures/saga/portable.json';
import {createCodegenEngine,createEngine} from '../../bindings/core/node/index.js';
import {Registry} from '../../src/registry/registry';
import {registerSagas,sagaPackage} from '../../src/extensions/actions/saga';
import {validateDocument} from '../../src/validation/document';
import {createSagaResources} from '../../src/extensions/actions/saga-resources';
import {verifySagaVectors,type SagaSubject} from '../../scripts/saga-portable/verify';

const resources=createSagaResources(),engine=createCodegenEngine(resources);
const vector=(id:string)=>vectors.cases.find((item:any)=>item.id===id)!;
const result=(subject:SagaSubject,id:string)=>verifySagaVectors(subject,[vector(id)]);

for(const item of vectors.cases)test(`native source matches independent portable vector ${item.id} before SDK packaging`,()=>{
 const report=verifySagaVectors(engine,[item]);
 expect(report.results.filter(item=>!item.passed)).toEqual([]);
 expect(report.passed).toBe(1);
// The authoring vector performs multiple independent inspect/declare/edit calls.
// This is its aggregate harness budget; individual product budgets are unchanged.
},item.id==='recipe-declaration'?60_000:30_000);

test('dedicated Saga shape diagnostics retain generic validation and attachment scope guards',()=>{
 const core=createEngine(resources),registry=registerSagas(new Registry(core),engine);
 const malformed=vector('missing-compensation').source;
 const dedicated=engine.inspectSagas(malformed) as any;
 expect(dedicated.validation.valid).toBe(false);
 expect(dedicated.validation.diagnostics).toContainEqual(expect.objectContaining({code:'SAGA_STRUCTURE',path:'/modules/0/extensions/umf.actions.saga/sagas/0/steps/0'}));
 expect(dedicated.validation.diagnostics.some((item:any)=>item.code==='ACTION_STRUCTURE'||item.code==='EXTENSION_STRUCTURE')).toBe(false);
 expect(engine.sagaRegistryProfile().sagaPackage).toEqual(sagaPackage);
 const generic=validateDocument(malformed,registry);
 expect(generic.valid).toBe(false);
 expect(generic.diagnostics).toContainEqual(expect.objectContaining({code:'EXTENSION_STRUCTURE',path:'/modules/0/extensions/umf.actions.saga/sagas/0/steps/0'}));
 const wrongScope:any=structuredClone(vector('ordered-baseline').source);
 wrongScope.extensions={...(wrongScope.extensions??{}),'umf.actions.saga':wrongScope.modules[0].extensions['umf.actions.saga']};
 delete wrongScope.modules[0].extensions['umf.actions.saga'];
 const scoped=engine.inspectSagas(wrongScope) as any;
 expect(scoped.validation.valid).toBe(false);
 expect(scoped.validation.diagnostics).toContainEqual(expect.objectContaining({code:'EXTENSION_SCOPE',path:'/extensions/umf.actions.saga'}));
 expect(scoped.source).toEqual(wrongScope);
},30_000);

test('portable oracle rejects an edit implementation that validates but returns the unchanged source',()=>{
 const noOp:SagaSubject={
  inspectSagas:source=>engine.inspectSagas(source),
  declareSaga:(source,module,definition)=>engine.declareSaga(source,module,definition),
  assessSaga:(source,identity,capabilities)=>engine.assessSaga(source,identity,capabilities),
  editSaga:(source,identity,replacement)=>{engine.editSaga(source,identity,replacement);return structuredClone(source);}
 };
 const report=result(noOp,'recipe-declaration');
 expect(report.passed).toBe(0);
 expect(report.results[0]?.failure).toContain('edit did not apply the requested replacement');
});

test('portable oracle requires exact diagnostic path and severity, not a matching prefix',()=>{
 const base=vector('missing-output');
 for(const mutate of [
  (inspection:any,index:number)=>{inspection.validation.diagnostics[index]={...inspection.validation.diagnostics[index],severity:'warning'};},
  (inspection:any,index:number)=>{inspection.validation.diagnostics[index]={...inspection.validation.diagnostics[index],path:`${inspection.validation.diagnostics[index].path}/descendant`};},
  (inspection:any,index:number)=>{inspection.validation.diagnostics[index]={...inspection.validation.diagnostics[index],code:'UNEXPECTED_DIAGNOSTIC'};},
  (inspection:any)=>{inspection.validation.diagnostics.push({code:'UNEXPECTED_DIAGNOSTIC',path:'/unexpected',severity:'error',message:'mutant'});}
 ]){
  const wrong:SagaSubject={...engine,inspectSagas(source){
   const inspection:any=engine.inspectSagas(source),target=base.expected.sagaDiagnostics[0]!;
   const index=inspection.validation.diagnostics.findIndex((d:any)=>d.code===target.code&&d.path===target.path);
   mutate(inspection,index);
   return inspection;
  }};
  const report=result(wrong,'missing-output');
  expect(report.passed).toBe(0);
  expect(report.results[0]?.failure).toContain('complete independent code/path/severity inventory');
 }
});

test('portable oracle catches an omitted inherited obligation independently of assessment claims',()=>{
 const missing='action:approve:/modules/0/extensions/umf.actions/actions/0/binding/effects/0';
 const omitted:SagaSubject={...engine,inspectSagas(source){
  const inspection:any=engine.inspectSagas(source);
  inspection.entries[0]!.obligations=inspection.entries[0]!.obligations.filter((obligation:any)=>obligation.id!==missing);
  return inspection;
 }};
 const report=result(omitted,'recipe-declaration');
 expect(report.passed).toBe(0);
 expect(report.results[0]?.failure).toContain('complete ordered obligation inventory differs');
});

test('portable oracle rejects a future recovery obligation falsely marked declaration-compatible',()=>{
 const falselyCompatible:SagaSubject={...engine,assessSaga(source,identity,capabilities){
  const assessment=engine.assessSaga(source,identity,capabilities) as Record<string,unknown>;
  return {...assessment,declarationCompatible:true};
 }};
 const report=result(falselyCompatible,'unknown-recovery');
 expect(report.passed).toBe(0);
 expect(report.results[0]?.failure).toContain('unsupported meaning became compatible');
});
