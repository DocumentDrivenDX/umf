// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError,type Diagnostic,type Document,type Json} from '../../model/types';
import type {Registry} from '../../registry/registry';
import {postgresqlCatalogPackage,type PostgresqlCatalogObjectIdentity} from './catalog-package';
import type {PostgresqlColumnMetadata} from './column-metadata';
import type {NativeJson} from '../../model/native-json';
import type {Validation} from '../../model/types';

type Guard=(error:unknown)=>boolean;
type Filter={side:'dependent'|'referenced';object:PostgresqlCatalogObjectIdentity};
interface Engine {postgresql:{
 import(fields:{source:string;id:string}):unknown;
 inspect(fields:{document:Document}):unknown;
 inspectPayload(fields:{payload:Json}):unknown;
 export(fields:{document:Document}):unknown;
 columns(fields:{document:Document}):unknown;
 getNode(fields:{document:Document;pointer:string}):unknown;
 findRelation(fields:{document:Document;schema:string;name:string}):unknown;
 edit(fields:{document:Document;path:string;text:string}):unknown;
 proposeCatalogEdit(fields:{document:Document;path:string;text:string}):unknown;
 reconstruction(fields:{document:Document}):unknown;
 dependencies(fields:{document:Document;side?:Filter['side'];object?:PostgresqlCatalogObjectIdentity}):unknown;
}}
const CONTROL=new Set(['LIMIT','CAPACITY','RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
function translate(error:unknown,isNative:Guard):never {
 if(!isNative(error)||CONTROL.has((error as {code?:string})?.code??''))throw error;
 const e=error as {code?:unknown;message?:unknown;path?:unknown};
 if(typeof e.code==='string'&&(e.code.startsWith('POSTGRESQL_')||e.code==='REQUEST'))throw new UmfError(e.code,String(e.message??''),typeof e.path==='string'?e.path:'');
 throw error;
}
function invoke<T>(run:()=>T,isNative:Guard):T{try{return run()}catch(error){translate(error,isNative)}}
function report(value:unknown):{valid:boolean;complete:false;diagnostics:Diagnostic[]} {
 const result=value as {valid?:unknown;complete?:unknown;diagnostics?:unknown};
 return {valid:result.valid===true,complete:false,diagnostics:Array.isArray(result.diagnostics)?result.diagnostics as Diagnostic[]:[]};
}

/** Public catalog API backed by the native capture kernel. The facade only
 * shapes the existing public result types; capture validation and edits remain Rust-owned. */
export function createPostgresqlCatalogRustDefault(engine:Engine,isNativeUmfCoreError:Guard,createRegistry:()=>Registry) {
 const inspectPayload=(payload:Json)=>{
  try{return report(engine.postgresql.inspectPayload({payload}) as unknown)}
  catch(error){
   if(!isNativeUmfCoreError(error)||CONTROL.has((error as {code?:string})?.code??''))translate(error,isNativeUmfCoreError);
   const native=error as {code?:unknown;message?:unknown;path?:unknown};
   return {valid:false,complete:false as const,diagnostics:[{code:typeof native.code==='string'?native.code:'POSTGRESQL_CATALOG_DOCUMENT',path:typeof native.path==='string'?native.path:'',message:String(native.message??''),severity:'error' as const}]};
  }
 };
 function postgresqlCatalogRegistry():Registry {
  return createRegistry().register(postgresqlCatalogPackage,(payload)=>inspectPayload(payload as Json).diagnostics);
 }
 function inspectPostgresqlCatalog(document:Document):Validation {
  const registry=postgresqlCatalogRegistry();
  const runtime=registry.kindRuntime;
  if(!runtime)throw new UmfError('EXTENSION_KIND_RUNTIME_REQUIRED','A shared runtime is required for PostgreSQL catalog inspection');
  return runtime.validateDocument(document,registry.registrations());
 }
 function importPostgresqlCatalogCapture(text:string,options:{id:string}):Document {
  return invoke(()=>engine.postgresql.import({source:text,id:options.id}),isNativeUmfCoreError) as Document;
 }
 function exportPostgresqlCatalogCapture(document:Document):{state:'captured'|'modified';json:string;complete:false} {
  const json=invoke(()=>engine.postgresql.export({document}),isNativeUmfCoreError) as string;
  const stateNode=invoke(()=>engine.postgresql.getNode({document,pointer:'/state'}),isNativeUmfCoreError) as NativeJson;
  if(stateNode.kind!=='string'||(stateNode.value!=='captured'&&stateNode.value!=='modified'))throw new UmfError('POSTGRESQL_CATALOG_STATE','Native capture state is invalid');
  return {state:stateNode.value,json,complete:false};
 }
 return Object.freeze({
  postgresqlCatalogRegistry,
  inspectPostgresqlCatalog,
  importPostgresqlCatalogCapture,
  exportPostgresqlCatalogCapture,
  getPostgresqlColumnMetadata(document:Document):PostgresqlColumnMetadata[] {return invoke(()=>engine.postgresql.columns({document}),isNativeUmfCoreError) as PostgresqlColumnMetadata[]},
  getPostgresqlCatalogNode(document:Document,path:string):NativeJson {return invoke(()=>engine.postgresql.getNode({document,pointer:path}),isNativeUmfCoreError) as NativeJson},
  findPostgresqlCatalogRelation(document:Document,qualified:{schema:string;name:string}):NativeJson|undefined {const value=invoke(()=>engine.postgresql.findRelation({document,schema:qualified.schema,name:qualified.name}),isNativeUmfCoreError);return value===null?undefined:value as NativeJson},
  proposePostgresqlCatalogEdit(document:Document,path:string,text:string):{document:Document;validation:Validation} {const result=invoke(()=>engine.postgresql.proposeCatalogEdit({document,path,text}),isNativeUmfCoreError) as {document:Document;validation:Validation};return result},
  getPostgresqlCatalogReconstruction(document:Document):{sql:string;complete:false;provenance:'original-capture-archive'} {return invoke(()=>engine.postgresql.reconstruction({document}),isNativeUmfCoreError) as {sql:string;complete:false;provenance:'original-capture-archive'}},
  queryPostgresqlCatalogDependencies(document:Document,filter?:Filter) {return invoke(()=>engine.postgresql.dependencies({document,...filter}),isNativeUmfCoreError) as {available:boolean;complete:false;state:'captured'|'modified';edges:NativeJson[]}},
 });
}
