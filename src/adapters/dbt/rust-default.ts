// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../../model/types';
import type {importDbtManifest,exportDbtManifest,inspectDbtManifest,getDbtManifestNode,proposeDbtManifestNodeEdit} from './index';
import type {importDbtArtifact,exportDbtArtifact,inspectDbtArtifact,getDbtArtifactNode,proposeDbtArtifactNodeEdit} from './artifact';
import type {importDbtSemanticManifest,exportDbtSemanticManifest,inspectDbtSemanticManifest,getDbtSemanticManifestNode,proposeDbtSemanticManifestNodeEdit} from './semantic';
import type {inspectDbtManifestGraph} from './graph';
import type {selectDbtManifestDependencies} from './selection';

export interface DbtRustEngine {
 importDbtManifest:(text:string,options:{id:string})=>unknown;
 exportDbtManifest:(document:unknown)=>unknown;
 inspectDbtManifest:(document:unknown)=>unknown;
 getDbtManifestNode:(document:unknown,path:string)=>unknown;
 proposeDbtManifestNodeEdit:(document:unknown,path:string,text:string)=>unknown;
 importDbtArtifact:(text:string,options:{id:string})=>unknown;
 exportDbtArtifact:(document:unknown)=>unknown;
 inspectDbtArtifact:(document:unknown)=>unknown;
 getDbtArtifactNode:(document:unknown,path:string)=>unknown;
 proposeDbtArtifactNodeEdit:(document:unknown,path:string,text:string)=>unknown;
 importDbtSemanticManifest:(text:string,options:{id:string})=>unknown;
 exportDbtSemanticManifest:(document:unknown)=>unknown;
 inspectDbtSemanticManifest:(document:unknown)=>unknown;
 getDbtSemanticManifestNode:(document:unknown,path:string)=>unknown;
 proposeDbtSemanticManifestNodeEdit:(document:unknown,path:string,text:string)=>unknown;
 inspectDbtManifestGraph:(document:unknown)=>unknown;
 selectDbtManifestDependencies:(document:unknown,options:{roots:string[];includeMacros?:boolean;maxDepth?:number;maxNodes?:number})=>unknown;
}

type NativeCoreErrorGuard=(error:unknown)=>boolean;
const CONTROL_ERROR_CODES=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE']);
const JSON_DOMAIN_CODES=new Set(['NON_JSON','CYCLE','NUMBER','LIMIT','JSON_SCHEMA_POINTER','JSON_SCHEMA_SYNTAX']);
function domainCode(error:unknown):string|undefined{
 const code=(error as {code?:unknown}|null)?.code;
 return typeof code==='string'&&(code.startsWith('DBT_')||JSON_DOMAIN_CODES.has(code))?code:undefined;
}
type DbtOperations={
 importDbtManifest:(text:string,options:{id:string})=>ReturnType<typeof importDbtManifest>;
 exportDbtManifest:(document:Parameters<typeof exportDbtManifest>[0])=>ReturnType<typeof exportDbtManifest>;
 inspectDbtManifest:(document:Parameters<typeof inspectDbtManifest>[0])=>ReturnType<typeof inspectDbtManifest>;
 getDbtManifestNode:(document:Parameters<typeof getDbtManifestNode>[0],path:string)=>ReturnType<typeof getDbtManifestNode>;
 proposeDbtManifestNodeEdit:(document:Parameters<typeof proposeDbtManifestNodeEdit>[0],path:string,text:string)=>ReturnType<typeof proposeDbtManifestNodeEdit>;
 importDbtArtifact:(text:string,options:{id:string})=>ReturnType<typeof importDbtArtifact>;
 exportDbtArtifact:(document:Parameters<typeof exportDbtArtifact>[0])=>ReturnType<typeof exportDbtArtifact>;
 inspectDbtArtifact:(document:Parameters<typeof inspectDbtArtifact>[0])=>ReturnType<typeof inspectDbtArtifact>;
 getDbtArtifactNode:(document:Parameters<typeof getDbtArtifactNode>[0],path:string)=>ReturnType<typeof getDbtArtifactNode>;
 proposeDbtArtifactNodeEdit:(document:Parameters<typeof proposeDbtArtifactNodeEdit>[0],path:string,text:string)=>ReturnType<typeof proposeDbtArtifactNodeEdit>;
 importDbtSemanticManifest:(text:string,options:{id:string})=>ReturnType<typeof importDbtSemanticManifest>;
 exportDbtSemanticManifest:(document:Parameters<typeof exportDbtSemanticManifest>[0])=>ReturnType<typeof exportDbtSemanticManifest>;
 inspectDbtSemanticManifest:(document:Parameters<typeof inspectDbtSemanticManifest>[0])=>ReturnType<typeof inspectDbtSemanticManifest>;
 getDbtSemanticManifestNode:(document:Parameters<typeof getDbtSemanticManifestNode>[0],path:string)=>ReturnType<typeof getDbtSemanticManifestNode>;
 proposeDbtSemanticManifestNodeEdit:(document:Parameters<typeof proposeDbtSemanticManifestNodeEdit>[0],path:string,text:string)=>ReturnType<typeof proposeDbtSemanticManifestNodeEdit>;
 inspectDbtManifestGraph:(document:Parameters<typeof inspectDbtManifestGraph>[0])=>ReturnType<typeof inspectDbtManifestGraph>;
 selectDbtManifestDependencies:(document:Parameters<typeof selectDbtManifestDependencies>[0],options:Parameters<typeof selectDbtManifestDependencies>[1])=>ReturnType<typeof selectDbtManifestDependencies>;
};

