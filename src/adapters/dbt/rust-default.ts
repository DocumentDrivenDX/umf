// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../../model/types';
import type {Diagnostic,ExtensionPackage,Json} from '../../model/types';
import type {Registry as BaseRegistry,SemanticValidator} from '../../registry/registry';
import {composeOwnedSemanticValidator} from '../../registry/semantic-owner';
import {dbtManifestPackage,dbtArtifactPackage,dbtSemanticManifestPackage} from './package';
import type {Document,Validation} from "../../model/types";
import type {NativeJson} from "../../model/native-json";
import type {DbtManifestGraph} from "./graph";
import type {DbtDependencySelection} from "./selection";

type ImportDbtManifest = (text: string, options: { id: string; }) => Document;
type ExportDbtManifest = (document: Document) => string;
type InspectDbtManifest = (document: Document) => Validation;
type GetDbtManifestNode = (document: Document, path: string) => NativeJson;
type ProposeDbtManifestNodeEdit = (document: Document, path: string, text: string) => { document: Document; validation: Validation; };
type ImportDbtArtifact = (text: string, options: { id: string; }) => Document;
type ExportDbtArtifact = (document: Document) => string;
type InspectDbtArtifact = (document: Document) => Validation;
type GetDbtArtifactNode = (document: Document, path: string) => NativeJson;
type ProposeDbtArtifactNodeEdit = (document: Document, path: string, text: string) => { document: Document; validation: Validation; };
type ImportDbtSemanticManifest = (text: string, options: { id: string; }) => Document;
type ExportDbtSemanticManifest = (document: Document) => string;
type InspectDbtSemanticManifest = (document: Document) => Validation;
type GetDbtSemanticManifestNode = (document: Document, path: string) => NativeJson;
type ProposeDbtSemanticManifestNodeEdit = (document: Document, path: string, text: string) => { document: Document; validation: Validation; };
type InspectDbtManifestGraph = (document: Document) => DbtManifestGraph;
type SelectDbtManifestDependencies = (document: Document, options: { roots: string[]; includeMacros?: boolean; maxDepth?: number; maxNodes?: number; }) => DbtDependencySelection;

