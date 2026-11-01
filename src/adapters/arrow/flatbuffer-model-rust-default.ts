// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError,type Document,type Json,type Validation} from '../../model/types';
import type {ArrowFlatbufferEncodingBackend} from './flatbuffer-encode';
import type {ArrowFlatbufferRoot} from './flatbuffer-decode';

type Guard=(value:unknown)=>boolean;
type Diagnostic={code:string;path:string;severity:'error'|'warning';message:string};
type DecodeResult={source:Document;model?:Document;complete:false;status:'decoded'|'uninterpreted';diagnostics:Diagnostic[]};
interface Engine{['arrow-flatbuffer-model']:{
 importArrowFlatbufferModel(fields:{text:string;id:string}):unknown;
 inspectArrowFlatbufferModel(fields:{document:Document}):unknown;
 exportArrowFlatbufferModel(fields:{document:Document}):unknown;
 proposeArrowFlatbufferEdit(fields:{document:Document;path:string;replacement:Json}):unknown;
 decodeArrowFlatbuffer(fields:{id:string;rootType:ArrowFlatbufferRoot;bytes:string}):unknown;
 prepareArrowFlatbufferEncoding(fields:{document:Document}):unknown;
 verifyArrowFlatbufferEncoding(fields:{document:Document;bytes:string}):unknown;
}}
const CONTROL=new Set(['CANCELLED','DEADLINE','WORK_LIMIT','CONTROL']);
const MAX_BYTES=1_000_000;
function hex(bytes:Uint8Array):string{return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')}

export function createArrowFlatbufferModelRustDefault(engine:Engine,isNativeUmfCoreError:Guard=()=>false){
 function call<T>(operation:()=>unknown):T{
  try{return operation() as T}
  catch(error){
   if(!isNativeUmfCoreError(error))throw error;
   const e=error as {code?:unknown;message?:unknown;path?:unknown};
   if(typeof e.code!=='string'||CONTROL.has(e.code)||(!e.code.startsWith('ARROW_FLATBUFFER_')&&e.code!=='ARROW_IPC_LIMIT'&&e.code!=='REQUEST'&&e.code!=='JSON_SYNTAX'))throw error;
   throw new UmfError(e.code,String(e.message??''),typeof e.path==='string'?e.path:'');
  }
 }
 return Object.freeze({
  importArrowFlatbufferModel(text:string,options:{id:string}):Document{return call(()=>engine['arrow-flatbuffer-model'].importArrowFlatbufferModel({text,id:options.id}))},
  inspectArrowFlatbufferModel(document:Document):Validation{return call(()=>engine['arrow-flatbuffer-model'].inspectArrowFlatbufferModel({document}))},
  exportArrowFlatbufferModel(document:Document):string{return call(()=>engine['arrow-flatbuffer-model'].exportArrowFlatbufferModel({document}))},
  proposeArrowFlatbufferEdit(document:Document,path:string,replacement:Json):{document:Document;validation:Validation}{return call(()=>engine['arrow-flatbuffer-model'].proposeArrowFlatbufferEdit({document,path,replacement}))},
  decodeArrowFlatbuffer(bytes:Uint8Array,options:{id:string;rootType:ArrowFlatbufferRoot}):DecodeResult{
   if(!(bytes instanceof Uint8Array)||bytes.byteLength>MAX_BYTES)throw new UmfError('ARROW_IPC_LIMIT','Expected at most 1000000 source bytes');
   return call(()=>engine['arrow-flatbuffer-model'].decodeArrowFlatbuffer({id:options.id,rootType:options.rootType,bytes:hex(bytes)}));
  },
  encodeArrowFlatbuffer(document:Document,backend:ArrowFlatbufferEncodingBackend):Uint8Array{
   if(backend?.identity!=='flatbuffers@25.9.23'||typeof backend.encode!=='function')throw new UmfError('ARROW_BACKEND','Expected explicit pinned FlatBuffers backend');
   const model=call<{rootType:ArrowFlatbufferRoot;value:unknown}>(()=>engine['arrow-flatbuffer-model'].prepareArrowFlatbufferEncoding({document}));
   const output=backend.encode(model);
   if(!(output instanceof Uint8Array)||!output.length||output.length>MAX_BYTES)throw new UmfError('ARROW_FLATBUFFER_BYTES','Expected bounded metadata bytes');
   call(()=>engine['arrow-flatbuffer-model'].verifyArrowFlatbufferEncoding({document,bytes:hex(output)}));
   return new Uint8Array(output);
  },
 });
}
