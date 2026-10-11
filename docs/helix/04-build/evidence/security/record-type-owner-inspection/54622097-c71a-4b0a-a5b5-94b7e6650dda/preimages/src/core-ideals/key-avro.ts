import {copyJson} from '../model/json';
import {UmfError,type Document,type Json,type Diagnostic,type ExtensionPackage} from '../model/types';
import type {NativeJson} from '../model/native-json';
import {exportAvroBundle,importAvroSchema,getAvroNode} from '../adapters/avro';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import nullability from '../../spec/core/nullability-document.schema.json';import cardinality from '../../spec/core/cardinality-document.schema.json';import facets from '../../spec/core/facet-document.schema.json';import keys from '../../spec/core/key-document.schema.json';
import schema from '../../spec/core/avro-key-classification.schema.json';
import manifest from '../../spec/extensions/avro-keys/package.json';
export const AVRO_KEYS_EXTENSION='umf.avro.keys';
export const avroKeysPackage=manifest as unknown as ExtensionPackage;
export {default as avroKeyClassificationSchema} from '../../spec/core/avro-key-classification.schema.json';
export interface AvroKeyArchive {schema:string;dependencies:{id:string;schema:string}[]}
export interface AvroKeyRequest {mode:'strict'|'report';profile:'schema-declarations';nativeSource:AvroKeyArchive}
export interface AvroKeyObservation {nativePath:string;name:string;fields:{name:string;nativePath:string}[];enforcement:'not-expressible';authorIntent:'unknown';provenance:'inferred';scope:'schema-declaration'}
const binding=schema.properties.binding.const,recovery='Original native archive retained; no authored key inferred' as const;
export interface AvroKeyClassification {operation:'classify-avro-keys';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:AvroKeyRequest;binding:typeof binding;observations:AvroKeyObservation[];residuals:{path:string;value:Json;outcome:'not-expressible';reason:string;recovery:typeof recovery}[];diagnostics:Diagnostic[]}
const validator=createValidator(false);for(const s of [legacy,fields,nullability,cardinality,facets,keys])validator.addSchema(s);
const check=validator.compile(schema),requestCheck=validator.compile(schema.properties.request);
const canonical=(v:Json):string=>Array.isArray(v)?'a['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'o{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k]!)).join(',')+'}':JSON.stringify(v);
const same=(a:unknown,b:unknown)=>canonical(copyJson(a))===canonical(copyJson(b));
/** Observe record declarations; unknown metadata, field order and defaults never assert identity. */
export function classifyAvroKeys(input:Document,options:AvroKeyRequest):AvroKeyClassification {
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as AvroKeyRequest;
 if(!requestCheck(request))throw new UmfError('AVRO_KEY_REQUEST',JSON.stringify(requestCheck.errors));
 const archived=importAvroSchema(request.nativeSource.schema,{id:source.id,dependencies:request.nativeSource.dependencies});
 const expected=exportAvroBundle(archived),actual=exportAvroBundle(source);
 if(actual.schema!==expected.schema||!same(actual.dependencies,expected.dependencies))throw new UmfError('AVRO_KEY_SOURCE','Retained native archive does not match current native representation');
 const result:AvroKeyClassification={operation:'classify-avro-keys',version:'1.0.0',status:'classified',source,request,binding,observations:[],residuals:[],diagnostics:[]};
 const loss=(path:string,value:unknown,reason:string)=>result.residuals.push({path,value:copyJson(value),outcome:'not-expressible',reason,recovery});
 loss('/request/nativeSource',request.nativeSource,'Avro schemas do not enforce collection uniqueness or establish authored key IDs, names, primary or alternate intent. Sort order, defaults, union branches, logical annotations and unknown metadata remain native');
 function walk(node:NativeJson,path:string){
  if(node.kind==='array'){node.items.forEach((n,i)=>walk(n,path+'/'+i));return;}
  if(node.kind!=='object')return;const m=node.members;
  if(m.type?.kind==='string'&&m.type.value==='record'&&m.name?.kind==='string'&&m.fields?.kind==='array'){
   const observed:AvroKeyObservation={nativePath:path,name:m.name.value,fields:[],enforcement:'not-expressible',authorIntent:'unknown',provenance:'inferred',scope:'schema-declaration'};
   m.fields.items.forEach((f,i)=>{if(f.kind==='object'&&f.members.name?.kind==='string'){observed.fields.push({name:f.members.name.value,nativePath:path+'/fields/'+i});if(f.members.type)walk(f.members.type,path+'/fields/'+i+'/type');}});
   result.observations.push(observed);
  }
  for(const key of ['items','values'])if(m[key])walk(m[key]!,path+'/'+key);
  if(m.type&&m.type.kind!=='string')walk(m.type,path+'/type');
 }
 walk(getAvroNode(source,''),'/schema');request.nativeSource.dependencies.forEach((d,i)=>walk(getAvroNode(source,'',d.id),'/dependencies/'+i+'/schema'));
 const conflict=source.extensions&&Object.hasOwn(source.extensions,AVRO_KEYS_EXTENSION),vocabulary=source.vocabularies[AVRO_KEYS_EXTENSION];
 if(conflict)loss('/extensions/'+AVRO_KEYS_EXTENSION,source.extensions![AVRO_KEYS_EXTENSION],'Existing observations cannot be overwritten; reclassify the retained original source');
 if(vocabulary&&vocabulary.version!=='1.0.0')loss('/vocabularies/'+AVRO_KEYS_EXTENSION,vocabulary,'Unsupported classification vocabulary');
 if(request.mode==='strict'||conflict||vocabulary&&vocabulary.version!=='1.0.0')result.status='blocked';
 else {result.target=copyJson(source) as unknown as Document;result.target.vocabularies[AVRO_KEYS_EXTENSION]={version:'1.0.0'};result.target.extensions??={};result.target.extensions[AVRO_KEYS_EXTENSION]=copyJson({origin:'classified',binding,nativeSource:request.nativeSource,observations:result.observations});if(!validateDocument(result.target).valid)throw new UmfError('AVRO_KEY_TARGET','Classification target is invalid');}
 result.diagnostics=result.residuals.map(r=>({code:'AVRO_KEY_LOSS',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const copied=copyJson(result);if(!check(copied))throw new UmfError('AVRO_KEY_RESULT',JSON.stringify(check.errors));return copied as unknown as AvroKeyClassification;
}
export function verifyAvroKeyClassification(input:AvroKeyClassification,current:Document):AvroKeyClassification {
 const receipt=copyJson(input) as unknown as AvroKeyClassification;if(!check(receipt)||receipt.status!=='classified')throw new UmfError('AVRO_KEY_RECEIPT','Expected complete successful classification');
 if(!same(receipt,classifyAvroKeys(receipt.source,receipt.request)))throw new UmfError('AVRO_KEY_RECEIPT','Classification differs from retained inputs');
 if(!same(receipt.target,current))throw new UmfError('AVRO_KEY_STALE','Current target differs');return receipt;
}
export function recoverAvroKeySource(input:AvroKeyClassification,current:Document):AvroKeyArchive {return copyJson(verifyAvroKeyClassification(input,current).request.nativeSource) as unknown as AvroKeyArchive;}