export interface DbtRustEngine {
 inspectPayload:(token:1|2|3,payload:unknown)=>unknown;
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
 inspectPayload:(token:1|2|3,payload:unknown)=>Diagnostic[];
 importDbtManifest:(text:string,options:{id:string})=>ReturnType<ImportDbtManifest>;
 exportDbtManifest:(document:Parameters<ExportDbtManifest>[0])=>ReturnType<ExportDbtManifest>;
 inspectDbtManifest:(document:Parameters<InspectDbtManifest>[0])=>ReturnType<InspectDbtManifest>;
 getDbtManifestNode:(document:Parameters<GetDbtManifestNode>[0],path:string)=>ReturnType<GetDbtManifestNode>;
 proposeDbtManifestNodeEdit:(document:Parameters<ProposeDbtManifestNodeEdit>[0],path:string,text:string)=>ReturnType<ProposeDbtManifestNodeEdit>;
 importDbtArtifact:(text:string,options:{id:string})=>ReturnType<ImportDbtArtifact>;
 exportDbtArtifact:(document:Parameters<ExportDbtArtifact>[0])=>ReturnType<ExportDbtArtifact>;
 inspectDbtArtifact:(document:Parameters<InspectDbtArtifact>[0])=>ReturnType<InspectDbtArtifact>;
 getDbtArtifactNode:(document:Parameters<GetDbtArtifactNode>[0],path:string)=>ReturnType<GetDbtArtifactNode>;
 proposeDbtArtifactNodeEdit:(document:Parameters<ProposeDbtArtifactNodeEdit>[0],path:string,text:string)=>ReturnType<ProposeDbtArtifactNodeEdit>;
 importDbtSemanticManifest:(text:string,options:{id:string})=>ReturnType<ImportDbtSemanticManifest>;
 exportDbtSemanticManifest:(document:Parameters<ExportDbtSemanticManifest>[0])=>ReturnType<ExportDbtSemanticManifest>;
 inspectDbtSemanticManifest:(document:Parameters<InspectDbtSemanticManifest>[0])=>ReturnType<InspectDbtSemanticManifest>;
 getDbtSemanticManifestNode:(document:Parameters<GetDbtSemanticManifestNode>[0],path:string)=>ReturnType<GetDbtSemanticManifestNode>;
 proposeDbtSemanticManifestNodeEdit:(document:Parameters<ProposeDbtSemanticManifestNodeEdit>[0],path:string,text:string)=>ReturnType<ProposeDbtSemanticManifestNodeEdit>;
 inspectDbtManifestGraph:(document:Parameters<InspectDbtManifestGraph>[0])=>ReturnType<InspectDbtManifestGraph>;
 selectDbtManifestDependencies:(document:Parameters<SelectDbtManifestDependencies>[0],options:Parameters<SelectDbtManifestDependencies>[1])=>ReturnType<SelectDbtManifestDependencies>;
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
  inspectPayload:(token,payload)=>call<Diagnostic[]>(()=>engine.inspectPayload(token,payload)),
  importDbtManifest:(text,options)=>call<ReturnType<ImportDbtManifest>>(()=>engine.importDbtManifest(text,options)),
  exportDbtManifest:document=>call<ReturnType<ExportDbtManifest>>(()=>engine.exportDbtManifest(document)),
  inspectDbtManifest:document=>call<ReturnType<InspectDbtManifest>>(()=>engine.inspectDbtManifest(document)),
  getDbtManifestNode:(document,path)=>call<ReturnType<GetDbtManifestNode>>(()=>engine.getDbtManifestNode(document,path)),
  proposeDbtManifestNodeEdit:(document,path,text)=>call<ReturnType<ProposeDbtManifestNodeEdit>>(()=>engine.proposeDbtManifestNodeEdit(document,path,text)),
  importDbtArtifact:(text,options)=>call<ReturnType<ImportDbtArtifact>>(()=>engine.importDbtArtifact(text,options)),
  exportDbtArtifact:document=>call<ReturnType<ExportDbtArtifact>>(()=>engine.exportDbtArtifact(document)),
  inspectDbtArtifact:document=>call<ReturnType<InspectDbtArtifact>>(()=>engine.inspectDbtArtifact(document)),
  getDbtArtifactNode:(document,path)=>call<ReturnType<GetDbtArtifactNode>>(()=>engine.getDbtArtifactNode(document,path)),
  proposeDbtArtifactNodeEdit:(document,path,text)=>call<ReturnType<ProposeDbtArtifactNodeEdit>>(()=>engine.proposeDbtArtifactNodeEdit(document,path,text)),
  importDbtSemanticManifest:(text,options)=>call<ReturnType<ImportDbtSemanticManifest>>(()=>engine.importDbtSemanticManifest(text,options)),
  exportDbtSemanticManifest:document=>call<ReturnType<ExportDbtSemanticManifest>>(()=>engine.exportDbtSemanticManifest(document)),
  inspectDbtSemanticManifest:document=>call<ReturnType<InspectDbtSemanticManifest>>(()=>engine.inspectDbtSemanticManifest(document)),
  getDbtSemanticManifestNode:(document,path)=>call<ReturnType<GetDbtSemanticManifestNode>>(()=>engine.getDbtSemanticManifestNode(document,path)),
  proposeDbtSemanticManifestNodeEdit:(document,path,text)=>call<ReturnType<ProposeDbtSemanticManifestNodeEdit>>(()=>engine.proposeDbtSemanticManifestNodeEdit(document,path,text)),
  inspectDbtManifestGraph:document=>call<ReturnType<InspectDbtManifestGraph>>(()=>engine.inspectDbtManifestGraph(document)),
  selectDbtManifestDependencies:(document,options)=>call<ReturnType<SelectDbtManifestDependencies>>(()=>engine.selectDbtManifestDependencies(document,options)),
 });
}

/** Construct the three public DBT registries with Rust-owned payload semantics. */
export function createDbtRegistriesRustDefault(
 engine:Pick<DbtOperations,'inspectPayload'>,
 createRegistry:()=>BaseRegistry,
){
 const registry=(manifest:ExtensionPackage,token:1|2|3)=>createRegistry().register(
  manifest,
  composeOwnedSemanticValidator({id:manifest.id,version:manifest.version},(payload:Json)=>engine.inspectPayload(token,payload)),
 );
 return Object.freeze({
  dbtManifestRegistry:()=>registry(dbtManifestPackage,1),
  dbtArtifactRegistry:()=>registry(dbtArtifactPackage,2),
  dbtSemanticManifestRegistry:()=>registry(dbtSemanticManifestPackage,3),
 });
}
