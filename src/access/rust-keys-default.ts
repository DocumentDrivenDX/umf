// SPDX-License-Identifier: MIT OR Apache-2.0
import type {
 CoreKeyDeclaration,
 CoreKeyInspection,
 CoreKeyLookup,
 CoreKeyOperation,
 CoreKeyRequest,
 CoreRecordIdentity,
 CoreRecordMembersDeclaration,
} from '../model/keys';
import type {CoreKeyIdentity} from '../model/key-tuple';
import type {Document} from '../model/types';
import {copyJson} from '../model/json';
import {UmfError} from '../model/errors';

export interface CoreKeysRustEngine {
 inspectCoreKeys(source:unknown,identity:unknown):unknown;
 lookupCoreKey(source:unknown,identity:unknown):unknown;
 declareCoreRecordMembers(source:unknown,identity:unknown,request:unknown):unknown;
 declareCoreKey(source:unknown,identity:unknown,request:unknown):unknown;
 admitCoreKeyIdentity(identity:unknown):unknown;
 admitCoreKeyRequest(request:unknown):unknown;
 admitCoreKeyMemberRequest(request:unknown):unknown;
 prepareCoreKeyVerification(receipt:unknown):unknown;
 finishCoreKeyVerification(handle:object,current:unknown):unknown;
}

function rustCall<T>(operation:()=>T):T {
 try{return operation();}
 catch(error) {
  const candidate=error as {name?:unknown;code?:unknown;message?:unknown;path?:unknown};
  if(candidate?.name==='UmfCoreError'&&typeof candidate.code==='string'&&
   (candidate.code.startsWith('CORE_KEY_')||candidate.code.startsWith('CORE_MEMBERS_'))) {
   throw new UmfError(candidate.code,String(candidate.message??''),typeof candidate.path==='string'?candidate.path:'');
  }
  throw error;
 }
}

/** Adapt the opt-in Rust model engine to the public TypeScript signatures and admission order. */
export function bindCoreKeysRust(engine:CoreKeysRustEngine) {
 return Object.freeze({
  inspectCoreKeys(source:Document,identity:CoreRecordIdentity):CoreKeyInspection {
   const copiedSource=copyJson(source) as unknown as Document;
   const copiedIdentity=copyJson(identity);
   return rustCall(()=>engine.inspectCoreKeys(copiedSource,copiedIdentity)) as CoreKeyInspection;
  },
  lookupCoreKey(source:Document,identity:CoreKeyIdentity):CoreKeyLookup {
   const copiedIdentity=copyJson(identity);
   const admittedIdentity=rustCall(()=>engine.admitCoreKeyIdentity(copiedIdentity));
   const copiedSource=copyJson(source) as unknown as Document;
   return rustCall(()=>engine.lookupCoreKey(copiedSource,admittedIdentity)) as CoreKeyLookup;
  },
  declareCoreRecordMembers(source:Document,identity:CoreRecordIdentity,request:CoreRecordIdentity[]):CoreRecordMembersDeclaration {
   const copiedRequest=copyJson(request);
   const admittedRequest=rustCall(()=>engine.admitCoreKeyMemberRequest(copiedRequest));
   const copiedSource=copyJson(source) as unknown as Document;
   const copiedIdentity=copyJson(identity);
   return rustCall(()=>engine.declareCoreRecordMembers(copiedSource,copiedIdentity,admittedRequest)) as CoreRecordMembersDeclaration;
  },
  declareCoreKey(source:Document,identity:CoreRecordIdentity,request:CoreKeyRequest):CoreKeyDeclaration {
   const copiedRequest=copyJson(request);
   const admittedRequest=rustCall(()=>engine.admitCoreKeyRequest(copiedRequest));
   const copiedSource=copyJson(source) as unknown as Document;
   const copiedIdentity=copyJson(identity);
   return rustCall(()=>engine.declareCoreKey(copiedSource,copiedIdentity,admittedRequest)) as CoreKeyDeclaration;
  },
  verifyCoreKeyOperation(receipt:CoreKeyOperation,current:Document):CoreKeyOperation {
   const copiedReceipt=copyJson(receipt);
   const prepared=rustCall(()=>engine.prepareCoreKeyVerification(copiedReceipt));
   const copiedCurrent=copyJson(current) as unknown as Document;
   return rustCall(()=>engine.finishCoreKeyVerification(prepared as object,copiedCurrent)) as CoreKeyOperation;
  },
 });
}
