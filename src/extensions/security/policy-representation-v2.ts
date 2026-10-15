/** Proposed0.2 wire operations only. No interpreter or native authority. */
import manifest from '../../../spec/extensions/security-v0.2/package.json';
import originalSchema from '../../../spec/extensions/security/schema.json';
import {copyJson} from '../../model/json';
import {UmfError,pointer,type Json,type Diagnostic,type ExtensionPackage,type Validation} from '../../model/types';
import {createValidator} from '../../validation/schema';

export const securityV2Package=copyJson(manifest) as unknown as ExtensionPackage;
const schema:any=copyJson(manifest.schema),legacy:any=copyJson(originalSchema);
const validator=createValidator(),check=validator.compile(schema),oldCheck=validator.compile(legacy);
const variants=new WeakMap<object,ReturnType<typeof validator.compile>>();
export interface SecurityPolicyV2Inspection extends Validation {source:Json;complete:false;authority:false}
export interface SecurityPolicySourceMigration {
 status:'migrated'|'refused';source:Json;target?:Json;complete:false;authority:false;diagnostics:readonly Diagnostic[];
}
const diagnostic=(code:string,path:string,message:string,severity:'error'|'warning'='error'):Diagnostic=>({code,path,message,severity});
function frozen<T>(input:T):T {
 if(input!==null&&typeof input==='object'){for(const value of Object.values(input))frozen(value);Object.freeze(input);}return input;
}
/** Post-snapshot ledger only; no total snapshot heap/CPU or parser refinement proof. */
function bounded(source:Json):boolean {
 let units=0;const pending:Json[]=[source];
 while(pending.length){const value=pending.pop()!;
  if(typeof value==='string')units+=value.length;
  else if(value!==null&&typeof value==='object'){
   if(Array.isArray(value))for(const item of value)pending.push(item);
   else for(const key of Object.keys(value)){units+=key.length;if(units>4_000_000)return false;pending.push(value[key]!);}
  }
  if(units>4_000_000)return false;
 }return true;
}
function unknowns(value:any,shape:any,root:any,path='',out:string[]=[]):string[]{
 if(shape.$ref)return unknowns(value,root.$defs[shape.$ref.split('/').at(-1)],root,path,out);
 if(shape.oneOf){const matching=shape.oneOf.filter((variant:any)=>{
  let compiled=variants.get(variant);if(!compiled){compiled=validator.compile({...variant,$defs:root.$defs});variants.set(variant,compiled);}return Boolean(compiled(value));
 });if(matching.length!==1)throw new UmfError('SECURITY_V2_STRUCTURE','Ambiguous known wire variant',path);return unknowns(value,matching[0],root,path,out);}
 if(Array.isArray(value)&&shape.items){value.forEach((v,i)=>unknowns(v,shape.items,root,path+'/'+i,out));return out;}
 if(value!==null&&typeof value==='object'&&!Array.isArray(value)&&shape.properties){
  for(const key of Object.keys(value)){
   const at=path+'/'+pointer(key);
   if(Object.hasOwn(shape.properties,key))unknowns(value[key],shape.properties[key],root,at,out);else out.push(at);
  }
 }return out;
}
function snapshot(input:unknown):{source:Json;diagnostics:Diagnostic[]}{
 let source:Json;
 try{source=copyJson(input);}catch(error){if(!(error instanceof UmfError))throw error;return {source:null,diagnostics:[diagnostic(error.code,error.path,error.message)]};}
 return {source,diagnostics:bounded(source)?[]:[diagnostic('SECURITY_V2_BOUND','','resource-exhausted: source key/string text exceeds4000000 UTF-16 units')]};
}
function shapeDiagnostics(source:Json,compiled:typeof check):Diagnostic[]{
 if(compiled(source))return [];
 return (compiled.errors??[]).map(error=>diagnostic('SECURITY_V2_STRUCTURE',error.instancePath,error.message??'Invalid policy representation'));
}
export function inspectSecurityPolicyV2Source(input:unknown):SecurityPolicyV2Inspection {
 const {source,diagnostics}=snapshot(input);
 if(!diagnostics.length)diagnostics.push(...shapeDiagnostics(source,check));
 if(!diagnostics.some(d=>d.severity==='error'))for(const path of unknowns(source,schema,schema))diagnostics.push(diagnostic('SECURITY_V2_UNKNOWN',path,'Uninterpreted policy source retained','warning'));
 diagnostics.push(diagnostic('SECURITY_V2_UNIMPLEMENTED','','Representation only; no0.2 domain/function/query interpretation or native activation','warning'));
 return frozen({source,valid:!diagnostics.some(d=>d.severity==='error'),complete:false,authority:false,diagnostics});
}
function migrate(input:unknown,revision:unknown,direction:'upgrade'|'downgrade'):SecurityPolicySourceMigration {
 const {source,diagnostics}=snapshot(input);
 const refuse=()=>frozen<SecurityPolicySourceMigration>({status:'refused',source,complete:false,authority:false,diagnostics});
 if(diagnostics.length)return refuse();
 const from=direction==='upgrade'?legacy:schema,to=direction==='upgrade'?schema:legacy;
 const sourceCheck=direction==='upgrade'?oldCheck:check,targetCheck=direction==='upgrade'?check:oldCheck;
 diagnostics.push(...shapeDiagnostics(source,sourceCheck));if(diagnostics.length)return refuse();
 const policy=source as Record<string,Json>;
 if(typeof revision!=='string'||!revision||revision===policy.revision){diagnostics.push(diagnostic('SECURITY_MIGRATION_REVISION','/revision','Explicit new nonempty policy revision required'));return refuse();}
 if(direction==='downgrade'){
  if(Object.hasOwn(policy,'protection'))diagnostics.push(diagnostic('SECURITY_MIGRATION_PROTECTION','/protection','Protection pin requires explicit authoring, not automatic removal'));
  for(const [i,rule] of (policy.rules as any[]).entries())for(const [j,entry] of (rule.disclosure??[]).entries()){
   if(entry.disposition.kind==='transformed'&&Object.hasOwn(entry.disposition,'vocabulary'))diagnostics.push(diagnostic('SECURITY_MIGRATION_PROTECTION',`/rules/${i}/disclosure/${j}/disposition`,'Catalog reference cannot become an inline legacy constant'));
  }
  if(diagnostics.length)return refuse();
 }
 const target=copyJson({...policy,version:direction==='upgrade'?'0.2.0':'0.1.0',revision});
 if(!bounded(target)){diagnostics.push(diagnostic('SECURITY_V2_BOUND','','resource-exhausted: target key/string text exceeds4000000 UTF-16 units'));return refuse();}
 diagnostics.push(...shapeDiagnostics(target,targetCheck));if(diagnostics.length)return refuse();
 const before=new Set(unknowns(source,from,from)),after=new Set(unknowns(target,to,to));
 for(const path of new Set([...before,...after]))if(before.has(path)!==after.has(path))diagnostics.push(diagnostic('SECURITY_MIGRATION_MEANING',path,'Known/unknown member classification changes; explicit authoring required'));
 if(diagnostics.length)return refuse();
 for(const path of before)diagnostics.push(diagnostic('SECURITY_MIGRATION_UNKNOWN',path,'Unknown source content retained unchanged','warning'));
 return frozen({status:'migrated',source,target,complete:false,authority:false,diagnostics});
}
export const upgradeSecurityPolicySource=(input:unknown,revision:unknown):SecurityPolicySourceMigration=>migrate(input,revision,'upgrade');
export const downgradeSecurityPolicySource=(input:unknown,revision:unknown):SecurityPolicySourceMigration=>migrate(input,revision,'downgrade');
