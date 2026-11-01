// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError,type Document,type Diagnostic} from '../model/types';
import type {ProtobufProjection,ProtobufProjectionOptions} from './json-schema-protobuf';
import type {ProtobufSourceCompiler} from '../adapters/protobuf/source';

type Guard=(error:unknown)=>boolean;
type NativeEngine={['json-schema-protobuf-projection']:{projectJsonSchemaToProtobuf(fields:{source:Document;policy:ProtobufProjectionOptions}):unknown}};
type ImportSources=(input:{files:Record<string,string>;roots:string[]},compiler:ProtobufSourceCompiler,options:{id:string})=>Promise<unknown>;
type InspectProtobuf=(document:Document)=>{diagnostics:Diagnostic[]};
const CONTROL_CODES=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);

function nativeFailure(error:unknown,guard:Guard):never{
 if(!guard(error))throw error;
 const native=error as {code?:unknown;message?:unknown;path?:unknown};
 if(typeof native.code!=='string'||CONTROL_CODES.has(native.code)||(!native.code.startsWith('JSON_SCHEMA_')&&!native.code.startsWith('PROJECTION_')&&native.code!=='REQUEST'))throw error;
 throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');
}

/** Rust owns projection decisions; the caller's protobuf compiler remains an explicit host capability. */
export function createJsonSchemaProtobufRustDefault(engine:NativeEngine,importSources:ImportSources,inspectProtobuf:InspectProtobuf,isNativeError:Guard=()=>false){
 const call=<T>(operation:()=>unknown):T=>{try{return operation() as T;}catch(error){return nativeFailure(error,isNativeError);}};
 return Object.freeze({
  async projectJsonSchemaToProtobuf(source:Document,policy:ProtobufProjectionOptions,compiler:ProtobufSourceCompiler):Promise<ProtobufProjection>{
   const plan=call<ProtobufProjection>(()=>engine['json-schema-protobuf-projection'].projectJsonSchemaToProtobuf({source,policy}));
   if(plan.status==='blocked')return plan;
   try{
    const target=await importSources({files:{'projection.proto':plan.nativeSource!},roots:['projection.proto']},compiler,{id:plan.policy.id}) as Document;
    const targetDiagnostics=inspectProtobuf(target).diagnostics;
    return {...plan,target,targetDiagnostics};
   }catch(error){
    if(error&&typeof error==='object'&&typeof (error as {code?:unknown}).code==='string'&&CONTROL_CODES.has((error as {code:string}).code))throw error;
    return {...plan,status:'blocked',issues:[...plan.issues,{path:'',code:'COMPILER_REJECTED',classification:'unsupported',detail:String(error),retainedInSource:true}]};
   }
  },
 });
}
