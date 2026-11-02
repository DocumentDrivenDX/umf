// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic,ExtensionPackage,Json} from '../../model/types';
import type {RdfNode,RdfQuad} from '../rdf';
import type {inspectOwlDocument,importOwlTurtle,exportOwlTurtle,getOwlQuads,proposeOwlQuadEdit,OwlOntologyHeader,getOwlOntologyHeaders} from './index';
import type {OwlExpressionView,getOwlExpressionView} from './expressions';
import type {OwlListAxiomView,getOwlListAxioms} from './list-axioms';
import type {OwlSpecialAxiomView,getOwlSpecialAxioms} from './axioms';
import type {OwlAxiomAnnotations,getOwlAxiomAnnotations} from './annotations';
import type {OwlDeclarationView,getOwlDeclarations} from './declarations';
import {Registry} from '../../registry/registry';
import {UmfError} from '../../model/errors';
import manifest from '../../../spec/extensions/owl/package.json';

export interface OwlNativeFamilyEngine {
 owl:{
  import(fields:{source:string;id:string;baseIRI:string;blankNodeScope?:string}):unknown;
  inspect(fields:{document:Document}):unknown;
  inspectPayload(fields:{payload:Json}):unknown;
  export(fields:{document:Document}):unknown;
  getQuads(fields:{document:Document}):unknown;
  editQuad(fields:{document:Document;index:number;replacement:RdfQuad}):unknown;
  getOntologyHeaders(fields:{document:Document}):unknown;
  getExpressionView(fields:{document:Document;node:RdfNode}):unknown;
  getListAxioms(fields:{document:Document}):unknown;
  getSpecialAxioms(fields:{document:Document}):unknown;
  getAxiomAnnotations(fields:{document:Document;quadIndex:number}):unknown;
  getDeclarations(fields:{document:Document}):unknown;
 }
}
type NativeErrorGuard=(error:unknown)=>boolean;
const CONTROL_CODES=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
const FAMILY_CODES=['OWL_','RDF_','TURTLE_','NATIVE_TURTLE_'];

/** Preserve the existing synchronous OWL facade over the closed native family dispatcher. */
export function createOwlRustDefault(engine:OwlNativeFamilyEngine,isNativeUmfCoreError:NativeErrorGuard=()=>false,createRegistry:()=>Registry=()=>new Registry()){
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
  owlRegistry():Registry{return createRegistry().register(manifest as unknown as ExtensionPackage,(payload)=>call<Diagnostic[]>(()=>engine.owl.inspectPayload({payload})));},
  inspectOwlDocument(document:Parameters<typeof inspectOwlDocument>[0]):ReturnType<typeof inspectOwlDocument>{return call(()=>engine.owl.inspect({document}) as ReturnType<typeof inspectOwlDocument>);},
  importOwlTurtle(text:string,options:Parameters<typeof importOwlTurtle>[1]):ReturnType<typeof importOwlTurtle>{return call(()=>engine.owl.import({source:text,id:options.id,baseIRI:options.baseIRI,...(options.blankNodeScope===undefined?{}:{blankNodeScope:options.blankNodeScope})}) as ReturnType<typeof importOwlTurtle>);},
  exportOwlTurtle(document:Parameters<typeof exportOwlTurtle>[0]):ReturnType<typeof exportOwlTurtle>{return call(()=>engine.owl.export({document}) as ReturnType<typeof exportOwlTurtle>);},
  getOwlQuads(document:Parameters<typeof getOwlQuads>[0]):ReturnType<typeof getOwlQuads>{return call(()=>engine.owl.getQuads({document}) as ReturnType<typeof getOwlQuads>);},
  proposeOwlQuadEdit(document:Parameters<typeof proposeOwlQuadEdit>[0],index:Parameters<typeof proposeOwlQuadEdit>[1],replacement:Parameters<typeof proposeOwlQuadEdit>[2]):ReturnType<typeof proposeOwlQuadEdit>{return call(()=>engine.owl.editQuad({document,index,replacement}) as ReturnType<typeof proposeOwlQuadEdit>);},
  getOwlOntologyHeaders(document:Parameters<typeof getOwlOntologyHeaders>[0]):OwlOntologyHeader[]{return call(()=>engine.owl.getOntologyHeaders({document}) as OwlOntologyHeader[]);},
  getOwlExpressionView(document:Parameters<typeof getOwlExpressionView>[0],node:Parameters<typeof getOwlExpressionView>[1]):OwlExpressionView{return call(()=>engine.owl.getExpressionView({document,node}) as OwlExpressionView);},
  getOwlListAxioms(document:Parameters<typeof getOwlListAxioms>[0]):OwlListAxiomView{return call(()=>engine.owl.getListAxioms({document}) as OwlListAxiomView);},
  getOwlSpecialAxioms(document:Parameters<typeof getOwlSpecialAxioms>[0]):OwlSpecialAxiomView{return call(()=>engine.owl.getSpecialAxioms({document}) as OwlSpecialAxiomView);},
  getOwlAxiomAnnotations(document:Parameters<typeof getOwlAxiomAnnotations>[0],quadIndex:Parameters<typeof getOwlAxiomAnnotations>[1]):OwlAxiomAnnotations{return call(()=>engine.owl.getAxiomAnnotations({document,quadIndex}) as OwlAxiomAnnotations);},
  getOwlDeclarations(document:Parameters<typeof getOwlDeclarations>[0]):OwlDeclarationView{return call(()=>engine.owl.getDeclarations({document}) as OwlDeclarationView);},
 };
 return Object.freeze(api);
}
