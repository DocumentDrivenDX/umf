// SPDX-License-Identifier: MIT OR Apache-2.0
import type {CsvBooleanLexicalReceipt,CsvBooleanLexicalRequest} from '../model/csv-boolean-lexical';
import type {Document} from '../model/types';
import {UmfError} from '../model/errors';

/** Rust engine surface shared by the Node addon and browser WASM bindings. */
export interface CsvBooleanLexicalRustEngine {
 validateCsvBooleanLexical(source:unknown,request:unknown):unknown;
 verifyCsvBooleanLexical(receipt:unknown,source:unknown,request:unknown):unknown;
}

type WireAdmissionErrorGuard=(error:unknown)=>boolean;
type NativeCoreErrorGuard=(error:unknown)=>boolean;

function invoke<T>(operation:()=>T,isWireAdmissionError:WireAdmissionErrorGuard,isNativeUmfCoreError:NativeCoreErrorGuard):T {
 try{return operation();}
 catch(error){
  const wire=isWireAdmissionError(error);
  const native=isNativeUmfCoreError(error);
  if(!wire&&!native)throw error;
  const candidate=error as {name?:unknown;code?:unknown;message?:unknown;path?:unknown};
  const code=typeof candidate?.code==='string'?candidate.code:'';
  // Wire admission records the member from its original descriptor snapshot;
  // translate its operation-envelope path without reflecting over host input.
  if(wire&&candidate?.name==='AdmissionError'&&['ACCESSOR_PROPERTY','NON_ENUMERABLE_PROPERTY','UNSUPPORTED_KEY'].includes(code)){
   const path=typeof candidate.path==='string'?candidate.path:'';
   const prefix=path==='/source'||path.startsWith('/source/')?'/source':
    path==='/csvRequest'||path.startsWith('/csvRequest/')?'/csvRequest':undefined;
   if(prefix){
    const localPath=path.slice(prefix.length);
    const message=code==='UNSUPPORTED_KEY'?'Symbol keys are not JSON-compatible':'Hidden fields and accessors cannot be serialized faithfully';
    throw new UmfError('NON_JSON',message,localPath);
   }
  }
  if(native&&candidate?.name==='UmfCoreError'&&['CSV_BOOLEAN_LEXICAL','CORE_SCHEMA_PROPERTIES','LIMIT','NON_JSON','CYCLE','NUMBER'].includes(code)){
   throw new UmfError(code,String(candidate.message??''),typeof candidate.path==='string'?candidate.path:'');
  }
  throw error;
 }
}

/** Bind only the two frozen CSV Boolean lexical operations to their Rust routes. */
export function bindCsvBooleanLexicalRust(engine:CsvBooleanLexicalRustEngine,isWireAdmissionError:WireAdmissionErrorGuard=()=>false,isNativeUmfCoreError:NativeCoreErrorGuard=()=>false){
 return Object.freeze({
  validateCsvBooleanLexical(source:Document,request:CsvBooleanLexicalRequest):CsvBooleanLexicalReceipt {
   return invoke(()=>engine.validateCsvBooleanLexical(source,request) as CsvBooleanLexicalReceipt,isWireAdmissionError,isNativeUmfCoreError);
  },
  verifyCsvBooleanLexical(receipt:CsvBooleanLexicalReceipt,source:Document,request:CsvBooleanLexicalRequest):CsvBooleanLexicalReceipt {
   // The host wrapper performs receipt-only admission before reading either expected input.
   return invoke(()=>engine.verifyCsvBooleanLexical(receipt,source,request) as CsvBooleanLexicalReceipt,isWireAdmissionError,isNativeUmfCoreError);
  },
 });
}
