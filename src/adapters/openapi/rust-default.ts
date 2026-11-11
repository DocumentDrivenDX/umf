// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic,ExtensionPackage,Json} from '../../model/types';
import type {NativeJson} from '../../model/native-json';
import {UmfError} from '../../model/errors';
import type {Registry} from '../../registry/registry';
import manifest from '../../../spec/extensions/openapi/package.json';
import type {Validation} from "../../model/types";
import type {OpenapiSchemaExtraction} from "./extraction";
import type {OpenapiSchemaIndex,OpenapiSchemaLocation} from "./scope";
import type {OpenapiReferenceRequest,OpenapiReferenceResolution} from "./references";

type ExportOpenapiBundle = (document: Document) => { resources: { uri: string; text: string; format: "json" | "yaml"; }[]; source: Document; diagnostics: Diagnostic[]; baseUri?: string; schema: string; format: "json" | "yaml"; };
type ExportOpenapiDocument = (document: Document, format?: "json" | "yaml" | undefined) => string;
type GetOpenapiNode = (document: Document, path: string, resourceUri?: string | undefined) => NativeJson;
type ImportOpenapiDocument = (text: string, options: { id: string; format: "json" | "yaml"; baseUri?: string; resources?: { uri: string; text: string; format: "json" | "yaml"; }[]; }) => Document;
type InspectOpenapi = (document: Document) => Validation;
type LookupOpenapiResource = (document: Document, reference: string, fromUri?: string | undefined) => { uri: string; pointer: string; node: NativeJson; interpretation: "literal-document-pointer-only"; };
type ProposeOpenapiEdit = (document: Document, path: string, json: string, resourceUri?: string | undefined) => { document: Document; validation: Validation; };
type ExtractOpenapiSchema = (document: Document, input: { pointer: string; resourceUri?: string; }) => OpenapiSchemaExtraction;
type IndexOpenapiSchemas = (document: Document, input?: { schemaResources?: string[]; }) => OpenapiSchemaIndex;
type ResolveOpenapiSchemaReference = (document: Document, input: { pointer: string; reference: string; resourceUri?: string; schemaResources?: string[]; }) => { source: OpenapiSchemaLocation; target: OpenapiSchemaLocation; node: NativeJson; complete: false; limitations: string[]; };
type ResolveOpenapiDynamicReference = (document: Document, input: { pointer: string; resourceUri?: string; schemaResources?: string[]; evaluationScope: string[]; }) => { source: OpenapiSchemaLocation; initialTarget: OpenapiSchemaLocation; target: OpenapiSchemaLocation; node: NativeJson; evaluationScope: string[]; resolution: "static" | "dynamic"; complete: false; limitations: string[]; };
type ResolveOpenapiObjectReference = (document: Document, input: OpenapiReferenceRequest) => OpenapiReferenceResolution;

export interface OpenapiNativeFamilyEngine {
 openapi: {
  import(fields:{source:string;id:string;format:'json'|'yaml';baseUri?:string;resources?:{uri:string;text:string;format:'json'|'yaml'}[]}):unknown;
  inspectPayload(fields:{payload:Json}):unknown;
  validate(fields:{document:Document}):unknown;
  export(fields:{document:Document;format?:'json'|'yaml'}):unknown;
  exportBundle(fields:{document:Document}):unknown;
  getNode(fields:{document:Document;pointer:string;resourceUri?:string}):unknown;
  lookupResource(fields:{document:Document;reference:string;fromUri?:string}):unknown;
  extractSchema(fields:{document:Document;pointer:string;resourceUri?:string}):unknown;
  indexSchemas(fields:{document:Document;schemaResources?:string[]}):unknown;
  resolveSchemaReference(fields:{document:Document;pointer:string;reference:string;resourceUri?:string;schemaResources?:string[]}):unknown;
  resolveDynamicReference(fields:{document:Document;pointer:string;resourceUri?:string;schemaResources?:string[];evaluationScope:string[]}):unknown;
  resolveObjectReference(fields:{document:Document;pointer:string;kind:string;resourceUri?:string}):unknown;
  edit(fields:{document:Document;pointer:string;replacementJson:string;resourceUri?:string}):unknown;
 }
}

type NativeCoreErrorGuard=(error:unknown)=>boolean;
const CONTROL_CODES=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE']);

