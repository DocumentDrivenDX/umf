// SPDX-License-Identifier: MIT OR Apache-2.0
/** Private candidate property comparison; public query inspection is Rust-owned. */
import {canonicalSchemaJson} from '../../../model/schema-literals';
import {UmfError,type Json,type Diagnostic} from '../../../model/types';
import {protectionFieldIndex,type ProtectionParameterValidation} from './parameters';
import {ProtectionLiteralBudget} from './literals';
export interface ProtectionQueryPropertyInspection extends Omit<ProtectionParameterValidation,'status'|'validated'> {
 status:'compatible-properties'|'prohibited'|'requires-original-action'|'refused';use:Json;
 authoredProperties:readonly Json[];impliedProperties:readonly Json[];effectiveProperties:readonly Json[];
 requiredProperties:readonly Json[];missingProperties:readonly Json[];
}
export type ProtectionQueryPropertyInspector=(policy:unknown,catalog:unknown,closure:unknown,use:unknown)=>ProtectionQueryPropertyInspection;
function freeze<T>(value:T):T{if(value!==null&&typeof value==='object'){for(const item of Object.values(value as Record<string,unknown>))freeze(item);Object.freeze(value);}return value;}
/** Internal conditional kernel. Selection must be resolved by its source owner; no admission. */
export function compareSelectedProtectionQueryProperties(parameters:ProtectionParameterValidation,use:Json,transform:any,budget:ProtectionLiteralBudget,diagnostics:Diagnostic[]):ProtectionQueryPropertyInspection {
 const u=use as any,authoredProperties:Json[]=[],impliedProperties:Json[]=[],effectiveProperties:Json[]=[],requiredProperties:Json[]=[],missingProperties:Json[]=[];
 const finish=(status:ProtectionQueryPropertyInspection['status'])=>freeze<ProtectionQueryPropertyInspection>({status,complete:false,authority:false,policy:parameters.policy,catalog:parameters.catalog,closure:parameters.closure,use,authoredProperties,impliedProperties,effectiveProperties,requiredProperties,missingProperties,diagnostics});
 const add=(code:string,path:string,message:string)=>diagnostics.push({code,path,message,severity:'error'});
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
