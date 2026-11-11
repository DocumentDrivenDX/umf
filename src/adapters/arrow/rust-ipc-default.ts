// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../../model/errors';
import type {ArrowIpcCaptureInspection,ArrowIpcConsistency,ArrowIpcLayout,ArrowIpcObservationBackend,ArrowIpcObservationResult,ArrowIpcRenameResult,ArrowSchemaIpcBackend} from './api-types';
import type {ArrowFlatbufferEncodingBackend} from './api-types';
import {copyJson} from '../../model/json';
import type {Document} from '../../model/types';

type NativeCoreErrorGuard=(error:unknown)=>boolean;
type BindingUmfErrorGuard=(error:unknown)=>boolean;
type NativeFlatbufferCodec={importModel(text:string,id:string):Document;encode(document:Document):Uint8Array};
type StrictJsonCopy=(value:unknown)=>unknown;
const CONTROL_CODES=new Set(['RESOURCE_LIMIT','LIMIT','CAPACITY','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
function isControlFailure(error:unknown):boolean{return typeof (error as {code?:unknown}|null)?.code==='string'&&CONTROL_CODES.has((error as {code:string}).code);}
function bytesFromHex(value:string):Uint8Array{if(typeof value!=='string'||value.length%2!==0||!/^[0-9a-f]*$/.test(value))throw new TypeError('Rust Arrow IPC observation returned invalid lowercase hexadecimal bytes');const bytes=new Uint8Array(value.length/2);for(let index=0;index<bytes.length;index++)bytes[index]=Number.parseInt(value.slice(index*2,index*2+2),16);return bytes;}
function observationMessage(error:unknown):string{return error instanceof Error?error.message:'Native observation failed';}

export interface ArrowIpcRustEngine {
 captureArrowIpc(bytes:Uint8Array,options:{id:string}):unknown;
 exportArrowIpcCapture(document:unknown):Uint8Array;
 inspectArrowIpcCapture(document:unknown):unknown;
 inspectArrowIpcLayout(document:unknown):unknown;
 inspectArrowIpcConsistency(document:unknown):unknown;
 prepareArrowSchemaIpc(document:unknown):unknown;
 completeArrowSchemaIpc(document:unknown,beforeJson:string,afterJson:string,bytesHex:string):unknown;
 exportArrowSchemaIpcNative(document:unknown):Uint8Array;
 prepareArrowIpcRename(document:unknown,request:unknown):unknown;
 prepareArrowIpcRenameFooter(document:unknown,request:unknown,schemaHex:string):unknown;
 completeArrowIpcRename(document:unknown,request:unknown,schemaHex:string,footerHex:string|null):unknown;
 renameArrowIpcFieldNative(document:unknown,request:unknown):unknown;
 prepareArrowIpcObservation(document:unknown):unknown;
 completeArrowIpcObservation(prepared:unknown,outcome:unknown):unknown;
}

function publicError(error:unknown,isNativeUmfCoreError:NativeCoreErrorGuard,isBindingUmfError:BindingUmfErrorGuard):never {
 const candidate=error as {name?:unknown;code?:unknown;message?:unknown;path?:unknown}|null;
 if(isNativeUmfCoreError(error)&&candidate?.name==='UmfCoreError'&&
  typeof candidate.code==='string'&&(candidate.code.startsWith('ARROW_IPC_')||candidate.code.startsWith('ARROW_FLATBUFFER_')||candidate.code==='ARROW_DOCUMENT'||candidate.code==='ARROW_EXPORT'||candidate.code==='ARROW_BACKEND'))
  throw new UmfError(candidate.code,String(candidate.message??''),typeof candidate.path==='string'?candidate.path:'');
 if(isBindingUmfError(error)&&candidate?.name==='UmfError'&&typeof candidate.code==='string')
  throw new UmfError(candidate.code,String(candidate.message??''),typeof candidate.path==='string'?candidate.path:'');
 throw error;
}

/** Bind Rust-owned Arrow IPC operations to the public V4 error type. */
export function bindArrowIpcRust(
 engine:ArrowIpcRustEngine,
 strictJsonCopy:StrictJsonCopy,
 isNativeUmfCoreError:NativeCoreErrorGuard=()=>false,
 isBindingUmfError:BindingUmfErrorGuard=()=>false,
 nativeFlatbuffer?:NativeFlatbufferCodec,
){
 const call=<T>(operation:()=>T):T=>{
  try{return operation();}
  catch(error){return publicError(error,isNativeUmfCoreError,isBindingUmfError);}
 };
 return Object.freeze({
  captureArrowIpc(bytes:Uint8Array,options:{id:string}):Document{
   return call(()=>engine.captureArrowIpc(bytes,options)) as Document;
  },
  exportArrowIpcCapture(document:unknown):Uint8Array{
   return call(()=>engine.exportArrowIpcCapture(document)) as Uint8Array;
  },
  inspectArrowIpcCapture(document:unknown):ArrowIpcCaptureInspection{
   return call(()=>engine.inspectArrowIpcCapture(document)) as ArrowIpcCaptureInspection;
  },
  inspectArrowIpcLayout(document:unknown):ArrowIpcLayout{
   return call(()=>engine.inspectArrowIpcLayout(document)) as ArrowIpcLayout;
  },
  inspectArrowIpcConsistency(document:unknown):ArrowIpcConsistency{
   return call(()=>engine.inspectArrowIpcConsistency(document)) as ArrowIpcConsistency;
  },
  observeArrowIpcCapture(document:Document,backend:ArrowIpcObservationBackend):ArrowIpcObservationResult{
   if(backend?.identity!=='apache-arrow@21.2.0'||typeof backend.observe!=='function')throw new UmfError('ARROW_BACKEND','Expected explicit pinned IPC observation backend');
   const prepared=call(()=>engine.prepareArrowIpcObservation(document)) as {bytesHex:string};
   const bytes=bytesFromHex(prepared.bytesHex);
   let outcome:{backend:string;status:'observed';schema:unknown}|{backend:string;status:'uninterpreted';message:string};
   try{
    const schema=strictJsonCopy(backend.observe(bytes));
    outcome={backend:backend.identity,status:'observed',schema};
   }catch(error){
    if(isControlFailure(error))throw error;
    outcome={backend:backend.identity,status:'uninterpreted',message:observationMessage(error)};
   }
   return call(()=>engine.completeArrowIpcObservation(prepared,outcome)) as ArrowIpcObservationResult;
  },
  renameArrowIpcField(document:Document,request:{fieldPath:number[];name:string;uninterpretedMetadata:'preserve-and-report'},backend?:ArrowFlatbufferEncodingBackend):ArrowIpcRenameResult{
   if(backend!==undefined&&(backend?.identity!=='flatbuffers@25.9.23'||typeof backend.encode!=='function'))throw new UmfError('ARROW_BACKEND','Expected explicit pinned FlatBuffers backend');
   if(backend===undefined)return call(()=>engine.renameArrowIpcFieldNative(document,request)) as ArrowIpcRenameResult;
   const encodeModel=(modelText:string,id:string):Uint8Array=>{
    if(backend)return backend.encode(JSON.parse(modelText));
    if(!nativeFlatbuffer)throw new UmfError('ARROW_BACKEND','Native FlatBuffer encoder is unavailable');
    return nativeFlatbuffer.encode(nativeFlatbuffer.importModel(modelText,id));
   };
   const prepared=call(()=>engine.prepareArrowIpcRename(document,request)) as {schemaModel:string};
   const schemaBytes=encodeModel(prepared.schemaModel,`${document.id}/renamed-schema`);
   if(!(schemaBytes instanceof Uint8Array)||!schemaBytes.length||schemaBytes.length>1_000_000)throw new UmfError('ARROW_FLATBUFFER_BYTES','Expected bounded metadata bytes');
   const schemaHex=Array.from(schemaBytes,b=>b.toString(16).padStart(2,'0')).join('');
   const footerModel=call(()=>engine.prepareArrowIpcRenameFooter(document,request,schemaHex)) as string|null;
   let footerHex:string|null=null;
   if(footerModel!==null){const footerBytes=encodeModel(footerModel,`${document.id}/renamed-footer`);if(!(footerBytes instanceof Uint8Array)||!footerBytes.length||footerBytes.length>1_000_000)throw new UmfError('ARROW_FLATBUFFER_BYTES','Expected bounded metadata bytes');footerHex=Array.from(footerBytes,b=>b.toString(16).padStart(2,'0')).join('');}
   return call(()=>engine.completeArrowIpcRename(document,request,schemaHex,footerHex)) as ArrowIpcRenameResult;
  },
  exportArrowSchemaIpc(document:Document,backend?:ArrowSchemaIpcBackend):Uint8Array{
   if(backend!==undefined&&(backend?.identity!=='apache-arrow@21.2.0'||typeof backend.encode!=='function'))throw new UmfError('ARROW_BACKEND','Expected explicit pinned Arrow schema backend');
   if(backend===undefined){
    return call(()=>engine.exportArrowSchemaIpcNative(document)) as Uint8Array;
   }
   const prepared=call(()=>engine.prepareArrowSchemaIpc(document)) as {schema:string};
   const input=copyJson(JSON.parse(prepared.schema));
   let bytes:Uint8Array,beforeJson:string,afterJson:string;
   if(backend){
    const encoded=backend.encode(input);
    if(!(encoded?.bytes instanceof Uint8Array))throw new UmfError('ARROW_IPC_BYTES','Expected bounded native schema IPC bytes');
    bytes=encoded.bytes;beforeJson=JSON.stringify(encoded.before);afterJson=JSON.stringify(encoded.after);
   }else{
    if(!nativeFlatbuffer)throw new UmfError('ARROW_BACKEND','Native FlatBuffer encoder is unavailable');
    const model=nativeFlatbuffer.importModel(JSON.stringify({rootType:'Schema',value:input}),`${document.id}/schema-ipc`);
    bytes=nativeFlatbuffer.encode(model);beforeJson=JSON.stringify(input);afterJson=beforeJson;
   }
   if(typeof beforeJson!=='string'||typeof afterJson!=='string')throw new UmfError('ARROW_IPC_DECODE_LOSS','Native schema decoding changed captured semantics');
   const bytesHex=Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
   const returned=call(()=>engine.completeArrowSchemaIpc(document,beforeJson,afterJson,bytesHex)) as string;
   if(typeof returned!=='string'||returned.length%2!==0||!/^[0-9a-f]+$/.test(returned))throw new TypeError('Rust Arrow IPC export returned invalid lowercase hexadecimal bytes');
   const decodedBytes=new Uint8Array(returned.length/2);
   for(let index=0;index<bytes.length;index++)decodedBytes[index]=Number.parseInt(returned.slice(index*2,index*2+2),16);
   return decodedBytes;
  },
 });
}
