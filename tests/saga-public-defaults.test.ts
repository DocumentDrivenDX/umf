// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import fixture from '../docs/helix/03-test/fixtures/saga/supported-action.json';
import opaqueFixture from '../docs/helix/02-design/examples/saga/allocation.json';
import {assessSaga,declareSaga,editSaga,inspectSagas} from '../src/index-node-v4';
import type {Document} from '../src/model/types';
import type {SagaDefinition,SagaIdentity} from '../src/extensions/actions/saga';
test('Node V4 saga defaults declare, inspect, edit, assess supported Actions and refuse opaque source',()=>{
 const source=structuredClone(fixture) as unknown as Document;
 const before=inspectSagas(source);
 expect(before.validation.valid).toBe(true);
 expect(before.entries).toHaveLength(1);
 expect(before.entries[0]!.obligations.some(obligation=>obligation.kind==='unknown')).toBe(false);
 const original=before.entries[0]!.definition;
 const definition={...structuredClone(original),id:'set-active-saga-copy'};
 const declared=declareSaga(source,'sales',definition);
 const declaredInspection=inspectSagas(declared);
 expect(declaredInspection.entries.some(entry=>entry.definition.id==='set-active-saga-copy')).toBe(true);
 const identity:SagaIdentity={module:'sales',saga:'set-active-saga-copy'};
 const declaredEntry=declaredInspection.entries.find(entry=>entry.definition.id===identity.saga)!;
 const replacement={...structuredClone(declaredEntry.definition),description:'Reviewed supported Action declaration'};
 const edited=editSaga(declared,identity,replacement);
 const editedInspection=inspectSagas(edited);
 expect(editedInspection.entries.find(entry=>entry.definition.id===identity.saga)?.definition.description).toBe('Reviewed supported Action declaration');
 const assessment=assessSaga(edited,identity,{id:'public-fixture',version:'1',coreVersion:'0.10.0',sagaVersion:'0.1.0',coordination:'unknown',claims:[],source:edited,identity});
 expect(assessment.executionVerified).toBe(false);
 expect(()=>declareSaga(opaqueFixture as unknown as Document,'equipment',{...definition,id:'opaque-copy'})).toThrow(expect.objectContaining({code:'SAGA_UNKNOWN'}));
 expect(()=>declareSaga(source,'sales',{} as SagaDefinition)).toThrow();
},60_000);
