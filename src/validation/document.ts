// SPDX-License-Identifier: MIT OR Apache-2.0
import {checkCore} from '../generated/core-validators';
import {currentDomainPolicy as domainPolicy} from './current-policy';
import {runCoreConstraints,type ConstraintMeter} from './constraint-kernel';
import {copyJson,copyJsonCharged} from '../model/json';
import {Registry} from '../registry/registry';
import {UmfError,type Document,type Diagnostic,type Validation} from '../model/types';
/** Current structural admission followed by the authored ordered rule program. */
export function validateDocument(input:unknown,registry=new Registry(),meter?:ConstraintMeter):Validation {
 let document:Document;
 try{document=copyJsonCharged(input,n=>meter?.('document-copy',n)) as unknown as Document;}catch(error){if(!(error instanceof UmfError))throw error;return {valid:false,complete:false,diagnostics:[{code:error.code,path:error.path,message:error.message,severity:'error'}]};}
 if(!checkCore(document)){const policy=(domainPolicy as any).structuralDiagnostic;const diagnostics:Diagnostic[]=(checkCore.errors??[]).map((error:any)=>({code:policy.code,path:error.instancePath,message:error.message??policy.message,severity:policy.severity}));return {valid:false,complete:false,diagnostics};}
 const diagnostics=runCoreConstraints(document,registry,meter);return {valid:!diagnostics.some(d=>d.severity==='error'),complete:diagnostics.length===0,diagnostics};
}
