// SPDX-License-Identifier: MIT OR Apache-2.0
/** Declared protection obligations; never a native binding receipt or permission. */
import {UmfError,type Json,type Diagnostic} from '../../../model/types';
import type {SecurityActionPurposeDeclaration} from '../action-purpose-declarations';
import {inspectCandidateProtectionObligations} from '#security-candidate-condition';
import {validateProtectionParameters} from './parameters';
export type ProtectionDeclarationObligationKind='hash-algorithm'|'salt-custody'|'dictionary-attack-warning'|'stored-custody'|'propagation'|'reverse-action'|'vault-write-action';
export interface ProtectionDeclarationObligation {
 transform:{id:string;version:string};kind:ProtectionDeclarationObligationKind;status:'unverified';declaration:Json;
}
export interface ProtectionDeclarationInspection {
 status:'declared-obligations'|'refused';ontology:Json;purposes:readonly SecurityActionPurposeDeclaration[];
 complete:false;authority:false;policy:Json;catalog:Json;closure:Json;
 obligations:readonly ProtectionDeclarationObligation[];
 diagnostics:readonly Diagnostic[];
}
function freeze<T>(v:T):T{if(v!==null&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;}
/** Source declaration consistency only. Every reported enforcement obligation stays unverified. */
export function inspectProtectionObligations(policy:unknown,catalog:unknown,closure:unknown,ontologyInput:unknown):ProtectionDeclarationInspection{
 const parameters=validateProtectionParameters(policy,catalog,closure);
 const report=inspectProtectionObligationsFromCheckedParameters(parameters.policy,parameters.catalog,parameters.closure,ontologyInput);
 const purposeDiagnostics=report.diagnostics.filter(diagnostic=>diagnostic.code.startsWith('SECURITY_ACTION_PURPOSE'));
 const diagnostics=[...parameters.diagnostics,...purposeDiagnostics];
 if(parameters.status==='refused')return freeze({...report,status:'refused',obligations:[],diagnostics});
 diagnostics.push(...report.diagnostics.filter(diagnostic=>
  diagnostic.code==='PROTECTION_DECLARATIONS'||diagnostic.code==='PROTECTION_OBLIGATIONS_UNVERIFIED'));
 return freeze({...report,diagnostics});
}
/** Catalog compiler leaf: parameter literals were already admitted and metered. */
export function inspectProtectionObligationsFromCheckedParameters(policy:unknown,catalog:unknown,closure:unknown,ontologyInput:unknown):ProtectionDeclarationInspection{
 return invoke(() => inspectCandidateProtectionObligations(policy,catalog,closure,ontologyInput));
}
function invoke(operation:()=>unknown):ProtectionDeclarationInspection{
 try{return freeze(operation() as ProtectionDeclarationInspection);}
 catch(error){
  if(error instanceof UmfError)throw error;
  const native=error as {code?:unknown;message?:unknown;path?:unknown};
  if(typeof native?.code==='string'&&(native.code.startsWith('SECURITY_')||native.code.startsWith('LIMIT')||native.code==='REQUEST'))throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');
  throw error;
 }
}
