// SPDX-License-Identifier: MIT OR Apache-2.0
import manifest from '../../../spec/extensions/tables/package.json';
import {CURRENT_CORE_VERSION,UmfError,type Diagnostic,type Document,type ExtensionPackage,type Json,type Validation} from '../../model/types';
import {copyJson} from '../../model/json';
import {Registry} from '../../registry/registry';
import {validateDocument} from '../../validation/document';
import {inspectUnknown,refKey,TableContext} from './context';
import {inspectTable} from './columns';
import {inspectPolicies} from './policies';
import {inspectSeeds} from './seeds';
import {inspectOperations} from './operations';
import type {TableLifecyclePayload} from './types';
export * from './types';
export const TABLES_EXTENSION='umf.tables';
export const tableLifecyclePackage=manifest as unknown as ExtensionPackage;
export interface TableLifecycleInspection extends Validation {
 source?:Json;
 modules:{module:string;payload:TableLifecyclePayload}[];
 nativeQualified:false;
}
function semantics(value:Json,context:{document:Document;path:string;scope:string}):Diagnostic[]{
 const match=/^\/modules\/(0|[1-9][0-9]*)\/extensions\/umf\.tables$/.exec(context.path);
 const module=match?context.document.modules[Number(match[1])]:undefined;
 if(context.scope!=='module'||!module)return [{code:'TABLES_SCOPE',path:context.path,message:'Table declarations belong to an exact module',severity:'error'}];
 const ctx=new TableContext(context.document,module,context.path),payload=value as unknown as TableLifecyclePayload;
 inspectUnknown({...payload,commands:[]},manifest.schema,manifest.schema.$defs,ctx,context.path);
 ctx.unique(payload.tables,t=>t.id,context.path+'/tables','table ID');ctx.unique(payload.tables,t=>t.name,context.path+'/tables','native table name');ctx.unique(payload.tables,t=>refKey(t.record),context.path+'/tables','Record binding');
 if(payload.tables.reduce((n,t)=>n+t.columns.length,0)>4096)ctx.add('TABLES_COLUMN_LIMIT',context.path+'/tables','Module column inventory exceeds 4096');
 if(payload.seedSets.reduce((n,s)=>n+s.rows.length,0)>10000)ctx.add('TABLES_SEED_LIMIT',context.path+'/seedSets','Module seed inventory exceeds 10000 rows');
 // PostgreSQL tables and indexes share the schema relation namespace.
 const names=new Set(payload.tables.map(t=>t.name));
 for(const[i,table]of payload.tables.entries()){
  inspectTable(table,payload,ctx,context.path+'/tables/'+i);
  for(const[j,index]of table.indexes.entries()){
   if(names.has(index.name))ctx.add('TABLES_RELATION_NAME',context.path+'/tables/'+i+'/indexes/'+j+'/name','Native index name collides in the schema relation namespace');names.add(index.name);
  }
 }
 inspectPolicies(payload,ctx);inspectSeeds(payload,ctx);
 inspectOperations(payload,ctx);
 return ctx.diagnostics;
}
/** Explicit registry; no global registration or implicit native/plugin loading. */
export function tableLifecycleRegistry():Registry{return new Registry().register(tableLifecyclePackage,semantics);}
/** Metadata admission only. Native deployment and compiler obligations are separate. */
export function inspectTableLifecycle(input:unknown):TableLifecycleInspection{
 let source:Document;
 try{source=copyJson(input) as unknown as Document;}catch(error){if(!(error instanceof UmfError))throw error;return {valid:false,complete:false,modules:[],nativeQualified:false,diagnostics:[{code:error.code,path:error.path,message:error.message,severity:'error'}]};}
 const base=validateDocument(source,tableLifecycleRegistry()),diagnostics=[...base.diagnostics];
 if(!base.valid)return {...base,source:source as unknown as Json,modules:[],nativeQualified:false};
 if(source.umf!==CURRENT_CORE_VERSION)diagnostics.push({code:'TABLES_CORE',path:'/umf',message:'Table lifecycle metadata requires current core0.10.0',severity:'error'});
 const modules=Array.isArray(source.modules)?source.modules.flatMap(module=>{
  const payload=module.extensions?.[TABLES_EXTENSION];return payload===undefined?[]:[{module:module.id,payload:copyJson(payload) as unknown as TableLifecyclePayload}];
 }):[];
 if(!modules.length)diagnostics.push({code:'TABLES_DECLARATION',path:'/modules',message:'No module declares table lifecycle metadata',severity:'error'});
 return {source:source as unknown as Json,modules,nativeQualified:false,valid:!diagnostics.some(d=>d.severity==='error'),complete:diagnostics.length===0,diagnostics};
}
