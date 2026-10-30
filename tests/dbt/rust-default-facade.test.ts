// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {UmfError} from '../../src/model/errors';
import {bindDbtRust,type DbtRustEngine} from '../../src/adapters/dbt/rust-default';

const methods=[
 'importDbtManifest','exportDbtManifest','inspectDbtManifest','getDbtManifestNode','proposeDbtManifestNodeEdit',
 'importDbtArtifact','exportDbtArtifact','inspectDbtArtifact','getDbtArtifactNode','proposeDbtArtifactNodeEdit',
 'importDbtSemanticManifest','exportDbtSemanticManifest','inspectDbtSemanticManifest','getDbtSemanticManifestNode','proposeDbtSemanticManifestNodeEdit',
 'inspectDbtManifestGraph','selectDbtManifestDependencies',
] as const;

test('DBT default binder forwards all data-operation arguments without rebuilding them',()=>{
 const calls:{name:string;args:unknown[]}[]=[];
 const engine=Object.fromEntries(methods.map(name=>[name,(...args:unknown[])=>{calls.push({name,args});return name;}])) as unknown as DbtRustEngine;
 const operations=bindDbtRust(engine),document={umf:'0.10.0'},options={id:'kept-reference',extra:true},path='/a~1b',replacement='null',selection={roots:['model.a']};
 expect(operations.importDbtManifest('manifest',options)).toBe('importDbtManifest');
 expect(operations.exportDbtManifest(document)).toBe('exportDbtManifest');
 expect(operations.inspectDbtManifest(document)).toBe('inspectDbtManifest');
 expect(operations.getDbtManifestNode(document,path)).toBe('getDbtManifestNode');
 expect(operations.proposeDbtManifestNodeEdit(document,path,replacement)).toBe('proposeDbtManifestNodeEdit');
 expect(operations.importDbtArtifact('artifact',options)).toBe('importDbtArtifact');
 expect(operations.exportDbtArtifact(document)).toBe('exportDbtArtifact');
 expect(operations.inspectDbtArtifact(document)).toBe('inspectDbtArtifact');
 expect(operations.getDbtArtifactNode(document,path)).toBe('getDbtArtifactNode');
 expect(operations.proposeDbtArtifactNodeEdit(document,path,replacement)).toBe('proposeDbtArtifactNodeEdit');
 expect(operations.importDbtSemanticManifest('semantic',options)).toBe('importDbtSemanticManifest');
 expect(operations.exportDbtSemanticManifest(document)).toBe('exportDbtSemanticManifest');
 expect(operations.inspectDbtSemanticManifest(document)).toBe('inspectDbtSemanticManifest');
 expect(operations.getDbtSemanticManifestNode(document,path)).toBe('getDbtSemanticManifestNode');
 expect(operations.proposeDbtSemanticManifestNodeEdit(document,path,replacement)).toBe('proposeDbtSemanticManifestNodeEdit');
 expect(operations.inspectDbtManifestGraph(document)).toBe('inspectDbtManifestGraph');
 expect(operations.selectDbtManifestDependencies(document,selection)).toBe('selectDbtManifestDependencies');
 expect(calls.map(call=>call.name)).toEqual(methods);
 expect(calls[0]!.args).toEqual(['manifest',options]);
 expect(calls[0]!.args[1]).toBe(options);
 expect(calls[3]!.args).toEqual([document,path]);
 expect(calls[16]!.args).toEqual([document,selection]);
 expect(calls[16]!.args[1]).toBe(selection);
});

test('DBT default binder rethrows native operation failures as the public UmfError class',()=>{
 const native=Object.assign(new Error('Native schema refusal'),{code:'DBT_MANIFEST_DOCUMENT',path:'/modules/0'});
 const engine={...Object.fromEntries(methods.map(name=>[name,()=>{throw native;}]))} as unknown as DbtRustEngine;
 let caught:unknown;
 try{bindDbtRust(engine,error=>error===native).inspectDbtManifest({});}catch(error){caught=error;}
 expect(caught).toBeInstanceOf(UmfError);
 expect(caught).toMatchObject({code:'DBT_MANIFEST_DOCUMENT',path:'/modules/0',message:'Native schema refusal'});
});

test('DBT default binder preserves unauthenticated caller exceptions with domain-looking codes',()=>{
 const caller=Object.assign(new Error('getter rejected access'),{code:'DBT_MANIFEST_DOCUMENT',path:'/caller'});
 const engine={...Object.fromEntries(methods.map(name=>[name,()=>{throw caller;}]))} as unknown as DbtRustEngine;
 let caught:unknown;
 try{bindDbtRust(engine).importDbtManifest('{}',{id:'x'});}catch(error){caught=error;}
 expect(caught).toBe(caller);
});

test('DBT default binder converts only authenticated host wrappers and keeps controls intact',()=>{
 const wrapper=Object.assign(new Error('host copy failed'),{code:'DBT_ARTIFACT_DOCUMENT',path:'/id'});
 const control=Object.assign(new Error('work limit'),{code:'RESOURCE_LIMIT'});
 let failure:Error=wrapper;
 const engine={...Object.fromEntries(methods.map(name=>[name,()=>{throw failure;}]))} as unknown as DbtRustEngine;
 const bound=bindDbtRust(engine,()=>false,()=>false,error=>error===wrapper||error===control);
 let caught:unknown;
 try{bound.exportDbtArtifact({} as never);}catch(error){caught=error;}
 expect(caught).toBeInstanceOf(UmfError);
 expect(caught).toMatchObject({code:'DBT_ARTIFACT_DOCUMENT',path:'/id',message:'host copy failed'});
 failure=control;
 try{bound.exportDbtArtifact({} as never);}catch(error){caught=error;}
 expect(caught).toBe(control);
});
