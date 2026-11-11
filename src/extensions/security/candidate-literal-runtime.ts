// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * Internal Rust callback for bounded security candidate literal checks.
 * Candidate helpers are not part of the Node or Browser SDK surface.
 */
import {UmfError,type Document, type Element} from '../../model/types';
import type {CoreLiteral} from '../../model/schema-literals';
import type {SecurityRef} from './types';

export interface CandidateLiteralReceipt {
  workUnits:number;
  textUnits:number;
  identity:string|null;
}
export interface CandidateLiteralLimits {workLimit:number;textLimit:number;includeIdentity:boolean}
export type CandidateLiteralOperation=(source:Document,field:SecurityRef,value:CoreLiteral,limits:CandidateLiteralLimits)=>CandidateLiteralReceipt;

let operation:CandidateLiteralOperation|undefined;

/** Wired only by the Rust-backed private protection engine, not a public root export. */
export function configureCandidateLiteralOperation(next:CandidateLiteralOperation):void {
  if(typeof next!=='function')throw new UmfError('PROTECTION_LITERAL_ENGINE','Rust candidate literal operation is required');
  operation=next;
}
let coreOperation:CandidateLiteralOperation|undefined;

/** Larger, core-profile limits for private actions-reference comparison. */
export function configureCoreCandidateLiteralOperation(next:CandidateLiteralOperation):void {
  if(typeof next!=='function')throw new UmfError('CORE_LITERAL_ENGINE','Rust core literal operation is required');
  coreOperation=next;
}

export function candidateLiteralFieldRef(source:Document,field:Element):SecurityRef {
  for(const module of source.modules){
    if(module.elements.some(element=>element===field))return {documentId:source.id,moduleId:module.id,elementId:field.id};
  }
  throw new UmfError('PROTECTION_LITERAL_FIELD','Literal field is not from the supplied source document');
}

export function inspectCandidateLiteral(
  source:Document,
  field:SecurityRef,
  value:CoreLiteral,
  limits:CandidateLiteralLimits,
):CandidateLiteralReceipt {
  if(!operation)throw new UmfError('PROTECTION_LITERAL_ENGINE','Rust candidate literal operation is not configured');
  const receipt=operation(source,field,value,limits);
  if(!receipt||!Number.isSafeInteger(receipt.workUnits)||receipt.workUnits<0||receipt.workUnits>limits.workLimit||
     !Number.isSafeInteger(receipt.textUnits)||receipt.textUnits<0||receipt.textUnits>limits.textLimit||
     (limits.includeIdentity&&typeof receipt.identity!=='string')||(!limits.includeIdentity&&receipt.identity!==null))
    throw new UmfError('PROTECTION_LITERAL_RECEIPT','Invalid Rust literal work receipt');
  return receipt;
}

export function inspectCoreCandidateLiteral(
  source:Document,
  field:SecurityRef,
  value:CoreLiteral,
  includeIdentity:boolean,
):CandidateLiteralReceipt {
  if(!coreOperation)throw new UmfError('CORE_LITERAL_ENGINE','Rust core literal operation is not configured');
  const limits={includeIdentity,workLimit:5_000_000,textLimit:8_000_000};
  const receipt=coreOperation(source,field,value,limits);
  if(!receipt||!Number.isSafeInteger(receipt.workUnits)||receipt.workUnits<0||receipt.workUnits>limits.workLimit||
     !Number.isSafeInteger(receipt.textUnits)||receipt.textUnits<0||receipt.textUnits>limits.textLimit||
     (includeIdentity&&typeof receipt.identity!=='string')||(!includeIdentity&&receipt.identity!==null))
    throw new UmfError('CORE_LITERAL_RECEIPT','Invalid Rust literal work receipt');
  return receipt;
}
