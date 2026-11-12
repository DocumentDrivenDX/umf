// SPDX-License-Identifier: MIT OR Apache-2.0
/** Qualified core-definition closure; no function compatibility or native admission. */
import {UmfError,type Json,type Diagnostic,type Document} from '../../../model/types';
import type {SecurityRef} from '../types';
import {resolveCandidateProtectionDomains} from '#security-candidate-condition';

export interface ProtectionCoreClosure {
 pins:{documentId:string;revision:string}[];
 documents:{revision:string;document:Document}[];
}
export interface ProtectionDomainOccurrence {
 source:'policy'|'catalog';path:string;ref:SecurityRef;
 definition:{documentIndex:number;moduleIndex:number;elementIndex:number};
}
export interface SecurityProtectionDomainResolution {
 status:'resolved-domains'|'refused';complete:false;authority:false;
 policy:Json;catalog:Json;closure:Json;domains:readonly ProtectionDomainOccurrence[];
 diagnostics:readonly Diagnostic[];
}
function freeze<T>(v:T):T{if(v!==null&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;}

/** Exact pins qualify only the supplied immutable core definitions, not their provenance. */
export function resolveSecurityProtectionDomainsCandidate(policyInput:unknown,catalogInput:unknown,closureInput:unknown):SecurityProtectionDomainResolution {
 try{return freeze(resolveCandidateProtectionDomains(policyInput,catalogInput,closureInput) as SecurityProtectionDomainResolution);}
 catch(error){
  if(error instanceof UmfError)throw error;
  const native=error as {code?:unknown;message?:unknown;path?:unknown};
  if(typeof native?.code==='string'&&(native.code.startsWith('PROTECTION_')||native.code.startsWith('SECURITY_PROTECTION_')||native.code==='REQUEST'))throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');
  throw error;
 }
}
