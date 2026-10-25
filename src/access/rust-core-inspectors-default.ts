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

function invoke<T>(operation:()=>T):T {
 try{return operation();}
 catch(error){
  const candidate=error as {name?:unknown;code?:unknown;message?:unknown;path?:unknown};
  if(candidate?.name==='UmfCoreError'&&typeof candidate.code==='string'&&candidate.code.startsWith('CORE_'))
   throw new UmfError(candidate.code,String(candidate.message??''),typeof candidate.path==='string'?candidate.path:'');
  throw error;
 }
}

/** Bind the three frozen Rust inspectors while preserving public copy and error behavior. */
export function bindCoreInspectorsRust(engine:CoreInspectorsRustEngine){
 return Object.freeze({
  inspectCoreScalarType(source:Document,identity:CoreScalarTypeIdentity):CoreScalarTypeInspection {
   return invoke(()=>engine.inspectCoreScalarType(source,identity)) as CoreScalarTypeInspection;
  },
  inspectCoreRecordMembers(source:Document,identity:CoreRecordMembersIdentity):CoreRecordMembersInspection {
   return invoke(()=>engine.inspectCoreRecordMembers(source,identity)) as CoreRecordMembersInspection;
  },
  inspectCoreReferenceLinks(source:Document,identity:CoreReferenceLinkIdentity):CoreReferenceLinksInspection {
   return invoke(()=>engine.inspectCoreReferenceLinks(source,identity)) as CoreReferenceLinksInspection;
  },
 });
}
