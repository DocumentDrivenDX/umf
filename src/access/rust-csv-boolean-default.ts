// SPDX-License-Identifier: MIT OR Apache-2.0
import type {CsvBooleanLexicalReceipt,CsvBooleanLexicalRequest} from '../model/csv-boolean-lexical';
import type {Document} from '../model/types';
import {UmfError} from '../model/errors';

/** Rust engine surface shared by the Node addon and browser WASM bindings. */
export interface CsvBooleanLexicalRustEngine {
 validateCsvBooleanLexical(source:unknown,request:unknown):unknown;
 verifyCsvBooleanLexical(receipt:unknown,source:unknown,request:unknown):unknown;
}

function pointer(key:string):string{return key.replace(/~/g,'~0').replace(/\//g,'~1');}

/** Locate one hidden/accessor member without reading it or validating JSON values. */
function firstHiddenPath(input:unknown):string|undefined {
 const seen=new Set<object>();let found:string|undefined,ambiguous=false,inspected=0;
 // This diagnostic-only walk must not exceed the ordinary host admission
 // profile when an early wire refusal leaves a much larger graph unvisited.
 const visit=(value:unknown,path:string,depth:number):void=>{
  if(value===null||typeof value!=='object'||seen.has(value)||ambiguous)return;
  if(depth>128||++inspected>100_000){ambiguous=true;return;}
  seen.add(value);
  const descriptors=Object.getOwnPropertyDescriptors(value);
  const array=Array.isArray(value);
  for(const key of Reflect.ownKeys(descriptors)){
   if(++inspected>100_000){ambiguous=true;break;}
   if(typeof key!=='string'||(array&&key==='length'))continue;
   const descriptor=descriptors[key];
   if(!descriptor)continue;
   const memberPath=`${path}/${pointer(key)}`;
   if(!descriptor.enumerable||!('value' in descriptor)){
    if(found!==undefined)ambiguous=true;
    else found=memberPath;
   }else if(descriptor.enumerable){
    visit(descriptor.value,memberPath,depth+1);
   }
  }
 };
 try{visit(input,'',0);}catch{return undefined;}
 return ambiguous?undefined:found;
}

function invoke<T>(source:unknown,request:unknown,operation:()=>T):T {
 try{return operation();}
 catch(error){
  const candidate=error as {name?:unknown;code?:unknown;message?:unknown;path?:unknown};
  const code=typeof candidate?.code==='string'?candidate.code:'';
  // Shared wire admission reports the containing argument, not its member.
  // Translate only when reflection finds one unambiguous hidden/accessor member.
  if(candidate?.name==='AdmissionError'&&['ACCESSOR_PROPERTY','NON_ENUMERABLE_PROPERTY'].includes(code)){
   const path=typeof candidate.path==='string'?candidate.path:'';
   const input=path==='/source'||path.startsWith('/source/')?source:
    path==='/csvRequest'||path.startsWith('/csvRequest/')?request:undefined;
   if(input!==undefined){
    const path=firstHiddenPath(input);
    if(path!==undefined)throw new UmfError('NON_JSON','Hidden fields and accessors cannot be serialized faithfully',path);
   }
  }
  if(candidate?.name==='UmfCoreError'&&['CSV_BOOLEAN_LEXICAL','CORE_SCHEMA_PROPERTIES','LIMIT','NON_JSON','CYCLE','NUMBER'].includes(code)){
   throw new UmfError(code,String(candidate.message??''),typeof candidate.path==='string'?candidate.path:'');
  }
  throw error;
 }
}

/** Bind only the two frozen CSV Boolean lexical operations to their Rust routes. */
export function bindCsvBooleanLexicalRust(engine:CsvBooleanLexicalRustEngine){
 return Object.freeze({
  validateCsvBooleanLexical(source:Document,request:CsvBooleanLexicalRequest):CsvBooleanLexicalReceipt {
   return invoke(source,request,()=>engine.validateCsvBooleanLexical(source,request) as CsvBooleanLexicalReceipt);
  },
  verifyCsvBooleanLexical(receipt:CsvBooleanLexicalReceipt,source:Document,request:CsvBooleanLexicalRequest):CsvBooleanLexicalReceipt {
   // The host wrapper performs receipt-only admission before reading either expected input.
   return invoke(source,request,()=>engine.verifyCsvBooleanLexical(receipt,source,request) as CsvBooleanLexicalReceipt);
  },
 });
}
