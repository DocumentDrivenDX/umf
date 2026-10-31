// SPDX-License-Identifier: MIT OR Apache-2.0
import type {CoreScalarTypeInspection,CoreScalarTypeIdentity} from '../model/scalar-type';
import type {CoreRecordMembersInspection,CoreRecordMembersIdentity} from '../model/record-members';
import type {CoreReferenceLinksInspection,CoreReferenceLinkIdentity} from '../model/reference-links';
import type {Document} from '../model/types';
import {UmfError} from '../model/errors';

/** The shared Node/WASM Rust core-model inspection surface. */
export interface CoreInspectorsRustEngine {
 inspectCoreScalarType(source:unknown,identity:unknown):unknown;
 inspectCoreRecordMembers(source:unknown,identity:unknown):unknown;
 inspectCoreReferenceLinks(source:unknown,identity:unknown):unknown;
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
  const code=typeof candidate.code==='string'?candidate.code:'';
  if(native&&candidate?.name==='UmfCoreError'&&typeof candidate.code==='string'&&candidate.code.startsWith('CORE_'))
   throw new UmfError(candidate.code,String(candidate.message??''),typeof candidate.path==='string'?candidate.path:'');
  // The reference inspectors admit source and identity as JSON values before
  // interpreting them. Rust wire admission reports operation-envelope paths;
  // restore the reference NON_JSON envelope without touching the host input.
  if(wire&&candidate?.name==='AdmissionError'&&['ACCESSOR_PROPERTY','NON_ENUMERABLE_PROPERTY','UNSUPPORTED_KEY'].includes(code)){
   const path=typeof candidate.path==='string'?candidate.path:'';
   const prefix=path==='/source'||path.startsWith('/source/')?'/source':
    path==='/identity'||path.startsWith('/identity/')?'/identity':undefined;
   if(prefix){
    const localPath=path.slice(prefix.length);
    const message=code==='UNSUPPORTED_KEY'?'Symbol keys are not JSON-compatible':'Hidden fields and accessors cannot be serialized faithfully';
    throw new UmfError('NON_JSON',message,localPath);
   }
  }
  throw error;
 }
}

/** Bind the three frozen Rust inspectors while preserving public copy and error behavior. */
export function bindCoreInspectorsRust(engine:CoreInspectorsRustEngine,isWireAdmissionError:WireAdmissionErrorGuard=()=>false,isNativeUmfCoreError:NativeCoreErrorGuard=()=>false){
 return Object.freeze({
  inspectCoreScalarType(source:Document,identity:CoreScalarTypeIdentity):CoreScalarTypeInspection {
   return invoke(()=>engine.inspectCoreScalarType(source,identity),isWireAdmissionError,isNativeUmfCoreError) as CoreScalarTypeInspection;
  },
  inspectCoreRecordMembers(source:Document,identity:CoreRecordMembersIdentity):CoreRecordMembersInspection {
   return invoke(()=>engine.inspectCoreRecordMembers(source,identity),isWireAdmissionError,isNativeUmfCoreError) as CoreRecordMembersInspection;
  },
  inspectCoreReferenceLinks(source:Document,identity:CoreReferenceLinkIdentity):CoreReferenceLinksInspection {
   return invoke(()=>engine.inspectCoreReferenceLinks(source,identity),isWireAdmissionError,isNativeUmfCoreError) as CoreReferenceLinksInspection;
  },
 });
}
