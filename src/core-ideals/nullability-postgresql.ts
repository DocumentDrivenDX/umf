import {copyJson} from '../model/json';
import {UmfError,type Document,type Json,type Diagnostic,type Nullability,type ExtensionPackage} from '../model/types';
import {type NativeJson,parseNativeJson,renderTree} from '../model/native-json';
import {verifyCoreNullabilityDeclaration,type CoreNullabilityDeclaration} from '../model/nullability';
import {exportPostgresqlCatalogCapture,getPostgresqlColumnMetadata,getPostgresqlCatalogNode} from '../adapters/postgresql/catalog';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';
import fields from '../../spec/core/field-document.schema.json';
import core from '../../spec/core/nullability-document.schema.json';
import authorSchema from '../../spec/core/nullability-operation.schema.json';
import nativeSchema from '../../spec/core/native-json.schema.json';
import schema from '../../spec/core/postgresql-nullability-classification.schema.json';
import manifest from '../../spec/extensions/postgresql-nullability/package.json';
export const POSTGRESQL_NULLABILITY_EXTENSION='umf.postgresql.nullability';
export const postgresqlNullabilityPackage=manifest as unknown as ExtensionPackage;
export {default as postgresqlNullabilityClassificationSchema} from '../../spec/core/postgresql-nullability-classification.schema.json';
export interface PostgresqlNullabilityRequest {
 column:string;nativeSource:string;mode:'strict'|'report';scope:'stored-relation'|'query-result'|'write-input'|'unresolved';carrier:'sql-null'|'unresolved';author?:CoreNullabilityDeclaration;
}
const binding=schema.properties.binding.const;
const recovery='Retain the complete source and native archive; unknown native meaning is not replaced by the core label' as const;
export interface PostgresqlNullabilityClassification {
 operation:'classify-postgresql-nullability';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:PostgresqlNullabilityRequest;binding:typeof binding;
 mapping:{origin:'classified';idealPath:string;nativePath:string;nativeFragment:NativeJson;nullability:Nullability;interpretation:'declared'|'unknown'|'unsupported';outcome:'exact'|'unknown'|'not-expressible';scope:PostgresqlNullabilityRequest['scope'];carrier:PostgresqlNullabilityRequest['carrier'];basis:'Captured declarations for stored relation values; not query results, omitted inputs or live enforcement verification'};
 residuals:{path:string;value:Json;reason:string;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
const validator=createValidator();for(const s of [legacy,fields,core,authorSchema,nativeSchema])validator.addSchema(s);
const check=validator.compile(schema),checkRequest=validator.compile(schema.properties.request);
const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k]!)).join(',')+'}':JSON.stringify(value);
const str=(node:NativeJson|undefined)=>node?.kind==='string'?node.value:undefined;
const empty=(node:NativeJson|undefined)=>node?.kind==='null'||node?.kind==='array'&&node.items.length===0;
/** Native absence is classified only for explicitly scoped stored-relation declarations. */
export function classifyPostgresqlNullability(input:Document,options:PostgresqlNullabilityRequest):PostgresqlNullabilityClassification {
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as PostgresqlNullabilityRequest;
 if(!checkRequest(request))throw new UmfError('POSTGRESQL_NULLABILITY_REQUEST',JSON.stringify(checkRequest.errors));
 if(!validateDocument(source).valid||source.umf!=='0.3.0')throw new UmfError('POSTGRESQL_NULLABILITY_SOURCE','Valid core 0.3.0 required; migrate explicitly');
 const exported=exportPostgresqlCatalogCapture(source);
 if(exported.state!=='captured')throw new UmfError('POSTGRESQL_NULLABILITY_STATE','Modified native metadata needs a fresh capture before classification');
 if(renderTree(parseNativeJson(request.nativeSource))!==exported.json)throw new UmfError('POSTGRESQL_NULLABILITY_ARCHIVE','Native text differs from retained capture');
 const root=getPostgresqlCatalogNode(source,'');
 if(root.kind!=='object'||root.members.serverVersion?.kind!=='number'||root.members.serverVersion.value!=='170004')throw new UmfError('POSTGRESQL_NULLABILITY_VERSION','This binding requires PostgreSQL 17.4 catalog captures');
 const snapshot=root.members.snapshot;
 if(snapshot?.kind!=='object'||str(snapshot.members.profile)!=='umf-postgresql-catalog-evidence-17-v3'||str(root.members.state)!=='captured'||str(root.members.profile)!=='postgresql-catalog-capture-v1')throw new UmfError('POSTGRESQL_NULLABILITY_PROFILE','Expected captured catalog evidence profile 17-v3');
 const metadata=getPostgresqlColumnMetadata(source).find(c=>c.path===request.column);
 if(!metadata)throw new UmfError('POSTGRESQL_NULLABILITY_COLUMN','Native column not found',request.column);
 const mi=source.modules.findIndex(m=>m.id==='postgresql.columns'),ei=source.modules[mi]?.elements.findIndex(e=>e.id===metadata.element.id)??-1;
 if(mi<0||ei<0)throw new UmfError('POSTGRESQL_NULLABILITY_COLUMN','Derived column member is required');
 const element=source.modules[mi]!.elements[ei]!,nativeFragment=metadata.nativeColumn;
 if(nativeFragment.kind!=='object')throw new UmfError('POSTGRESQL_NULLABILITY_COLUMN','Expected native column object');
 const idealPath=`/modules/${mi}/elements/${ei}/nullability`,base=metadata.path+'/notNull';
 const result:PostgresqlNullabilityClassification={operation:'classify-postgresql-nullability',version:'1.0.0',status:'classified',source,request,binding,mapping:{origin:'classified',idealPath,nativePath:base,nativeFragment,nullability:'unspecified',interpretation:'unknown',outcome:'unknown',scope:request.scope,carrier:request.carrier,basis:'Captured declarations for stored relation values; not query results, omitted inputs or live enforcement verification'},residuals:[],diagnostics:[]};
 const loss=(path:string,value:unknown,reason:string)=>result.residuals.push({path,value:copyJson(value),reason,recovery});
 const column=nativeFragment.members,flag=column.notNull;
 let reason:string|undefined;
 if(request.scope!=='stored-relation')reason='Stored-relation scope required; query outputs and input omission have different availability';
 else if(request.carrier!=='sql-null')reason='Explicit SQL-NULL absence carrier required; omitted members are not equated with NULL';
 else if(!['r','p'].includes(metadata.relation.kind)){reason='Only captured ordinary and partitioned table declarations are supported';result.mapping.interpretation='unsupported';}
 else if(flag?.kind!=='boolean')reason='Column notNull is missing or not an exact native boolean';
 else if(!flag.value){
  // A false attnotnull is not positive permission: domains/checks/triggers may prohibit NULL.
  const relation=getPostgresqlCatalogNode(source,metadata.path.slice(0,metadata.path.lastIndexOf('/columns/')));
  const type=column.nativeType;
  if(type?.kind!=='object'||str(type.members.schema)!=='pg_catalog'||str(type.members.kind)!=='b'||!['bool','int2','int4','int8','numeric','float4','float8','text','varchar','bpchar','bytea','date','time','timetz','timestamp','timestamptz'].includes(str(type.members.name)??'')||type.members.dimensions?.kind!=='number'||type.members.dimensions.value!=='0')reason='Domain, array or unresolved native type requires additional availability evidence';
  else if(str(column.generated)!==''||str(column.identity)!=='')reason='Generated/identity behavior is retained separately; a false flag alone is insufficient';
  else if(relation.kind!=='object'||!empty(relation.members.constraints))reason='Native relation constraints may prohibit NULL; no arbitrary constraint expression is evaluated';
  else if(!empty(snapshot.members.triggers)){
   const triggers=snapshot.members.triggers;
   if(triggers?.kind!=='array'||triggers.items.some(t=>t.kind!=='object'||str(t.members.schema)===undefined||str(t.members.relation)===undefined||str(t.members.schema)===metadata.relation.schema&&str(t.members.relation)===metadata.relation.name))reason='Native trigger behavior for this relation is unresolved';
  }
  // Future column members might qualify availability. Retain them and withhold permission.
  if(!reason&&Object.keys(column).some(k=>!['name','position','type','nativeType','notNull','identity','generated','collation','default','comment','storage','compression','acl'].includes(k)))reason='Unknown native column refinement prevents an unconditional absence permission';
 }
 if(reason){loss(base,nativeFragment,reason);if(result.mapping.interpretation==='unsupported')result.mapping.outcome='not-expressible';}
 else{result.mapping.nullability=flag!.kind==='boolean'&&flag!.value?'required':'absent-allowed';result.mapping.interpretation='declared';result.mapping.outcome='exact';}
 let conflict:string|undefined;
 if(element.kind!=='field')conflict='Selected native member must already be an explicit Field; this operation does not replace its kind';
 if(request.author!==undefined){
  try{
   const author=verifyCoreNullabilityDeclaration(request.author,source);
   if(author.identity.module!=='postgresql.columns'||author.identity.element!==element.id)conflict='Author receipt identifies a different member';
   else if(author.provenance.nullability!==result.mapping.nullability)conflict='Authored availability differs from the native observation; neither assertion may be overwritten';
  }catch(error){if(!(error instanceof UmfError))throw error;conflict='Author provenance is invalid or stale: '+error.code;}
 }else if(Object.hasOwn(element,'nullability'))conflict='Existing availability requires verified author provenance before native classification';
 if(Object.hasOwn(element.extensions,POSTGRESQL_NULLABILITY_EXTENSION))conflict='Existing binding scope cannot be overwritten; reclassify from its retained source';
 if(source.vocabularies[POSTGRESQL_NULLABILITY_EXTENSION]&&source.vocabularies[POSTGRESQL_NULLABILITY_EXTENSION]!.version!=='1.0.0')conflict='Existing binding vocabulary version is incompatible';
 if(conflict){loss(idealPath,Object.hasOwn(element,'nullability')?element.nullability:null,conflict);result.mapping.outcome='unknown';}
 if(conflict||request.mode==='strict'&&result.residuals.length)result.status='blocked';
 else{const target=copyJson(source) as unknown as Document;const selected=target.modules[mi]!.elements[ei]!;selected.nullability=result.mapping.nullability;
  target.vocabularies[POSTGRESQL_NULLABILITY_EXTENSION]??={version:'1.0.0'};
  selected.extensions[POSTGRESQL_NULLABILITY_EXTENSION]={origin:'classified',binding:{id:binding.id,version:binding.version},scope:request.scope,carrier:request.carrier,interpretation:result.mapping.interpretation,nativePath:result.mapping.nativePath};result.target=target;}
 result.diagnostics=result.residuals.map(r=>({code:r.path===idealPath?'POSTGRESQL_NULLABILITY_CONFLICT':'POSTGRESQL_NULLABILITY_UNRESOLVED',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const copied=copyJson(result);if(!check(copied))throw new UmfError('POSTGRESQL_NULLABILITY_RESULT',JSON.stringify(check.errors));return copied as unknown as PostgresqlNullabilityClassification;
}
/** Receipt consistency is not authentication; any model edit requires reclassification. */
export function verifyPostgresqlNullabilityClassification(input:PostgresqlNullabilityClassification,current:Document):PostgresqlNullabilityClassification {
 const receipt=copyJson(input) as unknown as PostgresqlNullabilityClassification;
 if(!check(receipt)||receipt.status!=='classified')throw new UmfError('POSTGRESQL_NULLABILITY_RECEIPT','Expected complete classified receipt');
 const expected=classifyPostgresqlNullability(receipt.source,receipt.request);
 if(canonical(copyJson(receipt))!==canonical(copyJson(expected)))throw new UmfError('POSTGRESQL_NULLABILITY_RECEIPT','Receipt disagrees with retained source and selected binding');
 if(canonical(copyJson(current))!==canonical(copyJson(receipt.target)))throw new UmfError('POSTGRESQL_NULLABILITY_STALE','Target changed after classification');
 return receipt;
}
/** Recover exact original capture text, including unclaimed native content. */
export function recoverPostgresqlNullabilitySource(input:PostgresqlNullabilityClassification,current:Document):string{
 const receipt=verifyPostgresqlNullabilityClassification(input,current);return receipt.request.nativeSource;
}
