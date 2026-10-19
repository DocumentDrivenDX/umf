import {CURRENT_CORE_VERSION} from '../../../generated/core-model';
import {ProtectionFieldIndex} from './core-fields';
/** Qualified core-definition closure; no function compatibility or native admission. */
import schema from '../../../../spec/extensions/security-protection/domain-resolution.schema.json';
import {copyJson} from '../../../model/json';
import {UmfError,type Json,type Diagnostic,type Document} from '../../../model/types';
import {validateDocument} from '../../../validation/document';
import {candidateCoreSourceComplete} from '../core-source-candidate';
import {createValidator} from '../../../validation/schema';
import type {SecurityRef} from '../types';
import {resolveSecurityProtectionSources} from './references';
const check=createValidator().compile(copyJson(schema) as typeof schema);
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
function bounded(value:Json):boolean{
 let units=0;const pending=[value];
 while(pending.length){const item=pending.pop()!;
  if(typeof item==='string')units+=item.length;
  else if(item!==null&&typeof item==='object'){
   if(Array.isArray(item))for(const child of item)pending.push(child);
   else for(const key of Object.keys(item)){units+=key.length;if(units>4_000_000)return false;pending.push(item[key]!);}
  }
  if(units>4_000_000)return false;
 }return true;
}
/** Exact pins qualify only the supplied immutable core definitions, not their provenance. */
export function resolveSecurityProtectionDomains(policyInput:unknown,catalogInput:unknown,closureInput:unknown):SecurityProtectionDomainResolution {
 const sources=resolveSecurityProtectionSources(policyInput,catalogInput);
 const diagnostics:Diagnostic[]=sources.diagnostics.filter(d=>d.code!=='PROTECTION_UNIMPLEMENTED'&&d.code!=='SECURITY_V2_UNIMPLEMENTED');
 const domains:ProtectionDomainOccurrence[]=[];let closure:Json=null;
 const add=(code:string,path:string,message:string)=>diagnostics.push({code,path,message,severity:'error'});
 const finish=(status:SecurityProtectionDomainResolution['status'])=>{
  if(status==='refused')domains.length=0;
  return freeze<SecurityProtectionDomainResolution>({status,complete:false,authority:false,policy:sources.policy,catalog:sources.catalog,closure,domains,diagnostics});
 };
 try{closure=copyJson(closureInput);}catch(error){if(!(error instanceof UmfError))throw error;add(error.code,error.path,error.message);return finish('refused');}
 if(!bounded(closure)){add('PROTECTION_DOMAIN_BOUND','/closure','resource-exhausted: closure key/string text exceeds4000000 UTF-16 units');return finish('refused');}
 if(!check(closure)){for(const error of check.errors??[])add('PROTECTION_DOMAIN_STRUCTURE','/closure'+error.instancePath,error.message??'Invalid closure');return finish('refused');}
 if(sources.status==='refused'||diagnostics.some(d=>d.code==='PROTECTION_UNKNOWN'||d.code==='SECURITY_V2_UNKNOWN'))return finish('refused');
 const resolved=closure as unknown as ProtectionCoreClosure;
 const pins=new Map<string,string>(),documents=new Map<string,number>();
 for(const [i,pin] of resolved.pins.entries()){
  if(pins.has(pin.documentId))add('PROTECTION_DOMAIN_PIN',`/closure/pins/${i}`,'Duplicate exact document identity');else pins.set(pin.documentId,pin.revision);
 }
 for(const [i,entry] of resolved.documents.entries()){
  const at=`/closure/documents/${i}`,validation=validateDocument(entry.document);
  if(!candidateCoreSourceComplete(entry.document,validation)){
   add('PROTECTION_DOMAIN_DOCUMENT',at,'Known core0.10 security domain required');
   for(const d of validation.diagnostics)diagnostics.push({...d,path:at+'/document'+d.path});
  }
  if(!pins.has(entry.document.id)||pins.get(entry.document.id)!==entry.revision||documents.has(entry.document.id))add('PROTECTION_DOMAIN_PIN',at,'Unpinned, stale or duplicate document');
  else documents.set(entry.document.id,i);
 }
 for(const [id] of pins)if(!documents.has(id))add('PROTECTION_DOMAIN_PIN','/closure/pins','Pinned document missing');
 if(diagnostics.some(d=>d.severity==='error'))return finish('refused');
 const fields=new ProtectionFieldIndex(resolved);
 const locate=(ref:SecurityRef,source:ProtectionDomainOccurrence['source'],path:string)=>{
  const selected=fields.get(ref),definition=selected?{documentIndex:selected.documentIndex,moduleIndex:selected.moduleIndex,elementIndex:selected.elementIndex}:undefined;
  if(definition===undefined)add('PROTECTION_DOMAIN_REFERENCE','/'+source+path,'Exact qualified Field definition missing');
  else domains.push({source,path,ref,definition});
 };
 const catalog=sources.catalog as any,policy=sources.policy as any;
 catalog.transforms.forEach((t:any,i:number)=>{
  const path='/transforms/'+i;
  locate(t.inputDomain,'catalog',path+'/inputDomain');locate(t.outputDomain,'catalog',path+'/outputDomain');
  t.parameters.forEach((p:any,j:number)=>locate(p.field,'catalog',path+'/parameters/'+j+'/field'));
  t.disclosureProfile.forEach((p:any,j:number)=>{if(p!==null&&typeof p==='object'&&p.kind==='range')locate(p.bucket.field,'catalog',path+'/disclosureProfile/'+j+'/bucket/field');});
 });
 for(const ref of sources.references){
  const path=`/rules/${ref.ruleIndex}/disclosure/${ref.disclosureIndex}`,entry=policy.rules[ref.ruleIndex].disclosure[ref.disclosureIndex];
  locate(entry.field,'policy',path+'/field');locate(entry.disposition.field,'policy',path+'/disposition/field');
 }
 diagnostics.push({code:'PROTECTION_DOMAIN_ONLY',path:'',severity:'warning',message:'Core definitions resolved only; domain compatibility, literal/function/query semantics, ontology and native authority remain separate'});
 return finish(diagnostics.some(d=>d.severity==='error')?'refused':'resolved-domains');
}
