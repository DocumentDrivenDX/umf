// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic,ExtensionPackage,Json} from '../../model/types';
import type {NativeJson} from '../../model/native-json';
import {UmfError} from '../../model/errors';
import {Registry} from '../../registry/registry';
import manifest from '../../../spec/extensions/openapi/package.json';
import type {
 exportOpenapiBundle,exportOpenapiDocument,getOpenapiNode,importOpenapiDocument,inspectOpenapi,lookupOpenapiResource,proposeOpenapiEdit,
} from './index';
import type {extractOpenapiSchema} from './extraction';
import type {indexOpenapiSchemas,resolveOpenapiSchemaReference} from './scope';
import type {resolveOpenapiDynamicReference} from './dynamic';
import type {resolveOpenapiObjectReference} from './references';

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
export function createOpenapiRustDefault(engine:OpenapiNativeFamilyEngine,isNativeUmfCoreError:NativeCoreErrorGuard=()=>false,createRegistry:()=>Registry=()=>new Registry()){
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
  importOpenapiDocument(text:string,options:Parameters<typeof importOpenapiDocument>[1]):ReturnType<typeof importOpenapiDocument>{
   const {id,format,baseUri,resources}=options;
   return call(()=>engine.openapi.import({source:text,id,format,...(baseUri===undefined?{}:{baseUri}),...(resources===undefined?{}:{resources})}) as ReturnType<typeof importOpenapiDocument>);
  },
  inspectOpenapi(document:Parameters<typeof inspectOpenapi>[0]):ReturnType<typeof inspectOpenapi>{
   return call(()=>engine.openapi.validate({document}) as ReturnType<typeof inspectOpenapi>);
  },
  exportOpenapiDocument(document:Parameters<typeof exportOpenapiDocument>[0],format?:Parameters<typeof exportOpenapiDocument>[1]):ReturnType<typeof exportOpenapiDocument>{
   return call(()=>engine.openapi.export({document,...(format===undefined?{}:{format})}) as ReturnType<typeof exportOpenapiDocument>);
  },
  getOpenapiNode(document:Parameters<typeof getOpenapiNode>[0],path:Parameters<typeof getOpenapiNode>[1],resourceUri?:Parameters<typeof getOpenapiNode>[2]):ReturnType<typeof getOpenapiNode>{
   return call(()=>engine.openapi.getNode({document,pointer:path,...(resourceUri===undefined?{}:{resourceUri})}) as NativeJson as ReturnType<typeof getOpenapiNode>);
  },
  lookupOpenapiResource(document:Parameters<typeof lookupOpenapiResource>[0],reference:Parameters<typeof lookupOpenapiResource>[1],fromUri?:Parameters<typeof lookupOpenapiResource>[2]):ReturnType<typeof lookupOpenapiResource>{
   return call(()=>engine.openapi.lookupResource({document,reference,...(fromUri===undefined?{}:{fromUri})}) as ReturnType<typeof lookupOpenapiResource>);
  },
  extractOpenapiSchema(document:Parameters<typeof extractOpenapiSchema>[0],input:Parameters<typeof extractOpenapiSchema>[1]):ReturnType<typeof extractOpenapiSchema>{
   const {pointer,resourceUri}=input;
   return call(()=>engine.openapi.extractSchema({document,pointer,...(resourceUri===undefined?{}:{resourceUri})}) as ReturnType<typeof extractOpenapiSchema>);
  },
  indexOpenapiSchemas(document:Parameters<typeof indexOpenapiSchemas>[0],input:Parameters<typeof indexOpenapiSchemas>[1]={}):ReturnType<typeof indexOpenapiSchemas>{
   const {schemaResources}=input;
   return call(()=>engine.openapi.indexSchemas({document,...(schemaResources===undefined?{}:{schemaResources})}) as ReturnType<typeof indexOpenapiSchemas>);
  },
  resolveOpenapiSchemaReference(document:Parameters<typeof resolveOpenapiSchemaReference>[0],input:Parameters<typeof resolveOpenapiSchemaReference>[1]):ReturnType<typeof resolveOpenapiSchemaReference>{
   const {pointer,reference,resourceUri,schemaResources}=input;
   return call(()=>engine.openapi.resolveSchemaReference({document,pointer,reference,...(resourceUri===undefined?{}:{resourceUri}),...(schemaResources===undefined?{}:{schemaResources})}) as ReturnType<typeof resolveOpenapiSchemaReference>);
  },
  resolveOpenapiDynamicReference(document:Parameters<typeof resolveOpenapiDynamicReference>[0],input:Parameters<typeof resolveOpenapiDynamicReference>[1]):ReturnType<typeof resolveOpenapiDynamicReference>{
   const {pointer,resourceUri,schemaResources,evaluationScope}=input;
   return call(()=>engine.openapi.resolveDynamicReference({document,pointer,...(resourceUri===undefined?{}:{resourceUri}),...(schemaResources===undefined?{}:{schemaResources}),evaluationScope}) as ReturnType<typeof resolveOpenapiDynamicReference>);
  },
  resolveOpenapiObjectReference(document:Parameters<typeof resolveOpenapiObjectReference>[0],input:Parameters<typeof resolveOpenapiObjectReference>[1]):ReturnType<typeof resolveOpenapiObjectReference>{
   const {pointer,kind,resourceUri}=input;
   return call(()=>engine.openapi.resolveObjectReference({document,pointer,kind,...(resourceUri===undefined?{}:{resourceUri})}) as ReturnType<typeof resolveOpenapiObjectReference>);
  },
  exportOpenapiBundle(document:Parameters<typeof exportOpenapiBundle>[0]):ReturnType<typeof exportOpenapiBundle>{
   return call(()=>engine.openapi.exportBundle({document}) as ReturnType<typeof exportOpenapiBundle>);
  },
  proposeOpenapiEdit(document:Parameters<typeof proposeOpenapiEdit>[0],path:Parameters<typeof proposeOpenapiEdit>[1],json:Parameters<typeof proposeOpenapiEdit>[2],resourceUri?:Parameters<typeof proposeOpenapiEdit>[3]):ReturnType<typeof proposeOpenapiEdit>{
   return call(()=>engine.openapi.edit({document,pointer:path,replacementJson:json,...(resourceUri===undefined?{}:{resourceUri})}) as ReturnType<typeof proposeOpenapiEdit>);
  },
 });
}
