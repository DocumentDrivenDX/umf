// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic,ExtensionPackage,Json} from '../../model/types';
import type {NativeJson} from '../../model/native-json';
import type {Registry} from '../../registry/registry';
import {UmfError} from '../../model/errors';
import manifest from '../../../spec/extensions/jsonld/package.json';
import type {Validation} from "../../model/types";
import type {GeneralizedRdfToJsonLdReport,JsonLdCompactionReport,JsonLdExpansionReport,JsonLdFlattenReport,JsonLdFramingOptions,JsonLdFramingReport,JsonLdToRdfReport,RdfToJsonLdReport} from "./index";

type ImportJsonLdDocument = (text: string, options: { id: string; baseIRI: string; processingMode?: "json-ld-1.0" | "json-ld-1.1"; contexts?: { url: string; documentUrl?: string; text: string; }[]; expandContext?: string; }) => Document;
type InspectJsonLdDocument = (document: Document) => Validation;
type ExportJsonLdDocument = (document: Document) => string;
type GetJsonLdNode = (document: Document, path: string) => NativeJson;
type ProposeJsonLdNodeEdit = (document: Document, path: string, text: string) => { document: Document; validation: Validation; };
type ProposeJsonLdExpansion = (document: Document, options: { lossPolicy: "report" | "reject"; }) => Promise<JsonLdExpansionReport>;
type ProposeJsonLdFlatten = (document: Document, options: { lossPolicy: "report" | "reject"; context?: string; compactArrays?: boolean; }) => Promise<JsonLdFlattenReport>;
type ProposeJsonLdCompaction = (document: Document, options: { lossPolicy: "report" | "reject"; context: string; compactArrays?: boolean; compactToRelative?: boolean; }) => Promise<JsonLdCompactionReport>;
type ProposeJsonLdFraming = (document: Document, options: Omit<JsonLdFramingOptions, "embed"> & { embed?: boolean | "@once" | "@always" | "@never" | "@first" | "@last" | undefined; frame: string; lossPolicy: "report" | "reject"; }) => Promise<JsonLdFramingReport>;
type ProposeJsonLdToRdf = (document: Document, options: { id: string; produceGeneralizedRdf?: boolean; numericPolicy?: "strict" | "binary64"; lossPolicy: "report" | "reject"; rdfDirection?: "i18n-datatype" | "compound-literal" | null; }) => Promise<JsonLdToRdfReport>;
type ProposeRdfToJsonLd = (document: Document, options: { id: string; baseIRI: string; processingMode?: "json-ld-1.0" | "json-ld-1.1"; lossPolicy: "report" | "reject"; useNativeTypes?: boolean; useRdfType?: boolean; rdfDirection?: "i18n-datatype" | "compound-literal" | null; }) => Promise<RdfToJsonLdReport>;
type ProposeGeneralizedRdfToJsonLd = (document: Document, options: { id: string; baseIRI: string; processingMode: "json-ld-1.0" | "json-ld-1.1"; lossPolicy: "report" | "reject"; }) => Promise<GeneralizedRdfToJsonLdReport>;

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
export function createJsonLdRustDefault(engine:JsonLdNativeFamilyEngine,isNativeUmfCoreError:NativeCoreErrorGuard=()=>false,createRegistry:()=>Registry){
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
   return createRegistry().register(manifest as unknown as ExtensionPackage,(payload)=>call<Diagnostic[]>(()=>engine.jsonld.inspectPayload({payload})));
  },
  importJsonLdDocument(text:string,options:Parameters<ImportJsonLdDocument>[1]):ReturnType<ImportJsonLdDocument>{
   const {id,baseIRI,processingMode,contexts,expandContext}=options;
   return call(()=>engine.jsonld.import({source:text,id,baseIRI,...(processingMode===undefined?{}:{processingMode}),...(contexts===undefined?{}:{contexts}),...(expandContext===undefined?{}:{expandContext})}) as ReturnType<ImportJsonLdDocument>);
  },
  inspectJsonLdDocument(document:Parameters<InspectJsonLdDocument>[0]):ReturnType<InspectJsonLdDocument>{
   return call(()=>engine.jsonld.validate({document}) as ReturnType<InspectJsonLdDocument>);
  },
  exportJsonLdDocument(document:Parameters<ExportJsonLdDocument>[0]):ReturnType<ExportJsonLdDocument>{
   return call(()=>engine.jsonld.export({document}) as ReturnType<ExportJsonLdDocument>);
  },
  getJsonLdNode(document:Parameters<GetJsonLdNode>[0],path:Parameters<GetJsonLdNode>[1]):ReturnType<GetJsonLdNode>{
   return call(()=>engine.jsonld.getNode({document,pointer:path}) as NativeJson as ReturnType<GetJsonLdNode>);
  },
  proposeJsonLdNodeEdit(document:Parameters<ProposeJsonLdNodeEdit>[0],path:Parameters<ProposeJsonLdNodeEdit>[1],text:Parameters<ProposeJsonLdNodeEdit>[2]):ReturnType<ProposeJsonLdNodeEdit>{
   return call(()=>engine.jsonld.editNode({document,pointer:path,replacementJson:text}) as ReturnType<ProposeJsonLdNodeEdit>);
  },
  proposeJsonLdExpansion(document:Parameters<ProposeJsonLdExpansion>[0],options:Parameters<ProposeJsonLdExpansion>[1]):ReturnType<ProposeJsonLdExpansion>{
   return Promise.resolve().then(()=>call(()=>engine.jsonld.expand({...options,document}) as Awaited<ReturnType<ProposeJsonLdExpansion>>)) as ReturnType<ProposeJsonLdExpansion>;
  },
  proposeJsonLdFlatten(document:Parameters<ProposeJsonLdFlatten>[0],options:Parameters<ProposeJsonLdFlatten>[1]):ReturnType<ProposeJsonLdFlatten>{
   return Promise.resolve().then(()=>call(()=>engine.jsonld.flatten({...options,document}) as Awaited<ReturnType<ProposeJsonLdFlatten>>)) as ReturnType<ProposeJsonLdFlatten>;
  },
  proposeJsonLdCompaction(document:Parameters<ProposeJsonLdCompaction>[0],options:Parameters<ProposeJsonLdCompaction>[1]):ReturnType<ProposeJsonLdCompaction>{
   return Promise.resolve().then(()=>call(()=>engine.jsonld.compact({...options,document}) as Awaited<ReturnType<ProposeJsonLdCompaction>>)) as ReturnType<ProposeJsonLdCompaction>;
  },
  proposeJsonLdFraming(document:Parameters<ProposeJsonLdFraming>[0],options:Parameters<ProposeJsonLdFraming>[1]):ReturnType<ProposeJsonLdFraming>{
   return Promise.resolve().then(()=>call(()=>engine.jsonld.frame({...options,document}) as Awaited<ReturnType<ProposeJsonLdFraming>>)) as ReturnType<ProposeJsonLdFraming>;
  },
  proposeJsonLdToRdf(document:Parameters<ProposeJsonLdToRdf>[0],options:Parameters<ProposeJsonLdToRdf>[1]):ReturnType<ProposeJsonLdToRdf>{
   return Promise.resolve().then(()=>call(()=>engine.jsonld.toRdf({...options,document}) as Awaited<ReturnType<ProposeJsonLdToRdf>>)) as ReturnType<ProposeJsonLdToRdf>;
  },
  proposeRdfToJsonLd(document:Parameters<ProposeRdfToJsonLd>[0],options:Parameters<ProposeRdfToJsonLd>[1]):ReturnType<ProposeRdfToJsonLd>{
   return Promise.resolve().then(()=>call(()=>engine.jsonld.fromRdf({...options,document}) as Awaited<ReturnType<ProposeRdfToJsonLd>>)) as ReturnType<ProposeRdfToJsonLd>;
  },
  proposeGeneralizedRdfToJsonLd(document:Parameters<ProposeGeneralizedRdfToJsonLd>[0],options:Parameters<ProposeGeneralizedRdfToJsonLd>[1]):ReturnType<ProposeGeneralizedRdfToJsonLd>{
   return Promise.resolve().then(()=>call(()=>engine.jsonld.fromGeneralizedRdf({...options,document}) as Awaited<ReturnType<ProposeGeneralizedRdfToJsonLd>>)) as ReturnType<ProposeGeneralizedRdfToJsonLd>;
  },
 });
}
