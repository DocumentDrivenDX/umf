// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic,ExtensionPackage,Json} from '../../model/types';
import type {NativeJson} from '../../model/native-json';
import {Registry} from '../../registry/registry';
import {UmfError} from '../../model/errors';
import manifest from '../../../spec/extensions/jsonld/package.json';
import type {
 importJsonLdDocument,inspectJsonLdDocument,exportJsonLdDocument,getJsonLdNode,proposeJsonLdNodeEdit,
 proposeJsonLdExpansion,proposeJsonLdFlatten,proposeJsonLdCompaction,proposeJsonLdFraming,
 proposeJsonLdToRdf,proposeRdfToJsonLd,proposeGeneralizedRdfToJsonLd,
} from './index';

export interface JsonLdNativeFamilyEngine {
 jsonld: {
  import(fields:{source:string;id:string;baseIRI:string;processingMode?:string;contexts?:unknown[];expandContext?:string}):unknown;
  inspectPayload(fields:{payload:Json}):unknown;
  validate(fields:{document:Document}):unknown;
  export(fields:{document:Document}):unknown;
  getNode(fields:{document:Document;pointer:string}):unknown;
  editNode(fields:{document:Document;pointer:string;replacementJson:string}):unknown;
  expand(fields:{document:Document;lossPolicy:'report'|'reject'}):unknown;
  flatten(fields:{document:Document;lossPolicy:'report'|'reject';context?:string;compactArrays?:boolean}):unknown;
  compact(fields:{document:Document;lossPolicy:'report'|'reject';context:string;compactArrays?:boolean;compactToRelative?:boolean}):unknown;
  frame(fields:Record<string,unknown>):unknown;
  toRdf(fields:Record<string,unknown>):unknown;
  fromRdf(fields:Record<string,unknown>):unknown;
  fromGeneralizedRdf(fields:Record<string,unknown>):unknown;
 }
}

type NativeCoreErrorGuard=(error:unknown)=>boolean;
const CONTROL_CODES=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE']);

