// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import vectors from '../../fixtures/saga/portable.json';
import {createCodegenEngine} from '../../bindings/core/node/index.js';
import {createSagaResources} from '../../src/extensions/actions/saga-resources';
import {verifySagaVectors,type SagaSubject} from '../../scripts/saga-portable/verify';

const engine=createCodegenEngine(createSagaResources());
const vector=(id:string)=>vectors.cases.find((item:any)=>item.id===id)!;
const result=(subject:SagaSubject,id:string)=>verifySagaVectors(subject,[vector(id)]);

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
