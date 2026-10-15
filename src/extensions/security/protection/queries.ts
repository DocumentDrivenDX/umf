/** Conditional property comparison, never query/compiler admission. */
import wire from '../../../../spec/extensions/security-protection/schema.json';
import {copyJson} from '../../../model/json';
import {canonicalSchemaJson} from '../../../model/schema-literals';
import {UmfError,type Json,type Diagnostic} from '../../../model/types';
import {createValidator} from '../../../validation/schema';
import {checkProtectionParametersWithinBudget,protectionFieldIndex,type ProtectionParameterValidation} from './parameters';
import {ProtectionLiteralBudget} from './literals';
const defs:any=copyJson(wire.$defs);
function close(v:any):void{if(v&&typeof v==='object'){if(v.properties)v.additionalProperties=false;for(const x of Object.values(v))close(x);}}
close(defs);
const check=createValidator().compile({type:'object',properties:{ruleIndex:{type:'integer',minimum:0},disclosureIndex:{type:'integer',minimum:0},operator:{enum:['predicate','join','group','order','aggregate']},required:{type:'array',minItems:1,maxItems:32,items:{$ref:'#/$defs/property'}}},required:['ruleIndex','disclosureIndex','operator','required'],additionalProperties:false,$defs:defs});
export interface ProtectionQueryPropertyInspection extends Omit<ProtectionParameterValidation,'status'|'validated'> {
 status:'compatible-properties'|'prohibited'|'requires-original-action'|'refused';use:Json;
 authoredProperties:readonly Json[];impliedProperties:readonly Json[];effectiveProperties:readonly Json[];
 requiredProperties:readonly Json[];missingProperties:readonly Json[];
}
function freeze<T>(v:T):T{if(v!==null&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;}
function bounded(v:Json):boolean{let text=0;const pending=[v];while(pending.length){const x=pending.pop()!;if(typeof x==='string')text+=x.length;else if(x!==null&&typeof x==='object'){if(Array.isArray(x)){for(const item of x)pending.push(item);}else for(const k of Object.keys(x)){text+=k.length;if(text>4_000_000)return false;pending.push(x[k]!);}}if(text>4_000_000)return false;}return true;}
export function inspectProtectionQueryProperties(policy:unknown,catalog:unknown,closure:unknown,useInput:unknown):ProtectionQueryPropertyInspection {
 const budget=new ProtectionLiteralBudget(),parameters=checkProtectionParametersWithinBudget(policy,catalog,closure,budget),diagnostics:Diagnostic[]=[...parameters.diagnostics];
 let use:Json=null;const authoredProperties:Json[]=[],impliedProperties:Json[]=[],effectiveProperties:Json[]=[],requiredProperties:Json[]=[],missingProperties:Json[]=[];
 const finish=(status:ProtectionQueryPropertyInspection['status'])=>freeze<ProtectionQueryPropertyInspection>({status,complete:false,authority:false,policy:parameters.policy,catalog:parameters.catalog,closure:parameters.closure,use,authoredProperties,impliedProperties,effectiveProperties,requiredProperties,missingProperties,diagnostics});
 const add=(code:string,path:string,message:string)=>diagnostics.push({code,path,message,severity:'error'});
 try{use=copyJson(useInput);}catch(error){if(!(error instanceof UmfError))throw error;add(error.code,error.path,error.message);return finish('refused');}
 if(!bounded(use)){add('PROTECTION_QUERY_BOUND','/use','resource-exhausted: use key/string text exceeds4000000 UTF-16 units');return finish('refused');}
 if(!check(use)){for(const e of check.errors??[])add('PROTECTION_QUERY_STRUCTURE','/use'+e.instancePath,e.message??'Invalid property requirement');return finish('refused');}
 if(parameters.status==='refused')return finish('refused');
 const u=use as any,p=parameters.policy as any,c=parameters.catalog as any;
 const disposition=p.rules[u.ruleIndex]?.disclosure?.[u.disclosureIndex]?.disposition;
 if(disposition?.kind!=='transformed'||disposition.vocabulary!=='umf.security.protection'){add('PROTECTION_QUERY_SELECTION','/use','Actual catalog disposition required');return finish('refused');}
 const transform=c.transforms.find((t:any)=>t.id===disposition.transform&&t.version===disposition.version);
 if(!transform){add('PROTECTION_QUERY_SELECTION','/use','Exact selected transform missing');return finish('refused');}
 const fields=protectionFieldIndex(parameters.closure);
 const key=(property:Json):string=>{
  budget.step();
  if(property!==null&&typeof property==='object'&&!Array.isArray(property)&&(property as any).kind==='range'){
   const bucket=(property as any).bucket,ref=bucket.field;
   const field=fields.get(ref);if(!field)throw new UmfError('PROTECTION_QUERY_PROPERTY_FIELD','Qualified requirement Field missing');
   if(canonicalSchemaJson(bucket.value).length>4096)throw new UmfError('PROTECTION_QUERY_BOUND','resource-exhausted: requirement literal exceeds4096 UTF-16 units');
   // Coordinates here only intern an already qualified exact Field in this one
   // retained closure; they are never reconstructed global/logical row identity.
   return budget.retain(JSON.stringify(['range',field.documentIndex,field.moduleIndex,field.elementIndex,budget.identity(field.doc,field.field,bucket.value)]));
  }
  return budget.retain(canonicalSchemaJson(property));
 };
 try{
  for(const property of transform.disclosureProfile)authoredProperties.push(property);
  if(transform.determinism==='deterministic'||transform.determinism==='keyed-deterministic')impliedProperties.push('equality');
  const effective=new Map<string,Json>();
  for(const prop of [...authoredProperties,...impliedProperties]){const identity=key(prop);if(!effective.has(identity)){effective.set(identity,prop);effectiveProperties.push(prop);}}
  const required=new Map<string,Json>();
  for(const prop of [...u.required,...(['join','group'].includes(u.operator)?['equality']:u.operator==='order'?['order']:[])]){const identity=key(prop);if(!required.has(identity)){required.set(identity,prop);requiredProperties.push(prop);}}
  for(const [identity,prop] of required){budget.step();if(!effective.has(identity))missingProperties.push(prop);}
 }catch(error){if(!(error instanceof UmfError))throw error;add(error.code,'/use',error.message);return finish('refused');}
 diagnostics.push({code:'PROTECTION_QUERY_ASSUMPTIONS',path:'/use',severity:'warning',message:'Retained supplied dependency assumptions, not proof of actual compiler derivation or function facts; no query/native authority'});
 const mode=transform.queryUse[u.operator]??'prohibited';
 if(mode==='prohibited')return finish('prohibited');
 if(mode==='original-authorized')return finish('requires-original-action');
 if(transform.kind==='tokenize'&&transform.determinism==='random'&&['join','group'].includes(u.operator)){add('PROTECTION_RANDOM_TOKEN_QUERY','/use/operator','Random-token disclosed join/group prohibited even with authored equality');return finish('refused');}
 if(missingProperties.length){add('PROTECTION_QUERY_MISSING','/use/required','Required disclosed properties not retained');return finish('refused');}
 return finish('compatible-properties');
}
