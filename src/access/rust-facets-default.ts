// SPDX-License-Identifier: MIT OR Apache-2.0
import type {
 CoreFacetDeclaration,
 CoreFacetIdentity,
 CoreFacetInspection,
 CoreFacetPatch,
 CoreFacetInterpreted,
} from '../model/facets';
import type {Document} from '../model/types';
import {copyJson} from '../model/json';
import {UmfError} from '../model/errors';

function rustCall<T>(operation:()=>T):T {
 try{return operation();}
 catch(error) {
  const candidate=error as {name?:unknown;code?:unknown;message?:unknown;path?:unknown};
  if(candidate?.name==='UmfCoreError'&&typeof candidate.code==='string'&&(candidate.code.startsWith('CORE_FACET_')||candidate.code==='LIMIT')) {
   throw new UmfError(candidate.code,String(candidate.message??''),typeof candidate.path==='string'?candidate.path:'');
  }
  throw error;
 }
}

/** Rust operations used by the package's Core Facets facade. */
export interface CoreFacetsRustEngine {
 inspectCoreFacets(source:Document,identity:unknown):unknown;
 declareCoreFacets(source:Document,identity:unknown,request:CoreFacetPatch):unknown;
 admitCoreFacetRequest(request:unknown):unknown;
 prepareCoreFacetVerification(receipt:unknown):unknown;
 finishCoreFacetVerification(prepared:unknown,current:Document):unknown;
 historicalCoreFacetPatch(input:CoreFacetInterpreted):unknown;
}

/** Preserve TypeScript copy/admission order while delegating all model semantics to Rust. */
export function bindCoreFacetsRust(engine:CoreFacetsRustEngine) {
 return Object.freeze({
  inspectCoreFacets(source:Document,identity:CoreFacetIdentity) {
   const copiedSource=copyJson(source) as unknown as Document;
   const copiedIdentity=copyJson(identity);
   return rustCall(()=>engine.inspectCoreFacets(copiedSource,copiedIdentity)) as CoreFacetInspection;
  },
  declareCoreFacets(source:Document,identity:CoreFacetIdentity,options:CoreFacetPatch) {
   const copiedOptions=copyJson(options);
   const admittedOptions=rustCall(()=>engine.admitCoreFacetRequest(copiedOptions));
   const copiedSource=copyJson(source) as unknown as Document;
   const copiedIdentity=copyJson(identity);
   return rustCall(()=>engine.declareCoreFacets(copiedSource,copiedIdentity,admittedOptions as CoreFacetPatch)) as CoreFacetDeclaration;
  },
  verifyCoreFacetDeclaration(receipt:CoreFacetDeclaration,current:Document) {
   const copiedReceipt=copyJson(receipt);
   const prepared=rustCall(()=>engine.prepareCoreFacetVerification(copiedReceipt));
   const copiedCurrent=copyJson(current) as unknown as Document;
   return rustCall(()=>engine.finishCoreFacetVerification(prepared,copiedCurrent)) as CoreFacetDeclaration;
  },
  historicalCoreFacetPatch(input:CoreFacetInterpreted) {
   const copiedInput=copyJson(input);
   const result=rustCall(()=>engine.historicalCoreFacetPatch(copiedInput as CoreFacetInterpreted)) as CoreFacetPatch;
   return {
    ...result,
    ...(result.length?{length:{max:result.length.max,unit:result.length.unit}}:{}),
   };
  },
 });
}
