// SPDX-License-Identifier: MIT OR Apache-2.0
/** Private stored-carrier source selection; no read permission, query compiler or native authority. */
import wire from '../../../spec/extensions/security-protection/schema.json';
import {copyJson} from '../../model/json';
import type {Json} from '../../model/types';
import {createValidator} from '../../validation/schema';
import {validateCandidateCatalogStorage} from './catalog-storage-candidate';
import {readCandidateCatalogProgram} from './catalog-program-candidate';
import {checkProtectionParametersWithinBudget} from './protection/parameters';
import {ProtectionLiteralBudget} from './protection/literals';
import {compareSelectedProtectionQueryProperties,type ProtectionQueryPropertyInspection} from './protection/queries';
const defs:any=copyJson(wire.$defs);
function close(v:any):void{if(v&&typeof v==='object'){if(v.properties)v.additionalProperties=false;for(const x of Object.values(v))close(x);}}
close(defs);
const reference={type:'object',properties:{documentId:{type:'string',minLength:1,maxLength:4096},moduleId:{type:'string',minLength:1,maxLength:4096},elementId:{type:'string',minLength:1,maxLength:4096}},required:['documentId','moduleId','elementId'],additionalProperties:false};
const check=createValidator().compile({type:'object',properties:{type:reference,field:reference,operator:{enum:['predicate','join','group','order','aggregate']},required:{type:'array',minItems:1,maxItems:32,items:{$ref:'#/$defs/property'}}},required:['type','field','operator','required'],additionalProperties:false,$defs:defs});
const id=(r:any)=>JSON.stringify([r.documentId,r.moduleId,r.elementId]);
const fail=(message:string):never=>{throw Error(message);};
function freeze<T>(v:T):T{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
export interface CandidateStoredQueryPropertyInspection {
 status:'selected'|'refused';complete:false;authority:false;
 owner:Json;use:Json;policy:Json;catalog:Json;closure:Json;ontology:Json;
 selection:Json;report:ProtectionQueryPropertyInspection|null;diagnostics:readonly string[];
}
export function inspectCandidateStoredQueryProperties(handle:unknown,ownerInput:unknown,useInput:unknown):CandidateStoredQueryPropertyInspection {
 let owner:Json=null,use:Json=null,policy:Json=null,catalog:Json=null,closure:Json=null,ontology:Json=null,selection:Json=null,report:ProtectionQueryPropertyInspection|null=null;
 const diagnostics:string[]=[],finish=(status:'selected'|'refused')=>freeze({status,complete:false as const,authority:false as const,owner,use,policy,catalog,closure,ontology,selection:status==='selected'?selection:null,report:status==='selected'?report:null,diagnostics});
 try{
  const program=readCandidateCatalogProgram(handle);({policy,catalog,closure}=program);ontology=program.ontology.ontology;
  owner=copyJson(ownerInput);use=copyJson(useInput);
  const budget=new ProtectionLiteralBudget(),pending:Json[]=[owner,use];let units=0;
  while(pending.length){budget.step();const x=pending.pop();if(typeof x==='string')units+=x.length;else if(x&&typeof x==='object')for(const [key,value] of Object.entries(x)){units+=key.length;pending.push(value);}if(units>4_000_000)fail('Source text budget exhausted');}
  const o=owner as any,u=use as any,c=catalog as any;
  if(!check(use)||!c)fail('Exact stored-query source profile required');
  const storage=validateCandidateCatalogStorage(program,o,()=>budget.step());
  const entry=storage.get(JSON.stringify([id(u.type),id(u.field)]));if(entry?.storageEffect!=='stored-transformed')fail('Selected live stored Field required');
  const transform=c.transforms.find((t:any)=>t.id===entry.storageTransform.id&&t.version===entry.storageTransform.version);
  const parameters=checkProtectionParametersWithinBudget(policy,catalog,closure,budget);if(parameters.status==='refused')fail('Parameter validation refused');
  report=compareSelectedProtectionQueryProperties(parameters,use,transform,budget,[...parameters.diagnostics]);
  selection={type:u.type,field:u.field,storageTransform:entry.storageTransform,queryDomain:transform.outputDomain,inputDomain:transform.inputDomain};
  diagnostics.push('Conditional storage classification only; supplied query dependencies, owner provenance, effective read disposition, fixed runtime/key scope and native admission remain unverified');
  return finish('selected');
 }catch{diagnostics.push('Stored-query source resolution refused');return finish('refused');}
}
