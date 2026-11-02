// SPDX-License-Identifier: MIT OR Apache-2.0
import type {
 CoreRelationshipDeclaration,
 CoreRelationshipIdentity,
 CoreRelationshipInspection,
 CoreRelationshipLookup,
 CoreRelationshipOperation,
 CoreRelationshipRequest,
 RelationshipModuleIdentity,
} from '../model/relationships';
import type {Document} from '../model/types';
import {copyJson} from '../model/json';
import {UmfError} from '../model/errors';

export interface CoreRelationshipsRustEngine {
 inspectCoreRelationships(source:unknown,identity:unknown):unknown;
 lookupCoreRelationship(source:unknown,identity:unknown):unknown;
 declareCoreRelationship(source:unknown,identity:unknown,request:unknown):unknown;
 admitCoreRelationshipLookupIdentity(identity:unknown):unknown;
 admitCoreRelationshipRequest(request:unknown):unknown;
 prepareCoreRelationshipVerification(receipt:unknown):object;
 finishCoreRelationshipVerification(handle:object,current:unknown):unknown;
}

function rustCall<T>(operation:()=>T):T {
 try{return operation();}
 catch(error) {
  const candidate=error as {name?:unknown;code?:unknown;message?:unknown;path?:unknown};
  if(candidate?.name==='UmfCoreError'&&typeof candidate.code==='string'&&candidate.code.startsWith('RELATIONSHIP_')) {
   throw new UmfError(candidate.code,String(candidate.message??''),typeof candidate.path==='string'?candidate.path:'');
  }
  throw error;
 }
}

/** Preserve the predecessor's per-operand host admission order while Rust owns semantics. */
export function bindCoreRelationshipsRust(engine:CoreRelationshipsRustEngine) {
 return Object.freeze({
  inspectCoreRelationships(source:Document,identity:RelationshipModuleIdentity):CoreRelationshipInspection {
   const copiedSource=copyJson(source) as unknown as Document;
   const copiedIdentity=copyJson(identity);
   return rustCall(()=>engine.inspectCoreRelationships(copiedSource,copiedIdentity)) as CoreRelationshipInspection;
  },
  lookupCoreRelationship(source:Document,identity:CoreRelationshipIdentity):CoreRelationshipLookup {
   const copiedIdentity=copyJson(identity);
   const admittedIdentity=rustCall(()=>engine.admitCoreRelationshipLookupIdentity(copiedIdentity));
   const copiedSource=copyJson(source) as unknown as Document;
   return rustCall(()=>engine.lookupCoreRelationship(copiedSource,admittedIdentity)) as CoreRelationshipLookup;
  },
  declareCoreRelationship(source:Document,identity:RelationshipModuleIdentity,request:CoreRelationshipRequest):CoreRelationshipDeclaration {
   const copiedRequest=copyJson(request);
   const admittedRequest=rustCall(()=>engine.admitCoreRelationshipRequest(copiedRequest));
   const copiedSource=copyJson(source) as unknown as Document;
   const copiedIdentity=copyJson(identity);
   return rustCall(()=>engine.declareCoreRelationship(copiedSource,copiedIdentity,admittedRequest)) as CoreRelationshipDeclaration;
  },
  verifyCoreRelationshipOperation(receipt:CoreRelationshipOperation,current:Document):CoreRelationshipOperation {
   const copiedReceipt=copyJson(receipt);
   const prepared=rustCall(()=>engine.prepareCoreRelationshipVerification(copiedReceipt));
   const copiedCurrent=copyJson(current) as unknown as Document;
   return rustCall(()=>engine.finishCoreRelationshipVerification(prepared,copiedCurrent)) as CoreRelationshipOperation;
  },
 });
}
