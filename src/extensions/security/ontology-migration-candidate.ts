/** Draft migration archive; neither ontology admission nor a published version. */
import {copyJson} from '../../model/json';
import {createValidator} from '../../validation/schema';
import oldSchema from '../../../spec/extensions/security/ontology.schema.json';
import candidateSchema from '../../../docs/helix/02-design/spikes/security/ontology-v0.2.schema.json';
const validator=createValidator(),oldCheck=validator.compile(oldSchema),newCheck=validator.compile(candidateSchema);
const canonical=(v:any):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
function freeze(v:any):any{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
const pointer=(s:string)=>s.replaceAll('~','~0').replaceAll('/','~1');
export function migrateCandidateSecurityOntology(input:unknown,revisionInput:unknown):{source:unknown;target:unknown;residuals:readonly {path:string;reason:string}[]}{
 const packet:any=copyJson({source:input,revision:revisionInput}),source=packet.source;if(!Boolean(oldCheck(source)))throw Error('SECURITY_ONTOLOGY_MIGRATION_SOURCE');
 if(typeof packet.revision!=='string'||!packet.revision||packet.revision===source.revision)throw Error('SECURITY_ONTOLOGY_MIGRATION_REVISION');
 const residuals:{path:string;reason:string}[]=[];
 function unknowns(value:any,schema:any,path:string):void{
  if(schema.$ref){const name=schema.$ref.split('/').at(-1);return unknowns(value,(oldSchema.$defs as any)[name],path);}
  if(Array.isArray(value)&&schema.items){value.forEach((v,i)=>unknowns(v,schema.items,path+'/'+i));return;}
  if(value&&typeof value==='object'&&!Array.isArray(value)&&schema.properties)for(const [key,v] of Object.entries(value)){const child=Object.hasOwn(schema.properties,key)?schema.properties[key]:undefined;if(child)unknowns(v,child,path+'/'+pointer(key));else residuals.push({path:path+'/'+pointer(key),reason:'unknown-source-content-retained'});}
 }
 unknowns(source,oldSchema,'');
 const entities:any[]=[],seen=new Map<string,string>();
 for(const [index,record] of [...source.entities,...source.associations].entries()){
  const entity={type:record.type,keyId:record.keyId,fields:record.fields},id=canonical(record.type),encoded=canonical(entity),previous=seen.get(id);
  if(previous!==undefined){if(previous!==encoded)residuals.push({path:index<source.entities.length?'/entities/'+index:'/associations/'+(index-source.entities.length),reason:'conflicting-record-declarations'});continue;}
  seen.set(id,encoded);entities.push(entity);
 }
 const target={...source,version:'0.2.0',revision:packet.revision,entities,associations:source.associations.map((a:any)=>({kind:'record-members',type:a.type,keyId:a.keyId,endpoints:a.endpoints}))};
 if(!newCheck(target))residuals.push({path:'',reason:'candidate-structure-unresolved'});
 return freeze({source,target:copyJson(target),residuals});
}
