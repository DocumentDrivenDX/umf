// SPDX-License-Identifier: MIT OR Apache-2.0
import type {CsvBooleanLexicalReceipt,CsvBooleanLexicalRequest} from '../model/csv-boolean-lexical';
import type {Document} from '../model/types';
import {UmfError} from '../model/errors';

/** Rust engine surface shared by the Node addon and browser WASM bindings. */
export interface CsvBooleanLexicalRustEngine {
 validateCsvBooleanLexical(source:unknown,request:unknown):unknown;
 verifyCsvBooleanLexical(receipt:unknown,source:unknown,request:unknown):unknown;
}

function invoke<T>(operation:()=>T):T {
 try{return operation();}
 catch(error){
  const candidate=error as {name?:unknown;code?:unknown;message?:unknown;path?:unknown};
  const code=typeof candidate?.code==='string'?candidate.code:'';
  // Rust's host admission reports an accessor before typed JSON traversal; the
  // public TypeScript predecessor reports the same refused source as NON_JSON.
  if(candidate?.name==='AdmissionError'&&code==='ACCESSOR_PROPERTY'&&candidate.path==='/source'){
   throw new UmfError('NON_JSON','Hidden fields and accessors cannot be serialized faithfully','/umf');
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
   return invoke(()=>engine.validateCsvBooleanLexical(source,request) as CsvBooleanLexicalReceipt);
  },
  verifyCsvBooleanLexical(receipt:CsvBooleanLexicalReceipt,source:Document,request:CsvBooleanLexicalRequest):CsvBooleanLexicalReceipt {
   // The host wrapper performs receipt-only admission before reading either expected input.
   return invoke(()=>engine.verifyCsvBooleanLexical(receipt,source,request) as CsvBooleanLexicalReceipt);
  },
 });
}
