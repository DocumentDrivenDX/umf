import {copyJson} from '../model/json';
import {UmfError,type Document,type Json,type Diagnostic,type ExtensionPackage} from '../model/types';
import type {NativeJson} from '../model/native-json';
import {exportAvroBundle,importAvroSchema,getAvroNode} from '../adapters/avro';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import nullability from '../../spec/core/nullability-document.schema.json';import cardinality from '../../spec/core/cardinality-document.schema.json';import facets from '../../spec/core/facet-document.schema.json';import keys from '../../spec/core/key-document.schema.json';
import relationships from '../../spec/core/relationship-document.schema.json';
import schema from '../../spec/core/avro-relationship-classification.schema.json';
import manifest from '../../spec/extensions/avro-relationships/package.json';
export const AVRO_RELATIONSHIPS_EXTENSION='umf.avro.relationships';
export const avroRelationshipsPackage=manifest as unknown as ExtensionPackage;
export {default as avroRelationshipClassificationSchema} from '../../spec/core/avro-relationship-classification.schema.json';
export interface AvroRelationshipArchive {schema:string;dependencies:{id:string;schema:string}[]}
export interface AvroRelationshipRequest {mode:'strict'|'report';profile:'schema-structure';nativeSource:AvroRelationshipArchive}
export interface AvroRelationshipObservation {nativePath:string;kind:'record'|'named-type-token'|'union'|'array'|'map';nativeNode:NativeJson;nameResolution:'unverified';enforcement:'not-expressible';authorIntent:'unknown';provenance:'inferred';scope:'schema-structure'}
const binding=schema.properties.binding.const,recovery='Original native archive retained; no authored relationship inferred' as const;
export interface AvroRelationshipClassification {operation:'classify-avro-relationships';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:AvroRelationshipRequest;binding:typeof binding;observations:AvroRelationshipObservation[];residuals:{path:string;value:Json;outcome:'not-expressible';reason:string;recovery:typeof recovery}[];diagnostics:Diagnostic[]}
const validator=createValidator(false);for(const s of [legacy,fields,nullability,cardinality,facets,keys,relationships])validator.addSchema(s);
const check=validator.compile(schema),requestCheck=validator.compile(schema.properties.request);
const canonical=(v:Json):string=>Array.isArray(v)?'a['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'o{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k]!)).join(',')+'}':JSON.stringify(v);
const same=(a:unknown,b:unknown)=>canonical(copyJson(a))===canonical(copyJson(b));
/** Observe native schema grammar without resolving names or inferring authored associations. */
export function classifyAvroRelationships(input:Document,options:AvroRelationshipRequest):AvroRelationshipClassification {
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as AvroRelationshipRequest;
 if(!requestCheck(request))throw new UmfError('AVRO_RELATIONSHIP_REQUEST',JSON.stringify(requestCheck.errors));
 const archived=importAvroSchema(request.nativeSource.schema,{id:source.id,dependencies:request.nativeSource.dependencies});
 const expected=exportAvroBundle(archived),actual=exportAvroBundle(source);
 if(actual.schema!==expected.schema||!same(actual.dependencies,expected.dependencies))throw new UmfError('AVRO_RELATIONSHIP_SOURCE','Retained native archive does not match current native representation');
 const result:AvroRelationshipClassification={operation:'classify-avro-relationships',version:'1.0.0',status:'classified',source,request,binding,observations:[],residuals:[],diagnostics:[]};
 const loss=(path:string,value:unknown,reason:string)=>result.residuals.push({path,value:copyJson(value),outcome:'not-expressible',reason,recovery});
 loss('/request/nativeSource',request.nativeSource,'Avro schema structure does not establish authored associations, stable target Key resolution, referential enforcement or participation bounds. The complete original native archive remains attached');
 const primitives=new Set(['null','boolean','int','long','float','double','bytes','string']);
 function observe(node:NativeJson,path:string,kind:AvroRelationshipObservation['kind']){
  result.observations.push({nativePath:path,kind,nativeNode:copyJson(node) as unknown as NativeJson,nameResolution:'unverified',enforcement:'not-expressible',authorIntent:'unknown',provenance:'inferred',scope:'schema-structure'});
  loss(path,node,'Native '+kind+' structure does not establish an authored association; name resolution, Record/Key identity and participation remain unverified');
 }
 function walk(node:NativeJson,path:string){
  if(node.kind==='string'){if(!primitives.has(node.value))observe(node,path,'named-type-token');return;}
  if(node.kind==='array'){observe(node,path,'union');node.items.forEach((n,i)=>walk(n,path+'/'+i));return;}
  if(node.kind!=='object')return;
  const m=node.members,t=m.type;
  if(t?.kind==='string'){
   if(t.value==='record'){
    observe(node,path,'record');
    if(m.fields?.kind==='array')m.fields.items.forEach((f,i)=>{if(f.kind==='object'&&f.members.type)walk(f.members.type,path+'/fields/'+i+'/type');});
   }else if(t.value==='array'){
    observe(node,path,'array');if(m.items)walk(m.items,path+'/items');
   }else if(t.value==='map'){
    observe(node,path,'map');if(m.values)walk(m.values,path+'/values');
   }else if(!primitives.has(t.value)&&!['enum','fixed'].includes(t.value))walk(t,path+'/type');
  }else if(t)walk(t,path+'/type');
 }
 walk(getAvroNode(source,''),'/schema');request.nativeSource.dependencies.forEach((d,i)=>walk(getAvroNode(source,'',d.id),'/dependencies/'+i+'/schema'));
 const conflict=source.extensions&&Object.hasOwn(source.extensions,AVRO_RELATIONSHIPS_EXTENSION),vocabulary=source.vocabularies[AVRO_RELATIONSHIPS_EXTENSION];
 if(conflict)loss('/extensions/'+AVRO_RELATIONSHIPS_EXTENSION,source.extensions![AVRO_RELATIONSHIPS_EXTENSION],'Existing observations cannot be overwritten; reclassify the retained original source');
 if(vocabulary&&vocabulary.version!=='1.0.0')loss('/vocabularies/'+AVRO_RELATIONSHIPS_EXTENSION,vocabulary,'Unsupported classification vocabulary');
 if(request.mode==='strict'||conflict||vocabulary&&vocabulary.version!=='1.0.0')result.status='blocked';
 else {result.target=copyJson(source) as unknown as Document;result.target.vocabularies[AVRO_RELATIONSHIPS_EXTENSION]={version:'1.0.0'};result.target.extensions??={};result.target.extensions[AVRO_RELATIONSHIPS_EXTENSION]=copyJson({origin:'classified',binding,nativeSource:request.nativeSource,observations:result.observations});if(!validateDocument(result.target).valid)throw new UmfError('AVRO_RELATIONSHIP_TARGET','Classification target is invalid');}
 result.diagnostics=result.residuals.map(r=>({code:'AVRO_RELATIONSHIP_LOSS',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const copied=copyJson(result);if(!check(copied))throw new UmfError('AVRO_RELATIONSHIP_RESULT',JSON.stringify(check.errors));return copied as unknown as AvroRelationshipClassification;
}
export function verifyAvroRelationshipClassification(input:AvroRelationshipClassification,current:Document):AvroRelationshipClassification {
 const receipt=copyJson(input) as unknown as AvroRelationshipClassification;if(!check(receipt)||receipt.status!=='classified')throw new UmfError('AVRO_RELATIONSHIP_RECEIPT','Expected complete successful classification');
 if(!same(receipt,classifyAvroRelationships(receipt.source,receipt.request)))throw new UmfError('AVRO_RELATIONSHIP_RECEIPT','Classification differs from retained inputs');
 if(!same(receipt.target,current))throw new UmfError('AVRO_RELATIONSHIP_STALE','Current target differs');return receipt;
}
export function recoverAvroRelationshipSource(input:AvroRelationshipClassification,current:Document):AvroRelationshipArchive {return copyJson(verifyAvroRelationshipClassification(input,current).request.nativeSource) as unknown as AvroRelationshipArchive;}
