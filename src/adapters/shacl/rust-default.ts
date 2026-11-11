// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic,ExtensionPackage,Json,Validation} from '../../model/types';
import type {RdfNode,RdfLiteral,RdfQuad} from '../rdf';
import type {ShaclPath} from './path-types';
import type {ShaclShapeMetadata} from './metadata-types';
import type {ShaclEngineReport,ShaclEngineValidationOptions} from './engine-types';
export type NativeShaclEngineReport=ShaclEngineReport;
import type {Registry} from '../../registry/registry';
import {UmfError} from '../../model/errors';
import manifest from '../../../spec/extensions/shacl/package.json';

export interface ShaclNativeFamilyEngine {
 shacl:{
  import(fields:{source:string;id:string;baseIRI:string;blankNodeScope?:string}):unknown;
  inspect(fields:{document:Document}):unknown;
  inspectPayload(fields:{payload:Json}):unknown;
  export(fields:{document:Document}):unknown;
  getQuads(fields:{document:Document}):unknown;
  editQuad(fields:{document:Document;index:number;replacement:RdfQuad}):unknown;
  getPropertyPath(fields:{document:Document;shape:RdfNode}):unknown;
  evaluatePropertyPath(fields:{shapes:Document;shape:RdfNode;data:Document;focus:unknown}):unknown;
  getTargetNodes(fields:{shapes:Document;shape:RdfNode;data:Document}):unknown;
  getShapeMetadata(fields:{document:Document;shape:RdfNode}):unknown;
  validate(fields:{shapes:Document;data:Document;id:string;blankNodePolicy:'disjoint-inputs'|'shared-scope'}):unknown;
 }
}
type NativeErrorGuard=(error:unknown)=>boolean;
const CONTROL_CODES=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
const FAMILY_CODES=['SHACL_','RDF_','TURTLE_','NATIVE_TURTLE_'];

/** Preserve the existing synchronous SHACL facade over the closed native family dispatcher. */
export function createShaclRustDefault(engine:ShaclNativeFamilyEngine,isNativeUmfCoreError:NativeErrorGuard=()=>false,createRegistry:()=>Registry){
 const call=<T>(operation:()=>unknown):T=>{
  try{return operation() as T;}
  catch(error){
   if(!isNativeUmfCoreError(error))throw error;
   const native=error as {code?:unknown;message?:unknown;path?:unknown};
   if(typeof native.code!=='string'||CONTROL_CODES.has(native.code))throw error;
   const code=native.code;
   if(code==='REQUEST'||FAMILY_CODES.some(prefix=>code.startsWith(prefix)))throw new UmfError(code,String(native.message??''),typeof native.path==='string'?native.path:'');
   throw error;
  }
 };
 const api={
  shaclRegistry():Registry{return createRegistry().register(manifest as unknown as ExtensionPackage,(payload)=>call<Diagnostic[]>(()=>engine.shacl.inspectPayload({payload})));},
  inspectShaclDocument(document:Document):Validation{return call(()=>engine.shacl.inspect({document}) as Validation);},
  importShaclTurtle(text:string,options:{id:string;baseIRI:string;blankNodeScope?:string}):Document{return call(()=>engine.shacl.import({source:text,id:options.id,baseIRI:options.baseIRI,...(options.blankNodeScope===undefined?{}:{blankNodeScope:options.blankNodeScope})}) as Document);},
  exportShaclTurtle(document:Document):string{return call(()=>engine.shacl.export({document}) as string);},
  getShaclQuads(document:Document):RdfQuad[]{return call(()=>engine.shacl.getQuads({document}) as RdfQuad[]);},
  proposeShaclQuadEdit(document:Document,index:number,replacement:RdfQuad):{document:Document;validation:Validation}{return call(()=>engine.shacl.editQuad({document,index,replacement}) as {document:Document;validation:Validation});},
  getShaclPropertyPath(document:Document,shape:RdfNode):ShaclPath{return call(()=>engine.shacl.getPropertyPath({document,shape}) as ShaclPath);},
  evaluateShaclPropertyPath(shapes:Document,shape:RdfNode,data:Document,focus:RdfNode|RdfLiteral):(RdfNode|RdfLiteral)[]{return call(()=>engine.shacl.evaluatePropertyPath({shapes,shape,data,focus}) as (RdfNode|RdfLiteral)[]);},
  getShaclTargetNodes(shapes:Document,shape:RdfNode,data:Document):(RdfNode|RdfLiteral)[]{return call(()=>engine.shacl.getTargetNodes({shapes,shape,data}) as (RdfNode|RdfLiteral)[]);},
  getShaclShapeMetadata(document:Document,shape:RdfNode):ShaclShapeMetadata{return call(()=>engine.shacl.getShapeMetadata({document,shape}) as ShaclShapeMetadata);},
  proposeShaclEngineValidation(shapes:Document,data:Document,options:ShaclEngineValidationOptions):Promise<NativeShaclEngineReport>{return Promise.resolve().then(()=>call(()=>engine.shacl.validate({shapes,data,id:options.id,blankNodePolicy:options.blankNodePolicy}) as NativeShaclEngineReport));},
 };
 return Object.freeze(api);
}
