// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic,ExtensionPackage,Json} from '../../model/types';
import type {RdfNode,RdfQuad} from '../rdf';
import type {ShaclPath,inspectShaclDocument,importShaclTurtle,exportShaclTurtle,getShaclQuads,proposeShaclQuadEdit,getShaclPropertyPath,evaluateShaclPropertyPath,getShaclTargetNodes} from './index';
import type {ShaclShapeMetadata,getShaclShapeMetadata} from './metadata';
import type {ShaclEngineReport,proposeShaclEngineValidation} from './engine';
export type NativeShaclEngineReport=Omit<ShaclEngineReport,'engine'> & {engine:'umf-shacl-native-subset/2'};
import {Registry} from '../../registry/registry';
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
export function createShaclRustDefault(engine:ShaclNativeFamilyEngine,isNativeUmfCoreError:NativeErrorGuard=()=>false,createRegistry:()=>Registry=()=>new Registry()){
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
  inspectShaclDocument(document:Parameters<typeof inspectShaclDocument>[0]):ReturnType<typeof inspectShaclDocument>{return call(()=>engine.shacl.inspect({document}) as ReturnType<typeof inspectShaclDocument>);},
  importShaclTurtle(text:string,options:Parameters<typeof importShaclTurtle>[1]):ReturnType<typeof importShaclTurtle>{return call(()=>engine.shacl.import({source:text,id:options.id,baseIRI:options.baseIRI,...(options.blankNodeScope===undefined?{}:{blankNodeScope:options.blankNodeScope})}) as ReturnType<typeof importShaclTurtle>);},
  exportShaclTurtle(document:Parameters<typeof exportShaclTurtle>[0]):ReturnType<typeof exportShaclTurtle>{return call(()=>engine.shacl.export({document}) as ReturnType<typeof exportShaclTurtle>);},
  getShaclQuads(document:Parameters<typeof getShaclQuads>[0]):ReturnType<typeof getShaclQuads>{return call(()=>engine.shacl.getQuads({document}) as ReturnType<typeof getShaclQuads>);},
  proposeShaclQuadEdit(document:Parameters<typeof proposeShaclQuadEdit>[0],index:Parameters<typeof proposeShaclQuadEdit>[1],replacement:Parameters<typeof proposeShaclQuadEdit>[2]):ReturnType<typeof proposeShaclQuadEdit>{return call(()=>engine.shacl.editQuad({document,index,replacement}) as ReturnType<typeof proposeShaclQuadEdit>);},
  getShaclPropertyPath(document:Parameters<typeof getShaclPropertyPath>[0],shape:Parameters<typeof getShaclPropertyPath>[1]):ShaclPath{return call(()=>engine.shacl.getPropertyPath({document,shape}) as ShaclPath);},
  evaluateShaclPropertyPath(shapes:Parameters<typeof evaluateShaclPropertyPath>[0],shape:Parameters<typeof evaluateShaclPropertyPath>[1],data:Parameters<typeof evaluateShaclPropertyPath>[2],focus:Parameters<typeof evaluateShaclPropertyPath>[3]):ReturnType<typeof evaluateShaclPropertyPath>{return call(()=>engine.shacl.evaluatePropertyPath({shapes,shape,data,focus}) as ReturnType<typeof evaluateShaclPropertyPath>);},
  getShaclTargetNodes(shapes:Parameters<typeof getShaclTargetNodes>[0],shape:Parameters<typeof getShaclTargetNodes>[1],data:Parameters<typeof getShaclTargetNodes>[2]):ReturnType<typeof getShaclTargetNodes>{return call(()=>engine.shacl.getTargetNodes({shapes,shape,data}) as ReturnType<typeof getShaclTargetNodes>);},
  getShaclShapeMetadata(document:Parameters<typeof getShaclShapeMetadata>[0],shape:Parameters<typeof getShaclShapeMetadata>[1]):ShaclShapeMetadata{return call(()=>engine.shacl.getShapeMetadata({document,shape}) as ShaclShapeMetadata);},
  proposeShaclEngineValidation(shapes:Parameters<typeof proposeShaclEngineValidation>[0],data:Parameters<typeof proposeShaclEngineValidation>[1],options:Parameters<typeof proposeShaclEngineValidation>[2]):Promise<NativeShaclEngineReport>{return Promise.resolve().then(()=>call(()=>engine.shacl.validate({shapes,data,id:options.id,blankNodePolicy:options.blankNodePolicy}) as NativeShaclEngineReport));},
 };
 return Object.freeze(api);
}
