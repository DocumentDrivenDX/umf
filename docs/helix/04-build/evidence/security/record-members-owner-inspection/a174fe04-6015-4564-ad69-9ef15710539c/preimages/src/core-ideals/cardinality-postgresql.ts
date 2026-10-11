import {copyJson} from '../model/json';
import {UmfError,pointer,type Document,type Json,type Diagnostic,type Cardinality,type ExtensionPackage} from '../model/types';
import {parseNativeJson,renderTree,type NativeJson} from '../model/native-json';
import {verifyCoreCardinalityDeclaration,type CoreCardinalityDeclaration} from '../model/cardinality';
import {exportPostgresqlCatalogCapture,getPostgresqlColumnMetadata} from '../adapters/postgresql/catalog';
import {correlatePostgresqlCardinalityCatalog,resolvePostgresqlCardinalityType} from '../adapters/postgresql/cardinality-catalog';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';
import fields from '../../spec/core/field-document.schema.json';
import availability from '../../spec/core/nullability-document.schema.json';
import core from '../../spec/core/cardinality-document.schema.json';
import authorSchema from '../../spec/core/cardinality-operation.schema.json';
import nativeSchema from '../../spec/core/native-json.schema.json';
import schema from '../../spec/core/postgresql-cardinality-classification.schema.json';
import manifest from '../../spec/extensions/postgresql-cardinality/package.json';
export const POSTGRESQL_CARDINALITY_EXTENSION='umf.postgresql.cardinality';
export const postgresqlCardinalityPackage=manifest as unknown as ExtensionPackage;
export {default as postgresqlCardinalityClassificationSchema} from '../../spec/core/postgresql-cardinality-classification.schema.json';
export interface PostgresqlCardinalityRequest {
 column:string;nativeSource:string;supplement:string;mode:'strict'|'report';profile:'stored-value'|'unresolved';author?:CoreCardinalityDeclaration;
}
const binding=schema.properties.binding.const;
const recovery='Retain original native archive and author assertions; classification does not replace native meaning' as const;
export interface PostgresqlCardinalityClassification {
 operation:'classify-postgresql-cardinality';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:PostgresqlCardinalityRequest;binding:typeof binding;
 mapping:{origin:'classified';idealPath:string;nativePath:string;nativeFragment:NativeJson;cardinality:Cardinality;interpretation:'declared'|'unknown'|'unsupported';outcome:'exact'|'approximated'|'unknown'|'not-expressible';basis:'Explicit captured native type relationships; bounds, rank, item and execution semantics remain native'};
 residuals:{path:string;value:Json;reason:string;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
const validator=createValidator();for(const s of [legacy,fields,availability,core,authorSchema,nativeSchema])validator.addSchema(s);
const check=validator.compile(schema),checkRequest=validator.compile(schema.properties.request);
const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k]!)).join(',')+'}':JSON.stringify(value);
/** Classify declared column shape only. Retain vector/item/runtime refinements in the native archive. */
export function classifyPostgresqlCardinality(input:Document,options:PostgresqlCardinalityRequest):PostgresqlCardinalityClassification {
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as PostgresqlCardinalityRequest;
 if(!checkRequest(request))throw new UmfError('POSTGRESQL_CARDINALITY_REQUEST',JSON.stringify(checkRequest.errors));
 if(!validateDocument(source).valid||source.umf!=='0.4.0')throw new UmfError('POSTGRESQL_CARDINALITY_SOURCE','Valid core 0.4.0 required; migrate explicitly');
 const exported=exportPostgresqlCatalogCapture(source);
 if(renderTree(parseNativeJson(request.nativeSource))!==exported.json)throw new UmfError('POSTGRESQL_CARDINALITY_ARCHIVE','Native archive differs from retained source');
 const correspondence=correlatePostgresqlCardinalityCatalog(source,request.supplement);
 if(!correspondence.qualifiedVersion)throw new UmfError('POSTGRESQL_CARDINALITY_VERSION','PostgreSQL 17.4 required');
 const match=correspondence.matches.find(c=>c.column===request.column);
 if(!match)throw new UmfError('POSTGRESQL_CARDINALITY_COLUMN','Column not captured');
 const observed=resolvePostgresqlCardinalityType(request.supplement,match.identity);
 const nativeFragment=getPostgresqlColumnMetadata(source).find(c=>c.path===request.column)!.nativeColumn;
 const mi=source.modules.findIndex(m=>m.id==='postgresql.columns'),ei=source.modules[mi]?.elements.findIndex(e=>e.id===request.column)??-1;
 if(mi<0||ei<0)throw new UmfError('POSTGRESQL_CARDINALITY_COLUMN','Derived Field is missing');
 const element=source.modules[mi]!.elements[ei]!;
 const idealPath=`/modules/${mi}/elements/${ei}/cardinality`,base=request.column+'/nativeType';
 const result:PostgresqlCardinalityClassification={operation:'classify-postgresql-cardinality',version:'1.0.0',status:'classified',source,request,binding,mapping:{origin:'classified',idealPath,nativePath:base,nativeFragment,cardinality:'unspecified',interpretation:'unknown',outcome:'unknown',basis:'Explicit captured native type relationships; bounds, rank, item and execution semantics remain native'},residuals:[],diagnostics:[]};
 const loss=(path:string,value:unknown,reason:string)=>result.residuals.push({path,value:copyJson(value),reason,recovery});
 if(request.profile==='unresolved')loss(base,nativeFragment,'Stored-value scope is unresolved');
 else if(observed.standardArray){
  result.mapping.cardinality='array';result.mapping.interpretation='declared';result.mapping.outcome='approximated';
  loss(base,nativeFragment,'Native arrays permit variable rank and non-default lower bounds; the ideal sequence does not preserve this layout. Declared dimensions do not enforce rank.');
 }else if(observed.native.identity.schema==='pg_catalog'&&observed.native.kind==='b'&&['bool','int2','int4','int8','numeric','float4','float8','text','varchar','bpchar','bytea','date','time','timetz','timestamp','timestamptz','uuid'].includes(observed.native.identity.name)){
  result.mapping.cardinality='one';result.mapping.interpretation='declared';result.mapping.outcome='exact';
 }else{
  result.mapping.interpretation='unsupported';result.mapping.outcome='not-expressible';
  loss(base,nativeFragment,'Native type does not establish a qualified scalar, ideal sequence or exact-string-key map; JSON, vector and other native refinements stay uninterpreted');
 }
 let conflict:string|undefined;
 if(element.kind!=='field')conflict='Selected native member must already be an explicit Field; this operation does not replace its kind';
 if(request.author!==undefined){
  try{
   const author=verifyCoreCardinalityDeclaration(request.author,source);
   if(author.identity.module!=='postgresql.columns'||author.identity.element!==element.id)conflict='Author receipt identifies a different member';
   else if(author.provenance.cardinality!==result.mapping.cardinality)conflict='Authored cardinality differs from the native observation; neither assertion may be overwritten';
  }catch(error){if(!(error instanceof UmfError))throw error;conflict='Author provenance is invalid or stale: '+error.code;}
 }else if(Object.hasOwn(element,'cardinality'))conflict='Existing cardinality requires verified author provenance before native classification';
 if(Object.hasOwn(element.extensions,POSTGRESQL_CARDINALITY_EXTENSION))conflict='Existing binding scope cannot be overwritten; reclassify from its retained source';
 if(source.vocabularies[POSTGRESQL_CARDINALITY_EXTENSION]&&source.vocabularies[POSTGRESQL_CARDINALITY_EXTENSION]!.version!=='1.0.0')conflict='Existing binding vocabulary version is incompatible';
 if(result.mapping.cardinality==='array'&&Object.hasOwn(element,'scalarType'))conflict='Array classification cannot erase or relocate an existing scalar assertion';
 if(Object.hasOwn(element,'itemType'))loss(idealPath.replace(/cardinality$/,'itemType'),element.itemType,'This observation does not classify or confirm item/value meaning; retained author item references stay independent');
 if(conflict){loss(idealPath,Object.hasOwn(element,'cardinality')?element.cardinality:null,conflict);result.mapping.outcome='unknown';}
 if(conflict||request.mode==='strict'&&result.residuals.length)result.status='blocked';
 else{const target=copyJson(source) as unknown as Document;const selected=target.modules[mi]!.elements[ei]!;selected.cardinality=result.mapping.cardinality;
  target.vocabularies[POSTGRESQL_CARDINALITY_EXTENSION]??={version:'1.0.0'};
  selected.extensions[POSTGRESQL_CARDINALITY_EXTENSION]={origin:'classified',nativeSupplement:request.supplement,binding:{id:binding.id,version:binding.version},profile:request.profile,interpretation:result.mapping.interpretation,nativePath:result.mapping.nativePath,basis:result.mapping.basis};if(!validateDocument(target).valid)throw new UmfError('POSTGRESQL_CARDINALITY_TARGET','Classification would violate core constraints');result.target=target;}
 result.diagnostics=result.residuals.map(r=>({code:r.path===idealPath?'POSTGRESQL_CARDINALITY_CONFLICT':'POSTGRESQL_CARDINALITY_UNRESOLVED',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const copied=copyJson(result);if(!check(copied))throw new UmfError('POSTGRESQL_CARDINALITY_RESULT',JSON.stringify(check.errors));return copied as unknown as PostgresqlCardinalityClassification;
}
/** Receipt consistency is not authentication; any model edit requires reclassification. */
export function verifyPostgresqlCardinalityClassification(input:PostgresqlCardinalityClassification,current:Document):PostgresqlCardinalityClassification {
 const receipt=copyJson(input) as unknown as PostgresqlCardinalityClassification;
 if(!check(receipt)||receipt.status!=='classified')throw new UmfError('POSTGRESQL_CARDINALITY_RECEIPT','Expected complete classified receipt');
 const expected=classifyPostgresqlCardinality(receipt.source,receipt.request);
 if(canonical(copyJson(receipt))!==canonical(copyJson(expected)))throw new UmfError('POSTGRESQL_CARDINALITY_RECEIPT','Receipt disagrees with retained source and selected binding');
 if(canonical(copyJson(current))!==canonical(copyJson(receipt.target)))throw new UmfError('POSTGRESQL_CARDINALITY_STALE','Target changed after classification');
 return receipt;
}
/** Recover both exact native texts, including unclaimed content. */
export function recoverPostgresqlCardinalitySource(input:PostgresqlCardinalityClassification,current:Document):{nativeSource:string;supplement:string}{
 const receipt=verifyPostgresqlCardinalityClassification(input,current);return {nativeSource:receipt.request.nativeSource,supplement:receipt.request.supplement};
}
