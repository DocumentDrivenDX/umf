/** Envelope scaffold only. Transform payload is retained, never executable meaning. */
import manifest from '../../../../spec/extensions/security-protection/package.json';
import {copyJson} from '../../../model/json';
import {UmfError,type Json,type Validation,type Diagnostic,type ExtensionPackage} from '../../../model/types';
import {createValidator} from '../../../validation/schema';

// A caller editing package metadata cannot replace the private compiled schema.
export const protectionPackage=copyJson(manifest) as unknown as ExtensionPackage;
const checkEnvelope=createValidator().compile(manifest.schema);
export interface ProtectionCatalogInspection extends Validation {source:Json}

/** `valid` qualifies the envelope/identity subset only; `complete` is always false. */
export function inspectProtectionCatalog(input:unknown):ProtectionCatalogInspection {
 let source:Json;
 try {source=copyJson(input);} catch(error) {
  if(!(error instanceof UmfError))throw error;
  return {source:null,valid:false,complete:false,diagnostics:[{code:error.code,path:error.path,message:error.message,severity:'error'}]};
 }
 const diagnostics:Diagnostic[]=[];
 if(!checkEnvelope(source)){
  for(const error of checkEnvelope.errors??[])diagnostics.push({code:'PROTECTION_STRUCTURE',path:error.instancePath,message:error.message??'Invalid protection envelope',severity:'error'});
 }else{
  const catalog=source as {transforms:{id:string;version:string}[]};
  const identities=new Set<string>();
  catalog.transforms.forEach((transform,i)=>{
   // Exact tuple encoding: no delimiter collisions or Unicode normalization.
   const identity=JSON.stringify([transform.id,transform.version]);
   if(identities.has(identity))diagnostics.push({code:'PROTECTION_DUPLICATE',path:'/transforms/'+i,message:'Duplicate transform id/version pair',severity:'error'});
   identities.add(identity);
  });
 }
 diagnostics.push({code:'PROTECTION_UNIMPLEMENTED',path:'',message:'Only envelope and identity structure are inspected; transform domains, parameters, disclosure and custody are not interpreted',severity:'warning'});
 return {source,valid:!diagnostics.some(d=>d.severity==='error'),complete:false,diagnostics};
}

/** Fail closed until the complete catalog interpreter is implemented and qualified. */
export function requireProtectionInterpretation(input:unknown):never {
 const result=inspectProtectionCatalog(input);
 const failure=result.diagnostics.find(d=>d.severity==='error')??result.diagnostics[0]!;
 throw new UmfError(failure.code,failure.message,failure.path);
}