/** Bind the opt-in Rust DBT family while retaining the public UMF error identity. */
export function bindDbtRust(engine:DbtRustEngine,isNativeUmfCoreError:NativeCoreErrorGuard=()=>false,isHostJsonResponseError:NativeCoreErrorGuard=()=>false,isDbtHostError:NativeCoreErrorGuard=()=>false):DbtOperations {
 const call=<T>(operation:()=>unknown):T=>{
  try{return operation() as T;}
  catch(error){
   const native=isNativeUmfCoreError(error),host=isHostJsonResponseError(error),binding=isDbtHostError(error),code=domainCode(error);
   if(!(native||host||binding)||CONTROL_ERROR_CODES.has((error as {code?:string})?.code??''))throw error;
   if(!code)throw error;
   const candidate=error as {code?:unknown;message?:unknown;path?:unknown};
   throw new UmfError(code,String(candidate.message??''),typeof candidate.path==='string'?candidate.path:'');
  }
 };
 return Object.freeze({
  importDbtManifest:(text,options)=>call<ReturnType<typeof importDbtManifest>>(()=>engine.importDbtManifest(text,options)),
  exportDbtManifest:document=>call<ReturnType<typeof exportDbtManifest>>(()=>engine.exportDbtManifest(document)),
  inspectDbtManifest:document=>call<ReturnType<typeof inspectDbtManifest>>(()=>engine.inspectDbtManifest(document)),
  getDbtManifestNode:(document,path)=>call<ReturnType<typeof getDbtManifestNode>>(()=>engine.getDbtManifestNode(document,path)),
  proposeDbtManifestNodeEdit:(document,path,text)=>call<ReturnType<typeof proposeDbtManifestNodeEdit>>(()=>engine.proposeDbtManifestNodeEdit(document,path,text)),
  importDbtArtifact:(text,options)=>call<ReturnType<typeof importDbtArtifact>>(()=>engine.importDbtArtifact(text,options)),
  exportDbtArtifact:document=>call<ReturnType<typeof exportDbtArtifact>>(()=>engine.exportDbtArtifact(document)),
  inspectDbtArtifact:document=>call<ReturnType<typeof inspectDbtArtifact>>(()=>engine.inspectDbtArtifact(document)),
  getDbtArtifactNode:(document,path)=>call<ReturnType<typeof getDbtArtifactNode>>(()=>engine.getDbtArtifactNode(document,path)),
  proposeDbtArtifactNodeEdit:(document,path,text)=>call<ReturnType<typeof proposeDbtArtifactNodeEdit>>(()=>engine.proposeDbtArtifactNodeEdit(document,path,text)),
  importDbtSemanticManifest:(text,options)=>call<ReturnType<typeof importDbtSemanticManifest>>(()=>engine.importDbtSemanticManifest(text,options)),
  exportDbtSemanticManifest:document=>call<ReturnType<typeof exportDbtSemanticManifest>>(()=>engine.exportDbtSemanticManifest(document)),
  inspectDbtSemanticManifest:document=>call<ReturnType<typeof inspectDbtSemanticManifest>>(()=>engine.inspectDbtSemanticManifest(document)),
  getDbtSemanticManifestNode:(document,path)=>call<ReturnType<typeof getDbtSemanticManifestNode>>(()=>engine.getDbtSemanticManifestNode(document,path)),
  proposeDbtSemanticManifestNodeEdit:(document,path,text)=>call<ReturnType<typeof proposeDbtSemanticManifestNodeEdit>>(()=>engine.proposeDbtSemanticManifestNodeEdit(document,path,text)),
  inspectDbtManifestGraph:document=>call<ReturnType<typeof inspectDbtManifestGraph>>(()=>engine.inspectDbtManifestGraph(document)),
  selectDbtManifestDependencies:(document,options)=>call<ReturnType<typeof selectDbtManifestDependencies>>(()=>engine.selectDbtManifestDependencies(document,options)),
 });
}
