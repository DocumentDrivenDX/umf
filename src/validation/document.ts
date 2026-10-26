// SPDX-License-Identifier: MIT OR Apache-2.0
import {checkCore} from '../generated/core-validators';
import {currentDomainPolicy as domainPolicy} from './current-policy';
import {runCoreConstraints,type ConstraintMeter} from './constraint-kernel';
import {copyJson,copyJsonCharged} from '../model/json';
import {Registry} from '../registry/registry';
import {UmfError,type Document,type Diagnostic,type Validation} from '../model/types';
/** Current structural admission followed by the authored ordered rule program. */
export function validateDocument(input:unknown,registry=new Registry(),meter?:ConstraintMeter):Validation {
 return validateDocumentInternal(input,registry,meter);
}
/** Private R2 validation path: preserves the public validator while charging copy retention. */
export function validateDocumentWithAccounting(input:unknown,registry:Registry,meter:ConstraintMeter,copy:{property:(key:string,path:string,isArray:boolean)=>void;text:(value:string,path:string)=>void}):Validation{
 return validateDocumentInternal(input,registry,meter,copy);
}
function validateDocumentInternal(input:unknown,registry:Registry,meter?:ConstraintMeter,copy?:{property:(key:string,path:string,isArray:boolean)=>void;text:(value:string,path:string)=>void}):Validation{
 if(registry.kindRuntime){
  if(meter)throw new UmfError('EXTENSION_KIND_RUNTIME_CONTROLS','Use the shared engine controls for native work metering');
  return registry.kindRuntime.validateDocument(input,registry.registrations());
 }
 let document:Document;
 const hooks=copy?{beforeProperty:copy.property,retainText:copy.text}:undefined;
 try{document=copyJsonCharged(input,n=>meter?.('document-copy',n),hooks) as unknown as Document;}catch(error){if(!(error instanceof UmfError))throw error;return {valid:false,complete:false,diagnostics:[{code:error.code,path:error.path,message:error.message,severity:'error'}]};}
 if(!checkCore(document)){const policy=(domainPolicy as any).structuralDiagnostic;const diagnostics:Diagnostic[]=(checkCore.errors??[]).map((error:any)=>({code:policy.code,path:error.instancePath,message:error.message??policy.message,severity:policy.severity}));return {valid:false,complete:false,diagnostics};}
 const diagnostics=runCoreConstraints(document,registry,meter);return {valid:!diagnostics.some(d=>d.severity==='error'),complete:diagnostics.length===0,diagnostics};
}
