// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError,type Document} from '../model/types';
import type {TypeSpecJsonSchemaEmission} from '../adapters/typespec/report-types';
import type {TypeSpecJsonSchemaPolicy} from './typespec-json-schema-types';
import type {SmithyJsonSchemaBackend,SmithyJsonSchemaPolicy,SmithyJsonSchemaProjection} from './smithy-json-schema-types';
import type {SmithyAssemblyResult} from '../adapters/smithy/assembly';
import type {ProjectionIssue} from './json-schema-protobuf';

type Guard=(error:unknown)=>boolean;
type Engine={['typespec-smithy-jsonschema-projection']:Record<'prepareTypeSpecJsonSchema'|'completeTypeSpecJsonSchema'|'prepareSmithyJsonSchema'|'completeSmithyJsonSchema',(fields?:Record<string,unknown>)=>unknown>};
type Emit=(source:Document,input:{options:Record<string,unknown>})=>Promise<TypeSpecJsonSchemaEmission>;
type Assemble=(source:Document,backend:SmithyJsonSchemaBackend,options:{id:string;signal?:AbortSignal})=>Promise<SmithyAssemblyResult>;
type JsonSchemaProjection={status:'blocked'|'projected';source:Document;policy:TypeSpecJsonSchemaPolicy;complete:false;emission:TypeSpecJsonSchemaEmission;issues:ProjectionIssue[];resources:{file:string;retrievalUri:string}[];target?:Document};
const CONTROL=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
function rethrow(error:unknown,isNative:Guard):never{if(!isNative(error))throw error;const native=error as {code?:unknown;message?:unknown;path?:unknown};if(typeof native.code==='string'&&!CONTROL.has(native.code)&&(native.code.startsWith('TYPESPEC_')||native.code.startsWith('SMITHY_')||native.code==='REQUEST'||native.code==='LIMIT'))throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');throw error;}
function call<T>(run:()=>unknown,isNative:Guard):T{try{return run() as T}catch(error){return rethrow(error,isNative)}}
function callAsync<T>(run:()=>Promise<T>,isNative:Guard):Promise<T>{try{return run().catch(error=>rethrow(error,isNative))}catch(error){return Promise.reject(error).catch(failure=>rethrow(failure,isNative))}}

/** Host callbacks perform only the pinned TypeSpec emitter and Smithy JSON Schema converter work. */
export function createTypeSpecSmithyJsonSchemaRustDefault(engine:Engine,emitTypeSpecJsonSchema:Emit,assembleSmithyDocument:Assemble,isNative:Guard=()=>false){
 return Object.freeze({
  async projectTypeSpecToJsonSchema(source:Document,policy:TypeSpecJsonSchemaPolicy):Promise<JsonSchemaProjection>{
   call(()=>engine['typespec-smithy-jsonschema-projection'].prepareTypeSpecJsonSchema({source,policy}),isNative);
   const emission=await callAsync(()=>emitTypeSpecJsonSchema(source,{options:policy.options}),isNative);
   return call<JsonSchemaProjection>(()=>engine['typespec-smithy-jsonschema-projection'].completeTypeSpecJsonSchema({source,policy,emission}),isNative);
  },
  async projectSmithyToJsonSchema(source:Document,backend:SmithyJsonSchemaBackend,policy:SmithyJsonSchemaPolicy):Promise<SmithyJsonSchemaProjection>{
   if(typeof backend?.jsonSchema!=='function'||typeof backend.converterIdentity!=='string'||!backend.converterIdentity)throw new UmfError('SMITHY_PROJECTION_POLICY','Explicit native emission profile, root shape and loss policy are required');
   const prepared=call<{assemblyId:string}>(()=>engine['typespec-smithy-jsonschema-projection'].prepareSmithyJsonSchema({source,policy}),isNative);
   const assembly=await callAsync(()=>assembleSmithyDocument(source,backend,{id:prepared.assemblyId}),isNative);
   let nativeSchema:string|undefined;let adaptedSchema:string|undefined;let hostFailure:string|undefined;let serviceCapability:boolean|undefined;
   if(assembly.status==='assembled')try{
    if(policy.profile==='native-service-context-2020-12'){
     serviceCapability=typeof backend.jsonSchemaForService==='function';
     if(typeof backend.jsonSchemaForService!=='function')throw new UmfError('SMITHY_EMISSION_CAPABILITY','Backend does not support service-context emission');
     nativeSchema=await backend.jsonSchemaForService(assembly.nativeModel!,policy.rootShape,policy.serviceContext!,false);
     adaptedSchema=await backend.jsonSchemaForService(assembly.nativeModel!,policy.rootShape,policy.serviceContext!,true);
    }else{
     nativeSchema=await backend.jsonSchema(assembly.nativeModel!,policy.rootShape);
     if(policy.profile==='native-root-definition-2020-12'){
      if(typeof backend.jsonSchemaWithRootDefinition!=='function')throw new UmfError('SMITHY_EMISSION_CAPABILITY','Backend does not support root-definition emission');
      adaptedSchema=await backend.jsonSchemaWithRootDefinition(assembly.nativeModel!,policy.rootShape);
     }
    }
   }catch(error){
    if(error instanceof UmfError&&CONTROL.has(error.code))throw error;
    if(error&&typeof error==='object'&&typeof (error as {code?:unknown}).code==='string'&&CONTROL.has((error as {code:string}).code))throw error;
    hostFailure=String(error);
   }
   return call<SmithyJsonSchemaProjection>(()=>engine['typespec-smithy-jsonschema-projection'].completeSmithyJsonSchema({source,policy,assembly,...(nativeSchema===undefined?{}:{nativeSchema}),...(adaptedSchema===undefined?{}:{adaptedSchema}),...(hostFailure===undefined?{}:{hostFailure}),...(serviceCapability===undefined?{}:{serviceCapability})}),isNative);
  },
 });
}