/** Preserve the established JSON-LD API over the native Rust family dispatcher. */
export function createJsonLdRustDefault(engine:JsonLdNativeFamilyEngine,isNativeUmfCoreError:NativeCoreErrorGuard=()=>false){
 const call=<T>(operation:()=>unknown):T=>{
  try{return operation() as T;}
  catch(error){
   if(!isNativeUmfCoreError(error)||CONTROL_CODES.has((error as {code?:string})?.code??''))throw error;
   const native=error as {code?:unknown;message?:unknown;path?:unknown};
   if(typeof native.code==='string'&&(native.code.startsWith('JSONLD_')||native.code==='JSON_SCHEMA_SYNTAX'||native.code==='REQUEST'))
    throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');
   throw error;
  }
 };
 return Object.freeze({
  jsonldRegistry():Registry{
   return new Registry().register(manifest as unknown as ExtensionPackage,(payload)=>call<Diagnostic[]>(()=>engine.jsonld.inspectPayload({payload})));
  },
  importJsonLdDocument(text:string,options:Parameters<typeof importJsonLdDocument>[1]):ReturnType<typeof importJsonLdDocument>{
   const {id,baseIRI,processingMode,contexts,expandContext}=options;
   return call(()=>engine.jsonld.import({source:text,id,baseIRI,...(processingMode===undefined?{}:{processingMode}),...(contexts===undefined?{}:{contexts}),...(expandContext===undefined?{}:{expandContext})}) as ReturnType<typeof importJsonLdDocument>);
  },
  inspectJsonLdDocument(document:Parameters<typeof inspectJsonLdDocument>[0]):ReturnType<typeof inspectJsonLdDocument>{
   return call(()=>engine.jsonld.validate({document}) as ReturnType<typeof inspectJsonLdDocument>);
  },
  exportJsonLdDocument(document:Parameters<typeof exportJsonLdDocument>[0]):ReturnType<typeof exportJsonLdDocument>{
   return call(()=>engine.jsonld.export({document}) as ReturnType<typeof exportJsonLdDocument>);
  },
  getJsonLdNode(document:Parameters<typeof getJsonLdNode>[0],path:Parameters<typeof getJsonLdNode>[1]):ReturnType<typeof getJsonLdNode>{
   return call(()=>engine.jsonld.getNode({document,pointer:path}) as NativeJson as ReturnType<typeof getJsonLdNode>);
  },
  proposeJsonLdNodeEdit(document:Parameters<typeof proposeJsonLdNodeEdit>[0],path:Parameters<typeof proposeJsonLdNodeEdit>[1],text:Parameters<typeof proposeJsonLdNodeEdit>[2]):ReturnType<typeof proposeJsonLdNodeEdit>{
   return call(()=>engine.jsonld.editNode({document,pointer:path,replacementJson:text}) as ReturnType<typeof proposeJsonLdNodeEdit>);
  },
  proposeJsonLdExpansion(document:Parameters<typeof proposeJsonLdExpansion>[0],options:Parameters<typeof proposeJsonLdExpansion>[1]):ReturnType<typeof proposeJsonLdExpansion>{
   return Promise.resolve().then(()=>call(()=>engine.jsonld.expand({...options,document}) as Awaited<ReturnType<typeof proposeJsonLdExpansion>>)) as ReturnType<typeof proposeJsonLdExpansion>;
  },
  proposeJsonLdFlatten(document:Parameters<typeof proposeJsonLdFlatten>[0],options:Parameters<typeof proposeJsonLdFlatten>[1]):ReturnType<typeof proposeJsonLdFlatten>{
   return Promise.resolve().then(()=>call(()=>engine.jsonld.flatten({...options,document}) as Awaited<ReturnType<typeof proposeJsonLdFlatten>>)) as ReturnType<typeof proposeJsonLdFlatten>;
  },
  proposeJsonLdCompaction(document:Parameters<typeof proposeJsonLdCompaction>[0],options:Parameters<typeof proposeJsonLdCompaction>[1]):ReturnType<typeof proposeJsonLdCompaction>{
   return Promise.resolve().then(()=>call(()=>engine.jsonld.compact({...options,document}) as Awaited<ReturnType<typeof proposeJsonLdCompaction>>)) as ReturnType<typeof proposeJsonLdCompaction>;
  },
  proposeJsonLdFraming(document:Parameters<typeof proposeJsonLdFraming>[0],options:Parameters<typeof proposeJsonLdFraming>[1]):ReturnType<typeof proposeJsonLdFraming>{
   return Promise.resolve().then(()=>call(()=>engine.jsonld.frame({...options,document}) as Awaited<ReturnType<typeof proposeJsonLdFraming>>)) as ReturnType<typeof proposeJsonLdFraming>;
  },
  proposeJsonLdToRdf(document:Parameters<typeof proposeJsonLdToRdf>[0],options:Parameters<typeof proposeJsonLdToRdf>[1]):ReturnType<typeof proposeJsonLdToRdf>{
   return Promise.resolve().then(()=>call(()=>engine.jsonld.toRdf({...options,document}) as Awaited<ReturnType<typeof proposeJsonLdToRdf>>)) as ReturnType<typeof proposeJsonLdToRdf>;
  },
  proposeRdfToJsonLd(document:Parameters<typeof proposeRdfToJsonLd>[0],options:Parameters<typeof proposeRdfToJsonLd>[1]):ReturnType<typeof proposeRdfToJsonLd>{
   return Promise.resolve().then(()=>call(()=>engine.jsonld.fromRdf({...options,document}) as Awaited<ReturnType<typeof proposeRdfToJsonLd>>)) as ReturnType<typeof proposeRdfToJsonLd>;
  },
  proposeGeneralizedRdfToJsonLd(document:Parameters<typeof proposeGeneralizedRdfToJsonLd>[0],options:Parameters<typeof proposeGeneralizedRdfToJsonLd>[1]):ReturnType<typeof proposeGeneralizedRdfToJsonLd>{
   return Promise.resolve().then(()=>call(()=>engine.jsonld.fromGeneralizedRdf({...options,document}) as Awaited<ReturnType<typeof proposeGeneralizedRdfToJsonLd>>)) as ReturnType<typeof proposeGeneralizedRdfToJsonLd>;
  },
 });
}
