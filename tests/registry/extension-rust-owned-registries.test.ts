// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {copyJson} from '../../src/model/json';
import {Registry,securityPackage,securityRegistry,semanticTypesRegistry,tableLifecycleRegistry,validateDocument} from '../../src/index-node-v4';
import {securityFixture} from '../security/fixture';
import noteFixture from '../binding/fixtures/table-lifecycle-note.json';
import type {Document,Json} from '../../src/model/types';
import type {ExtensionKindRuntime} from '../../src/registry/kind-runtime';

test('public Rust-owned extension registries preserve warnings, refusals, and caller callbacks',()=>{
 const {policy,resolution}=securityFixture();
 const securityDocument=copyJson(resolution.documents[0]!.document) as unknown as Document;
 securityDocument.vocabularies['umf.security']={version:'0.1.0'};
 securityDocument.extensions={'umf.security':policy as any};
 const security=validateDocument(securityDocument,securityRegistry());
 expect(security.valid).toBe(true);expect(security.complete).toBe(false);
 expect(security.diagnostics).toContainEqual(expect.objectContaining({code:'SECURITY_RESOLUTION_REQUIRED',path:'/extensions/umf.security/ontology',severity:'warning'}));

 const semantic:Document={umf:'0.10.0',id:'semantic-owner',vocabularies:{'umf.semantic-types':{version:'0.1.0'}},modules:[{id:'m',namespace:'example',elements:[{id:'e',scalarType:'string',extensions:{'umf.semantic-types':{types:[{vocabulary:'example.contact',version:'1.0.0',term:'email'}],future:{retained:true}}}}]}]};
 const semanticResult=validateDocument(semantic,semanticTypesRegistry());
 expect(semanticResult.valid).toBe(true);expect(semanticResult.complete).toBe(false);
 expect(semanticResult.diagnostics).toContainEqual(expect.objectContaining({code:'SEMANTIC_TYPE_UNKNOWN',path:'/modules/0/elements/0/extensions/umf.semantic-types/future',severity:'warning'}));

 const table=copyJson(noteFixture) as unknown as Document;
 (table.modules[0]!.extensions!['umf.tables'] as any).future={opaque:['retained']};
 const tableResult=validateDocument(table,tableLifecycleRegistry());
 expect(tableResult.valid).toBe(true);expect(tableResult.complete).toBe(false);
 expect(tableResult.diagnostics.some(item=>item.code==='TABLES_UNKNOWN')).toBe(true);

 let callerCalls=0;
 const registry=new Registry().register(securityPackage,(_payload,context)=>{callerCalls++;return [{code:'CALLER_SECURITY_REFUSAL',path:context.path,message:'caller policy retained',severity:'error'}];});
 const withCaller=validateDocument(securityDocument,securityRegistry(registry));
 expect(callerCalls).toBe(1);expect(withCaller.valid).toBe(false);
 expect(withCaller.diagnostics).toContainEqual(expect.objectContaining({code:'CALLER_SECURITY_REFUSAL',path:'/extensions/umf.security'}));
 const callbackOrder:string[]=[];
 const first=(payload:unknown,context:{path:string})=>{callbackOrder.push('first');return [{code:'CALLBACK_FIRST',path:context.path,message:'first',severity:'warning' as const}];};
 const second=(payload:unknown,context:{path:string})=>{callbackOrder.push('second');return [{code:'CALLBACK_SECOND',path:context.path,message:'second',severity:'warning' as const}];};
 const ordered=securityRegistry(new Registry().register(securityPackage,first));
 ordered.register(securityPackage,second);
 securityRegistry(ordered);
 validateDocument(securityDocument,ordered);
 expect(callbackOrder).toEqual(['first','second']);

 const customRuntime:ExtensionKindRuntime={
  validatePackagePayload:()=>[],listKinds:()=>({}),getKind:()=>undefined,
  inspectExtensionKinds:()=>({} as any),validateDocument:()=>({valid:true,complete:true,diagnostics:[]}),
 };
 let customCalls=0;
 const custom=new Registry(customRuntime).register(securityPackage,(_payload,context)=>{customCalls++;return [{code:'CUSTOM_RUNTIME_CALLBACK',path:context.path,message:'retained',severity:'warning'}];});
 securityRegistry(custom);
 securityRegistry(custom);
 expect(()=>custom.register({...securityPackage,description:'different manifest'})).toThrow(expect.objectContaining({code:'DUPLICATE_VERSION'}));
 custom.get(securityPackage.id,securityPackage.version)!.semantics!(policy as unknown as Json,{document:securityDocument,path:'/extensions/umf.security',scope:'document'});
 expect(customCalls).toBe(1);
});
