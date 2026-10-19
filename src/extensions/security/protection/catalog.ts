// SPDX-License-Identifier: MIT OR Apache-2.0
/** Wire inspection only; domain/function/query closure and native authority remain separate. */
import manifest from '../../../../spec/extensions/security-protection/package.json';
import {copyJson} from '../../../model/json';
import {canonicalSchemaJson} from '../../../model/schema-literals';
import {UmfError,pointer,type Json,type Validation,type Diagnostic,type ExtensionPackage} from '../../../model/types';
import {createValidator} from '../../../validation/schema';

// A caller editing package metadata cannot replace the private compiled schema.
export const protectionPackage=copyJson(manifest) as unknown as ExtensionPackage;
const SOURCE_TEXT_LIMIT=4_000_000;
const checkWire=createValidator().compile(copyJson(manifest.schema) as typeof manifest.schema);
export interface ProtectionCatalogInspection extends Validation {source:Json}

/** `valid` qualifies wire structure and local bounds only; `complete` is always false. */
export function inspectProtectionCatalog(input:unknown):ProtectionCatalogInspection {
 let source:Json;
 try {source=copyJson(input);} catch(error) {
  if(!(error instanceof UmfError))throw error;
  return {source:null,valid:false,complete:false,diagnostics:[{code:error.code,path:error.path,message:error.message,severity:'error'}]};
 }
 // Charge retained key/string text before regex validation or literal encoding.
 // The preceding core snapshot has independent value/depth controls; this is
 // not a preallocation, total heap or total CPU theorem for that snapshot.
 let textUnits=0;const pending:Json[]=[source];
 const charge=(text:string)=>{textUnits+=text.length;return textUnits<=SOURCE_TEXT_LIMIT;};
 let textBound=true;
 while(pending.length&&textBound){
  const value=pending.pop()!;
  if(typeof value==='string')textBound=charge(value);
  else if(value!==null&&typeof value==='object'){
   if(Array.isArray(value))for(const item of value)pending.push(item);
   else for(const key of Object.keys(value)){
    if(!charge(key)){textBound=false;break;}
    pending.push(value[key]!);
   }
  }
 }
 if(!textBound)return {source,valid:false,complete:false,diagnostics:[{code:'PROTECTION_BOUND',path:'',message:'resource-exhausted: source key/string text exceeds4000000 UTF-16 units',severity:'error'}]};
 const diagnostics:Diagnostic[]=[];
 if(!checkWire(source)){
  for(const error of checkWire.errors??[])diagnostics.push({code:'PROTECTION_STRUCTURE',path:error.instancePath,message:error.message??'Invalid protection wire structure',severity:'error'});
 }else{
  type ObjectValue=Record<string,Json>;
  const object=(v:Json)=>v as ObjectValue;
  const unknown=(value:ObjectValue,known:string[],path:string)=>{
   for(const key of Object.keys(value))if(!known.includes(key))diagnostics.push({code:'PROTECTION_UNKNOWN',path:path+'/'+pointer(key),message:'Uninterpreted protection member retained',severity:'warning'});
  };
  const duplicate=(values:string[],path:string)=>{
   if(new Set(values).size!==values.length)diagnostics.push({code:'PROTECTION_DUPLICATE',path,message:'Duplicate exact identity',severity:'error'});
  };
  const reference=(value:Json,path:string)=>unknown(object(value),['documentId','moduleId','elementId'],path);
  const constant=(value:ObjectValue,path:string)=>{
   reference(value.field!,path+'/field');
   if(canonicalSchemaJson(value.value).length>4096)diagnostics.push({code:'PROTECTION_BOUND',path:path+'/value',message:'resource-exhausted: canonical literal exceeds4096 UTF-16 units',severity:'error'});
  };
  const catalog=object(source),transforms=catalog.transforms as Json[];
  unknown(catalog,['vocabulary','version','id','revision','transforms','native'],'');
  const identities=new Set<string>();
  transforms.forEach((entry,i)=>{
   const transform=object(entry),path='/transforms/'+i;
   // Exact tuple encoding: no delimiter collisions or Unicode normalization.
   const identity=JSON.stringify([transform.id,transform.version]);
   if(identities.has(identity))diagnostics.push({code:'PROTECTION_DUPLICATE',path,message:'Duplicate transform id/version pair',severity:'error'});
   identities.add(identity);
   unknown(transform,['id','version','kind','inputDomain','outputDomain','determinism','reversibility','disclosureProfile','queryUse','parameters','function','algorithm','saltCustody','custody','reverseAction'],path);
   reference(transform.inputDomain!,path+'/inputDomain');reference(transform.outputDomain!,path+'/outputDomain');
   unknown(object(transform.queryUse!),['predicate','order','group','join','aggregate'],path+'/queryUse');
   const parameters=transform.parameters as Json[];
   duplicate(parameters.map(p=>object(p).name as string),path+'/parameters');
   parameters.forEach((p,j)=>{
    const parameter=object(p),at=path+'/parameters/'+j;
    unknown(parameter,['name','field','value'],at);constant(parameter,at);
   });
   (transform.disclosureProfile as Json[]).forEach((p,j)=>{
    if(typeof p==='string')return;
    const property=object(p),at=path+'/disclosureProfile/'+j;
    unknown(property,property.kind==='range'?['kind','bucket']:['kind','length'],at);
    if(property.kind==='range'){
     const bucket=object(property.bucket!);unknown(bucket,['field','value'],at+'/bucket');constant(bucket,at+'/bucket');
    }
   });
   if(transform.saltCustody){
    const salt=object(transform.saltCustody);unknown(salt,salt.kind==='none'?['kind']:['kind','owner','keyRef'],path+'/saltCustody');
   }
   if(transform.custody){
    const custody=object(transform.custody);
    unknown(custody,['owner','vaultRef','keyRef','formatPreserving','storageEffect','propagation','vaultWriteAction'],path+'/custody');
    unknown(object(custody.propagation!),['history','snapshots','exports','feeds','caches'],path+'/custody/propagation');
   }
  });
 }
 diagnostics.push({code:'PROTECTION_UNIMPLEMENTED',path:'',message:'Wire structure and local bounds only; domain/function/query closure, action binding and native custody remain unimplemented',severity:'warning'});
 return {source,valid:!diagnostics.some(d=>d.severity==='error'),complete:false,diagnostics};
}

/** Fail closed until the complete catalog interpreter is implemented and qualified. */
export function requireProtectionInterpretation(input:unknown):never {
 const result=inspectProtectionCatalog(input);
 const failure=result.diagnostics.find(d=>d.severity==='error')??result.diagnostics[0]!;
 throw new UmfError(failure.code,failure.message,failure.path);
}
