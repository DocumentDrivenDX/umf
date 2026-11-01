// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import fixture from '../../fixtures/actions/approve.json';
import supportedFixture from '../../docs/helix/03-test/fixtures/bulk-update/model.json';
import {createUmfRegistry,validateDocument,inspectActions,declareAction,editAction,assessAction,actionsPackage} from '../../src/index-node-v4';
import type {Document,Action,ActionExecutorProfile} from '../../src/index-node-v4';

test('Node V4 action authoring routes declaration, inspection, editing and assessment through Rust',()=>{
 const source=structuredClone(supportedFixture) as unknown as Document;
 const registry=createUmfRegistry();
 const inspected=inspectActions(source,registry);
 expect(inspected.validation.valid).toBe(true);
 expect(inspected.actions).toHaveLength(1);
 expect(inspected.actions[0]!.obligations.some(item=>item.status==='unchecked')).toBe(false);
 const identity={module:'sales',action:inspected.actions[0]!.action.id};
 const profile:ActionExecutorProfile={id:'fixture-executor',version:'1',actionVersion:'0.1.0',coreVersion:'0.10.0',source,identity,claims:inspected.actions[0]!.obligations.map(item=>({obligation:item.id,status:'supported',evidence:['fixture://declaration-only']}))};
 const assessment=assessAction(source,identity,profile,registry);
 expect(assessment.declaredCompatible).toBe(true);
 expect(assessment.executionVerified).toBe(false);
 const action=structuredClone(inspected.actions[0]!.action) as Action;
 const empty=structuredClone(source);
 delete empty.modules[0]!.extensions;
 delete empty.vocabularies['umf.actions'];
 const declared=declareAction(empty,'sales',action,registry);
 expect(inspectActions(declared,registry).actions).toHaveLength(1);
 const updated=editAction(declared,identity,{...action,description:'Reviewed action'},registry);
 expect(inspectActions(updated,registry).actions[0]!.action.description).toBe('Reviewed action');
},60_000);

test('Node V4 action authoring refuses a duplicate identity',()=>{
 const source=structuredClone(fixture) as unknown as Document;
 const registry=createUmfRegistry();
 const action=(source.modules[0]!.extensions!['umf.actions'] as unknown as {actions:Action[]}).actions[0]!;
 expect(()=>declareAction(source,'sales',action,registry)).toThrow();
},60_000);

test('Node V4 action authoring preserves a caller validator registered for the standard Action package',()=>{
 const source=structuredClone(fixture) as unknown as Document;
 const registry=createUmfRegistry();
 let calls=0;
 registry.register(actionsPackage,()=>{calls++;return [{code:'CALLER_ACTION_POLICY',path:'/caller',message:'Caller policy rejected this declaration',severity:'error'}];});
 expect(validateDocument(source,registry).diagnostics.some(item=>item.code==='CALLER_ACTION_POLICY')).toBe(true);
 const action=structuredClone((source.modules[0]!.extensions!['umf.actions'] as unknown as {actions:Action[]}).actions[0]!) as Action;
 action.id='new-action';action.name='New action';
 expect(()=>declareAction(source,'sales',action,registry)).toThrow('Caller policy rejected this declaration');
 expect(calls).toBeGreaterThan(0);
},60_000);

test('Node V4 ordinary document validation runs the Rust Action semantic callback',()=>{
 const source=structuredClone(fixture) as unknown as Document;
 const action=(source.modules[0]!.extensions!['umf.actions'] as unknown as {actions:Action[]}).actions[0]!;
 (source.modules[0]!.extensions!['umf.actions'] as unknown as {actions:Action[]}).actions.push({...action});
 const result=validateDocument(source,createUmfRegistry());
 expect(result.diagnostics.some(item=>item.code==='ACTION_IDENTITY')).toBe(true);
});
