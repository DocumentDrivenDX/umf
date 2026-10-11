import manifest from '../../../spec/extensions/arrow-flatbuffer/package.json';
import {Registry} from '../../registry/registry';
import {validateDocument} from '../../validation/document';
import {readJsonValue,writeJsonValue} from '../../model/serialization';
import {copyJson} from '../../model/json';
import {UmfError,type Document,type ExtensionPackage} from '../../model/types';
export const ARROW_FLATBUFFER_EXTENSION='umf.arrow.flatbuffer';
export const arrowFlatbufferPackage=manifest as unknown as ExtensionPackage;
export function arrowFlatbufferRegistry(){return new Registry().register(arrowFlatbufferPackage);}
export function inspectArrowFlatbufferModel(document:Document){const result=validateDocument(document,arrowFlatbufferRegistry());return {...result,complete:false,diagnostics:[...result.diagnostics,{code:'ARROW_FLATBUFFER_SEMANTICS',path:'',severity:'warning' as const,message:'Metadata structure only; Arrow semantic invariants, unknown fields and binary/data conversion remain unverified'}]};}
/** Imports the documented logical JSON profile, not native FlatBuffers bytes or flatc JSON. */
export function importArrowFlatbufferModel(text:string,options:{id:string}):Document{
 const document:Document={umf:'0.1.0',id:options.id,vocabularies:{[ARROW_FLATBUFFER_EXTENSION]:{version:'0.1.0'}},modules:[{id:'metadata',namespace:'',elements:[{id:'root',extensions:{[ARROW_FLATBUFFER_EXTENSION]:{profile:'arrow-flatbuffer-model',model:readJsonValue(text,'json')}}}]}]};exportArrowFlatbufferModel(document);return document;
}
export function exportArrowFlatbufferModel(document:Document):string{
 const checked=inspectArrowFlatbufferModel(document);if(!checked.valid)throw new UmfError('ARROW_FLATBUFFER_MODEL','Invalid logical FlatBuffer model');
 const p=document.modules.find(m=>m.id==='metadata')?.elements.find(e=>e.id==='root')?.extensions[ARROW_FLATBUFFER_EXTENSION];
 if(document.vocabularies[ARROW_FLATBUFFER_EXTENSION]?.version!=='0.1.0'||!p||typeof p!=='object'||Array.isArray(p))throw new UmfError('ARROW_FLATBUFFER_MODEL','Expected pinned logical FlatBuffer model');
 if(p.wireOmissions)throw new UmfError('ARROW_FLATBUFFER_WIRE_LOSS','Unknown wire fields remain in source; standalone model export cannot preserve them');
 if(Object.keys(p).some(k=>!['profile','model'].includes(k)))throw new UmfError('ARROW_FLATBUFFER_REPRESENTATION','Unknown representation fields cannot be discarded');
 return writeJsonValue(copyJson(p.model),'json');
}

import {nativePointer} from '../../model/native-json';
import type {Json} from '../../model/types';
/** Atomic edit of an existing logical-model node; validates structure, not Arrow semantics. */
export function proposeArrowFlatbufferEdit(document:Document,path:string,replacement:Json){
 const next=copyJson(document) as unknown as Document;const payload=next.modules.find(m=>m.id==='metadata')?.elements.find(e=>e.id==='root')?.extensions[ARROW_FLATBUFFER_EXTENSION] as any;
 const model=JSON.parse(exportArrowFlatbufferModel(document));const parts=nativePointer(path);let value=model;
 for(const key of parts.slice(0,-1)){if(value===null||typeof value!=='object'||!Object.hasOwn(value,key)||(Array.isArray(value)&&(!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=value.length)))throw new UmfError('ARROW_FLATBUFFER_EDIT','Expected existing metadata node');value=value[key];}
 const key=parts.at(-1);if(key===undefined)payload.model=copyJson(replacement);else{if(value===null||typeof value!=='object'||!Object.hasOwn(value,key)||(Array.isArray(value)&&(!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=value.length)))throw new UmfError('ARROW_FLATBUFFER_EDIT','Expected existing metadata node');Object.defineProperty(value,key,{value:copyJson(replacement),enumerable:true,writable:true,configurable:true});payload.model=model;}
 exportArrowFlatbufferModel(next);return {document:next,validation:inspectArrowFlatbufferModel(next)};
}