/** Keep the existing synchronous OpenAPI operation signatures on the Rust default path. */
export function createOpenapiRustDefault(engine:OpenapiNativeFamilyEngine,isNativeUmfCoreError:NativeCoreErrorGuard=()=>false,createRegistry:()=>Registry){
 const call=<T>(operation:()=>unknown):T=>{
  try{return operation() as T;}
  catch(error){
   if(!isNativeUmfCoreError(error)||CONTROL_CODES.has((error as {code?:string})?.code??''))throw error;
   const native=error as {code?:unknown;message?:unknown;path?:unknown};
   if(typeof native.code==='string'&&(native.code.startsWith('OPENAPI_')||native.code==='REQUEST'||native.code==='JSON_SCHEMA_SYNTAX'||native.code==='JSON_SCHEMA_POINTER'||native.code.startsWith('NATIVE_YAML_')))
    throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');
   throw error;
  }
 };
 return Object.freeze({
  openapiRegistry():Registry{
   return createRegistry().register(manifest as unknown as ExtensionPackage,(payload)=>call<Diagnostic[]>(()=>engine.openapi.inspectPayload({payload})));
  },
  importOpenapiDocument(text:string,options:Parameters<ImportOpenapiDocument>[1]):ReturnType<ImportOpenapiDocument>{
   const {id,format,baseUri,resources}=options;
   return call(()=>engine.openapi.import({source:text,id,format,...(baseUri===undefined?{}:{baseUri}),...(resources===undefined?{}:{resources})}) as ReturnType<ImportOpenapiDocument>);
  },
  inspectOpenapi(document:Parameters<InspectOpenapi>[0]):ReturnType<InspectOpenapi>{
   return call(()=>engine.openapi.validate({document}) as ReturnType<InspectOpenapi>);
  },
  exportOpenapiDocument(document:Parameters<ExportOpenapiDocument>[0],format?:Parameters<ExportOpenapiDocument>[1]):ReturnType<ExportOpenapiDocument>{
   return call(()=>engine.openapi.export({document,...(format===undefined?{}:{format})}) as ReturnType<ExportOpenapiDocument>);
  },
  getOpenapiNode(document:Parameters<GetOpenapiNode>[0],path:Parameters<GetOpenapiNode>[1],resourceUri?:Parameters<GetOpenapiNode>[2]):ReturnType<GetOpenapiNode>{
   return call(()=>engine.openapi.getNode({document,pointer:path,...(resourceUri===undefined?{}:{resourceUri})}) as NativeJson as ReturnType<GetOpenapiNode>);
  },
  lookupOpenapiResource(document:Parameters<LookupOpenapiResource>[0],reference:Parameters<LookupOpenapiResource>[1],fromUri?:Parameters<LookupOpenapiResource>[2]):ReturnType<LookupOpenapiResource>{
   return call(()=>engine.openapi.lookupResource({document,reference,...(fromUri===undefined?{}:{fromUri})}) as ReturnType<LookupOpenapiResource>);
  },
  extractOpenapiSchema(document:Parameters<ExtractOpenapiSchema>[0],input:Parameters<ExtractOpenapiSchema>[1]):ReturnType<ExtractOpenapiSchema>{
   const {pointer,resourceUri}=input;
   return call(()=>engine.openapi.extractSchema({document,pointer,...(resourceUri===undefined?{}:{resourceUri})}) as ReturnType<ExtractOpenapiSchema>);
  },
  indexOpenapiSchemas(document:Parameters<IndexOpenapiSchemas>[0],input:Parameters<IndexOpenapiSchemas>[1]={}):ReturnType<IndexOpenapiSchemas>{
   const {schemaResources}=input;
   return call(()=>engine.openapi.indexSchemas({document,...(schemaResources===undefined?{}:{schemaResources})}) as ReturnType<IndexOpenapiSchemas>);
  },
  resolveOpenapiSchemaReference(document:Parameters<ResolveOpenapiSchemaReference>[0],input:Parameters<ResolveOpenapiSchemaReference>[1]):ReturnType<ResolveOpenapiSchemaReference>{
   const {pointer,reference,resourceUri,schemaResources}=input;
   return call(()=>engine.openapi.resolveSchemaReference({document,pointer,reference,...(resourceUri===undefined?{}:{resourceUri}),...(schemaResources===undefined?{}:{schemaResources})}) as ReturnType<ResolveOpenapiSchemaReference>);
  },
  resolveOpenapiDynamicReference(document:Parameters<ResolveOpenapiDynamicReference>[0],input:Parameters<ResolveOpenapiDynamicReference>[1]):ReturnType<ResolveOpenapiDynamicReference>{
   const {pointer,resourceUri,schemaResources,evaluationScope}=input;
   return call(()=>engine.openapi.resolveDynamicReference({document,pointer,...(resourceUri===undefined?{}:{resourceUri}),...(schemaResources===undefined?{}:{schemaResources}),evaluationScope}) as ReturnType<ResolveOpenapiDynamicReference>);
  },
  resolveOpenapiObjectReference(document:Parameters<ResolveOpenapiObjectReference>[0],input:Parameters<ResolveOpenapiObjectReference>[1]):ReturnType<ResolveOpenapiObjectReference>{
   const {pointer,kind,resourceUri}=input;
   return call(()=>engine.openapi.resolveObjectReference({document,pointer,kind,...(resourceUri===undefined?{}:{resourceUri})}) as ReturnType<ResolveOpenapiObjectReference>);
  },
  exportOpenapiBundle(document:Parameters<ExportOpenapiBundle>[0]):ReturnType<ExportOpenapiBundle>{
   return call(()=>engine.openapi.exportBundle({document}) as ReturnType<ExportOpenapiBundle>);
  },
  proposeOpenapiEdit(document:Parameters<ProposeOpenapiEdit>[0],path:Parameters<ProposeOpenapiEdit>[1],json:Parameters<ProposeOpenapiEdit>[2],resourceUri?:Parameters<ProposeOpenapiEdit>[3]):ReturnType<ProposeOpenapiEdit>{
   return call(()=>engine.openapi.edit({document,pointer:path,replacementJson:json,...(resourceUri===undefined?{}:{resourceUri})}) as ReturnType<ProposeOpenapiEdit>);
  },
 });
}
