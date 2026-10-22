import manifest from '../../../spec/extensions/arrow-ipc/package.json';
import {Registry} from '../../registry/registry';
import {validateDocument} from '../../validation/document';
import {copyJson} from '../../model/json';
import {UmfError,type Document,type Json,type ExtensionPackage} from '../../model/types';
export const ARROW_IPC_EXTENSION='umf.arrow.ipc';
export const ARROW_IPC_MAX_BYTES=1_000_000;
export const arrowIpcPackage=manifest as unknown as ExtensionPackage;
export function arrowIpcRegistry(){return new Registry().register(arrowIpcPackage);}
/** Validates the capture envelope only. It cannot establish native Arrow validity. */
export function inspectArrowIpcCapture(document:Document){
 const result=validateDocument(document,arrowIpcRegistry());
 return {...result,complete:false,diagnostics:[...result.diagnostics,{code:'ARROW_IPC_UNINTERPRETED',path:'',severity:'warning' as const,message:'Captured bytes are authoritative; complete IPC framing, native schema and data validity are unverified'}]};
}
/** Accepts even empty or invalid native input so decode failure cannot lose source. */
export function captureArrowIpc(bytes:Uint8Array,options:{id:string}):Document{
 if(!(bytes instanceof Uint8Array)||bytes.byteLength>ARROW_IPC_MAX_BYTES)throw new UmfError('ARROW_IPC_LIMIT','Expected at most 1000000 source bytes');
 const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 const document:Document={umf:'0.1.0',id:options.id,vocabularies:{[ARROW_IPC_EXTENSION]:{version:'0.1.0'}},modules:[{id:'ipc',namespace:'',elements:[{id:'source',extensions:{[ARROW_IPC_EXTENSION]:{profile:'arrow-ipc-source',encoding:'hex',bytes:hex}}}]}]};
 exportArrowIpcCapture(document);return document;
}
/** Exports captured bytes, never a regenerated interpretation or an edited schema. */
export function exportArrowIpcCapture(document:Document):Uint8Array{
 const checked=inspectArrowIpcCapture(document);if(!checked.valid)throw new UmfError('ARROW_IPC_CAPTURE','Invalid IPC capture envelope');
 const value=document.modules.find(m=>m.id==='ipc')?.elements.find(e=>e.id==='source')?.extensions[ARROW_IPC_EXTENSION];
 if(document.vocabularies[ARROW_IPC_EXTENSION]?.version!=='0.1.0'||!value||typeof value!=='object'||Array.isArray(value))throw new UmfError('ARROW_IPC_CAPTURE','Expected pinned IPC capture');
 if(Object.keys(value).some(k=>!['profile','encoding','bytes'].includes(k)))throw new UmfError('ARROW_IPC_REPRESENTATION','Unknown capture representation fields cannot be exported as native bytes');
 const hex=value.bytes as string;const bytes=new Uint8Array(hex.length/2);
 for(let i=0;i<bytes.length;i++)bytes[i]=Number.parseInt(hex.slice(i*2,i*2+2),16);
 return bytes;
}
export interface ArrowIpcObservationBackend {
 identity:'apache-arrow@21.2.0';
 observe(bytes:Uint8Array):unknown;
}
/** A pinned native schema observation; does not assert complete byte consumption. */
export function observeArrowIpcCapture(document:Document,backend:ArrowIpcObservationBackend):{source:Document;backend:string;complete:false;status:'observed'|'uninterpreted';schema?:Json;message?:string}{
 if(backend?.identity!=='apache-arrow@21.2.0'||typeof backend.observe!=='function')throw new UmfError('ARROW_BACKEND','Expected explicit pinned IPC observation backend');
 const bytes=exportArrowIpcCapture(document);const source=copyJson(document) as unknown as Document;
 try{return {source,backend:backend.identity,complete:false,status:'observed',schema:copyJson(backend.observe(bytes))};}
 catch(error){return {source,backend:backend.identity,complete:false,status:'uninterpreted',message:error instanceof Error?error.message:'Native observation failed'};}
}
