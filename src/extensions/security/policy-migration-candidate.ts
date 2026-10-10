/** Draft policy projection. Requires a separately chosen destination ontology revision. */
import {copyJson} from '../../model/json';
import {createValidator} from '../../validation/schema';
import oldSchema from '../../../spec/extensions/security/schema.json';
import candidateSchema from '../../../docs/helix/02-design/spikes/security/policy-v0.2.schema.json';
const validator=createValidator(),oldCheck=validator.compile(oldSchema),newCheck=validator.compile(candidateSchema),variants=new WeakMap<object,ReturnType<typeof validator.compile>>();
function freeze(v:any):any{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
const pointer=(s:string)=>s.replaceAll('~','~0').replaceAll('/','~1');
export function migrateCandidateSecurityPolicy(input:unknown,ontologyReferenceInput:unknown,policyRevisionInput:unknown):{source:unknown;target:unknown;residuals:readonly {path:string;reason:string}[]}{
 const packet:any=copyJson({source:input,ontology:ontologyReferenceInput,policyRevision:policyRevisionInput}),source=packet.source,reference=packet.ontology;
 if(!Boolean(oldCheck(source)))throw Error('SECURITY_POLICY_MIGRATION_SOURCE');
 if(!reference||typeof reference!=='object'||Array.isArray(reference)||Object.keys(reference).length!==2||!['documentId','revision'].every(k=>Object.hasOwn(reference,k)&&typeof reference[k]==='string'&&reference[k])||(reference.documentId===source.ontology.documentId&&reference.revision===source.ontology.revision))throw Error('SECURITY_POLICY_MIGRATION_REVISION');
 if(typeof packet.policyRevision!=='string'||!packet.policyRevision||packet.policyRevision===source.revision)throw Error('SECURITY_POLICY_MIGRATION_REVISION');
 const residuals:{path:string;reason:string}[]=[];
 function unknowns(value:any,schema:any,path:string):void{
  if(schema.$ref)return unknowns(value,(oldSchema.$defs as any)[schema.$ref.split('/').at(-1)],path);
  if(schema.oneOf){const matching=schema.oneOf.filter((variant:any)=>{let check=variants.get(variant);if(!check){check=validator.compile({...variant,$defs:oldSchema.$defs});variants.set(variant,check);}return Boolean(check(value));});if(matching.length!==1)throw Error('SECURITY_POLICY_MIGRATION_SOURCE');return unknowns(value,matching[0],path);}
  if(Array.isArray(value)&&schema.items){value.forEach((v,i)=>unknowns(v,schema.items,path+'/'+i));return;}
  if(value&&typeof value==='object'&&!Array.isArray(value)&&schema.properties)for(const [key,v] of Object.entries(value)){if(Object.hasOwn(schema.properties,key))unknowns(v,schema.properties[key],path+'/'+pointer(key));else residuals.push({path:path+'/'+pointer(key),reason:'unknown-source-content-retained'});}
 }
 unknowns(source,oldSchema,'');const target=copyJson({...source,version:'0.2.0',revision:packet.policyRevision,ontology:reference});
 if(!newCheck(target))residuals.push({path:'',reason:'candidate-structure-unresolved'});
 return freeze({source,target,residuals});
}
