import {copyJson} from '../model/json';
import {UmfError,type Document,type Json,type Diagnostic,type ExtensionPackage} from '../model/types';
import {exportParquetCapture} from '../adapters/parquet';
import {getParquetFieldMetadata} from '../adapters/parquet/field-metadata';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import nullability from '../../spec/core/nullability-document.schema.json';import cardinality from '../../spec/core/cardinality-document.schema.json';import facets from '../../spec/core/facet-document.schema.json';import keys from '../../spec/core/key-document.schema.json';import relationships from '../../spec/core/relationship-document.schema.json';
import schema from '../../spec/core/parquet-relationship-classification.schema.json';
import manifest from '../../spec/extensions/parquet-relationships/package.json';
export const PARQUET_RELATIONSHIPS_EXTENSION='umf.parquet.relationships';
export const parquetRelationshipsPackage=manifest as unknown as ExtensionPackage;
export {default as parquetRelationshipClassificationSchema} from '../../spec/core/parquet-relationship-classification.schema.json';
export interface ParquetRelationshipRequest {mode:'strict'|'report';profile:'file-schema'}
export interface ParquetRelationshipObservation {nativePath:string;index:number;path:string[];kind:'physical-leaf'|'physical-group';definitionLevel:number;repetitionLevel:number;nativeField:Json;enforcement:'not-expressible';authorIntent:'unknown';provenance:'inferred';scope:'file-schema'}
const binding=schema.properties.binding.const,recovery='Original native archive retained; no authored relationship inferred' as const;
export interface ParquetRelationshipClassification {operation:'classify-parquet-relationships';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:ParquetRelationshipRequest;binding:typeof binding;observations:ParquetRelationshipObservation[];residuals:{path:string;value:Json;outcome:'not-expressible';reason:string;recovery:typeof recovery}[];diagnostics:Diagnostic[]}
const validator=createValidator(false);for(const s of [legacy,fields,nullability,cardinality,facets,keys,relationships])validator.addSchema(s);
const check=validator.compile(schema),requestCheck=validator.compile(schema.properties.request);
const canonical=(v:Json):string=>Array.isArray(v)?'a['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'o{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k]!)).join(',')+'}':JSON.stringify(v);
const same=(a:unknown,b:unknown)=>canonical(copyJson(a))===canonical(copyJson(b));
/** Observe physical schema only. Sorting, field IDs, statistics and metadata never assert identity. */
export function classifyParquetRelationships(input:Document,options:ParquetRelationshipRequest):ParquetRelationshipClassification {
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as ParquetRelationshipRequest;
 if(!requestCheck(request))throw new UmfError('PARQUET_RELATIONSHIP_REQUEST',JSON.stringify(requestCheck.errors));
 exportParquetCapture(source);const view=getParquetFieldMetadata(source);
 const result:ParquetRelationshipClassification={operation:'classify-parquet-relationships',version:'1.0.0',status:'classified',source,request,binding,observations:[],residuals:[],diagnostics:[]};
 const loss=(path:string,value:unknown,reason:string)=>result.residuals.push({path,value:copyJson(value),outcome:'not-expressible',reason,recovery});
 loss('/modules',source.modules,'Parquet schemas do not enforce target existence, graph identity, reverse multiplicity or collection uniqueness or establish authored relationship IDs, names, lifecycle or participation intent. Original bytes retain page encodings, repetition/container roles, field IDs, statistics, sorting and embedded Arrow metadata; schema observation does not verify page values or file-wide validity');
 if(view.status==='checked')result.observations=view.fields.map(f=>({nativePath:'/schema/'+f.index,index:f.index,path:f.path,kind:f.nativeField!==null&&typeof f.nativeField==='object'&&!Array.isArray(f.nativeField)&&Object.hasOwn(f.nativeField,'type')?'physical-leaf':'physical-group',definitionLevel:f.definitionLevel,repetitionLevel:f.repetitionLevel,nativeField:copyJson(f.nativeField),enforcement:'not-expressible',authorIntent:'unknown',provenance:'inferred',scope:'file-schema'}));
 else loss('/modules',view.diagnostics,'Native schema cannot be checked; no partial relationship observations are published');
 const conflict=source.extensions&&Object.hasOwn(source.extensions,PARQUET_RELATIONSHIPS_EXTENSION),vocabulary=source.vocabularies[PARQUET_RELATIONSHIPS_EXTENSION];
 if(conflict)loss('/extensions/'+PARQUET_RELATIONSHIPS_EXTENSION,source.extensions![PARQUET_RELATIONSHIPS_EXTENSION],'Existing observations cannot be overwritten; reclassify retained original source');
 if(vocabulary&&vocabulary.version!=='1.0.0')loss('/vocabularies/'+PARQUET_RELATIONSHIPS_EXTENSION,vocabulary,'Unsupported classification vocabulary');
 if(request.mode==='strict'||view.status!=='checked'||conflict||vocabulary&&vocabulary.version!=='1.0.0')result.status='blocked';
 else {result.target=copyJson(source) as unknown as Document;result.target.vocabularies[PARQUET_RELATIONSHIPS_EXTENSION]={...result.target.vocabularies[PARQUET_RELATIONSHIPS_EXTENSION],version:'1.0.0'};result.target.extensions??={};result.target.extensions[PARQUET_RELATIONSHIPS_EXTENSION]=copyJson({origin:'classified',binding,observations:result.observations});if(!validateDocument(result.target).valid)throw new UmfError('PARQUET_RELATIONSHIP_TARGET','Invalid classification target');}
 result.diagnostics=result.residuals.map(r=>({code:'PARQUET_RELATIONSHIP_LOSS',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const copied=copyJson(result);if(!check(copied))throw new UmfError('PARQUET_RELATIONSHIP_RESULT',JSON.stringify(check.errors));return copied as unknown as ParquetRelationshipClassification;
}
export function verifyParquetRelationshipClassification(input:ParquetRelationshipClassification,current:Document):ParquetRelationshipClassification {
 const receipt=copyJson(input) as unknown as ParquetRelationshipClassification;if(!check(receipt)||receipt.status!=='classified')throw new UmfError('PARQUET_RELATIONSHIP_RECEIPT','Expected successful classification');
 if(!same(receipt,classifyParquetRelationships(receipt.source,receipt.request)))throw new UmfError('PARQUET_RELATIONSHIP_RECEIPT','Classification differs from retained inputs');if(!same(receipt.target,current))throw new UmfError('PARQUET_RELATIONSHIP_STALE','Current target differs');return receipt;
}
export function recoverParquetRelationshipSource(input:ParquetRelationshipClassification,current:Document):Uint8Array {return exportParquetCapture(verifyParquetRelationshipClassification(input,current).source);}
