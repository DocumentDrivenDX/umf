import {copyJson} from '../model/json';
import {UmfError,type Document,type Json,type Diagnostic,type Nullability,type ExtensionPackage} from '../model/types';
import {type NativeJson,parseNativeJson,renderTree} from '../model/native-json';
import {verifyCoreNullabilityDeclaration,type CoreNullabilityDeclaration} from '../model/nullability';
import {exportSqlServerCatalog,getSqlServerColumnMetadata} from '../adapters/sqlserver';
import evidenceSchema from '../../spec/extensions/sqlserver-nullability/native.schema.json';
import {catalogIntegerErrors} from '../validation/catalog-integers';
export {default as sqlserverNullabilityEvidenceSchema} from '../../spec/extensions/sqlserver-nullability/native.schema.json';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';
import fields from '../../spec/core/field-document.schema.json';
import core from '../../spec/core/nullability-document.schema.json';
import authorSchema from '../../spec/core/nullability-operation.schema.json';
import nativeSchema from '../../spec/core/native-json.schema.json';
import schema from '../../spec/core/sqlserver-nullability-classification.schema.json';
import manifest from '../../spec/extensions/sqlserver-nullability/package.json';
export const SQLSERVER_NULLABILITY_EXTENSION='umf.sqlserver.nullability';
export const sqlserverNullabilityPackage=manifest as unknown as ExtensionPackage;
export {default as sqlserverNullabilityClassificationSchema} from '../../spec/core/sqlserver-nullability-classification.schema.json';
export interface SqlServerNullabilityRequest {
 column:string;nativeSource:string;mode:'strict'|'report';scope:'stored-relation'|'query-result'|'write-input'|'unresolved';carrier:'sql-null'|'unresolved';author?:CoreNullabilityDeclaration;
}
const binding=schema.properties.binding.const;
const recovery='Retain the complete source and native archive; unknown native meaning is not replaced by the core label' as const;
export interface SqlServerNullabilityClassification {
 operation:'classify-sqlserver-nullability';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:SqlServerNullabilityRequest;binding:typeof binding;
 mapping:{origin:'classified';idealPath:string;nativePath:string;nativeFragment:NativeJson;nullability:Nullability;interpretation:'declared'|'unknown'|'unsupported';outcome:'exact'|'unknown'|'not-expressible';scope:SqlServerNullabilityRequest['scope'];carrier:SqlServerNullabilityRequest['carrier'];basis:'Captured declarations for stored relation values; not query results, omitted inputs or live enforcement verification'};
 residuals:{path:string;value:Json;reason:string;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
const validator=createValidator();for(const s of [legacy,fields,core,authorSchema,nativeSchema])validator.addSchema(s);
const checkEvidence=validator.compile(evidenceSchema);
const check=validator.compile(schema),checkRequest=validator.compile(schema.properties.request);
const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k]!)).join(',')+'}':JSON.stringify(value);
const str=(node:NativeJson|undefined)=>node?.kind==='string'?node.value:undefined;
/** Native absence is classified only for explicitly scoped stored-relation declarations. */
export function classifySqlServerNullability(input:Document,options:SqlServerNullabilityRequest):SqlServerNullabilityClassification {
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as SqlServerNullabilityRequest;
 if(!checkRequest(request))throw new UmfError('SQLSERVER_NULLABILITY_REQUEST',JSON.stringify(checkRequest.errors));
 if(!validateDocument(source).valid||source.umf!=='0.3.0')throw new UmfError('SQLSERVER_NULLABILITY_SOURCE','Valid core 0.3.0 required; migrate explicitly');
 const exported=exportSqlServerCatalog(source),root=parseNativeJson(request.nativeSource);
 if(renderTree(root)+'\n'!==exported)throw new UmfError('SQLSERVER_NULLABILITY_ARCHIVE','Native text differs from retained capture');
 if(root.kind!=='object'||str(root.members.serverVersion)!=='16.0.4295.3')throw new UmfError('SQLSERVER_NULLABILITY_VERSION','This binding requires SQL Server 16.0.4295.3');
 if(str(root.members.profile)!=='sqlserver-catalog-v3'||str(root.members.state)!=='captured')throw new UmfError('SQLSERVER_NULLABILITY_PROFILE','Captured catalog-v3 required; modified metadata needs recapture');
 const metadata=getSqlServerColumnMetadata(source).find(c=>c.path===request.column);
 if(!metadata)throw new UmfError('SQLSERVER_NULLABILITY_COLUMN','Native column not found',request.column);
 const mi=source.modules.findIndex(m=>m.id==='sqlserver.columns'),ei=source.modules[mi]?.elements.findIndex(e=>e.id===metadata.element.id)??-1;
 if(mi<0||ei<0)throw new UmfError('SQLSERVER_NULLABILITY_COLUMN','Derived column member is required');
 const element=source.modules[mi]!.elements[ei]!,nativeFragment=metadata.nativeColumn;
 if(nativeFragment.kind!=='object')throw new UmfError('SQLSERVER_NULLABILITY_COLUMN','Expected native column');
 const idealPath=`/modules/${mi}/elements/${ei}/nullability`,base=metadata.path+'/is_nullable';
 const result:SqlServerNullabilityClassification={operation:'classify-sqlserver-nullability',version:'1.0.0',status:'classified',source,request,binding,mapping:{origin:'classified',idealPath,nativePath:base,nativeFragment,nullability:'unspecified',interpretation:'unknown',outcome:'unknown',scope:request.scope,carrier:request.carrier,basis:'Captured declarations for stored relation values; not query results, omitted inputs or live enforcement verification'},residuals:[],diagnostics:[]};
 const loss=(path:string,value:unknown,reason:string)=>result.residuals.push({path,value:copyJson(value),reason,recovery});
 const column=nativeFragment.members,flag=column.is_nullable;
 const tables=root.members.tables,ti=Number(metadata.path.split('/')[2]),table=tables?.kind==='array'?tables.items[ti]:undefined;
 const evidence=root.members.availabilityEvidence;
 const evidenceValid=evidence?.kind==='object'&&catalogIntegerErrors(evidence,evidenceSchema).length===0&&checkEvidence(JSON.parse(renderTree(evidence)));
 const truth=(n:NativeJson|undefined)=>n?.kind==='boolean'&&n.value;
 const falsity=(n:NativeJson|undefined)=>n?.kind==='boolean'&&!n.value;
 const zero=(n:NativeJson|undefined)=>n?.kind==='number'&&Number(n.value)===0;
 let reason:string|undefined;
 if(request.scope!=='stored-relation')reason='Stored-relation scope required; query results and omitted inputs differ';
 else if(request.carrier!=='sql-null')reason='Explicit SQL-NULL absence carrier required';
 else if(flag?.kind!=='boolean')reason='Column nullable metadata is not an exact native boolean';
 else if(!falsity(column.is_computed))reason='Computed availability metadata is not treated as an explicit stored-column declaration';
 else if(!falsity(column.is_assembly_type))reason='Assembly type availability semantics require additional evidence';
 else if(flag.value){
  if(!evidenceValid||evidence?.kind!=='object')reason='Native availability supplement is missing, malformed or has unsupported integer tokens';
  else if(!truth(evidence.members.database_view_definition))reason='Metadata visibility does not establish complete constraint observations';
  else if(table?.kind!=='object')reason='Native table unavailable';
  else{
   const e=evidence.members;
   const matches=(node:NativeJson|undefined,keys:Record<string,string>):NativeJson[]=>node?.kind==='array'?node.items.filter(n=>n.kind==='object'&&Object.entries(keys).every(([key,value])=>str(n.members[key])===value)):[];
   const identity={schema:metadata.table.schema,table:metadata.table.name};
   const refinements=matches(e.column_refinements,{...identity,name:metadata.element.name!});
   const refinement=refinements[0];
   if(refinements.length!==1||refinement?.kind!=='object')reason='Native column refinements are missing or ambiguous';
   else if(!zero(refinement.members.rule_object_id))reason='Legacy bound column rules require additional availability evidence';
   else if(!zero(refinement.members.generated_always_type)||!falsity(column.is_identity)||str(column.base_type_name)==='timestamp')reason='Generated/identity/rowversion availability requires its own interpretation';
   else if(Object.keys(refinement.members).some(k=>!['schema','table','name','is_sparse','generated_always_type','is_hidden','rule_object_id'].includes(k)))reason='Unknown native column refinement prevents absence permission';
   else if(table.members.checks?.kind!=='array'||table.members.checks.items.some(c=>c.kind!=='object'||!truth(c.members.is_disabled)))reason='Enabled or unresolved checks may forbid NULL; arbitrary expressions are not evaluated';
   else if(table.members.foreign_keys?.kind!=='array'||table.members.foreign_keys.items.length)reason='Foreign-key interactions require additional evidence';
   else if(table.members.keys?.kind!=='array'||table.members.keys.items.some(k=>k.kind!=='object'||str(k.members.kind)!=='UQ'))reason='Unknown native key semantics remain unresolved';
   else if(matches(e.triggers,identity).length)reason='Native trigger behavior remains unresolved, including disabled triggers';
   else if(table.members.columns?.kind!=='array'||table.members.columns.items.some(c=>c.kind!=='object'||!falsity(c.members.is_computed)))reason='Other computed columns may constrain NULL inputs; arbitrary expressions are not evaluated';
   else if(truth(column.is_user_defined)){
    const aliases=matches(e.alias_types,{schema:str(column.type_schema)!,name:str(column.type_name)!}),alias=aliases[0];
    if(aliases.length!==1||alias?.kind!=='object'||!zero(alias.members.rule_object_id))reason='Alias rules or unresolved type metadata may constrain NULL';
   }
   if(!reason&&Object.keys(column).some(k=>!['name','column_id','system_type_id','user_type_id','type_schema','type_name','base_type_name','is_user_defined','is_assembly_type','max_length','precision','scale','is_nullable','is_identity','is_computed','collation_name','default_definition','computed_definition','identity_seed','identity_increment','description'].includes(k)))reason='Unknown native column metadata prevents absence permission';
  }
 }
 if(reason)loss(base,nativeFragment,reason);
 else{result.mapping.nullability=flag!.kind==='boolean'&&flag!.value?'absent-allowed':'required';result.mapping.interpretation='declared';result.mapping.outcome='exact';}
 let conflict:string|undefined;
 if(element.kind!=='field')conflict='Selected native member must already be an explicit Field; this operation does not replace its kind';
 if(request.author!==undefined){
  try{
   const author=verifyCoreNullabilityDeclaration(request.author,source);
   if(author.identity.module!=='sqlserver.columns'||author.identity.element!==element.id)conflict='Author receipt identifies a different member';
   else if(author.provenance.nullability!==result.mapping.nullability)conflict='Authored availability differs from the native observation; neither assertion may be overwritten';
  }catch(error){if(!(error instanceof UmfError))throw error;conflict='Author provenance is invalid or stale: '+error.code;}
 }else if(Object.hasOwn(element,'nullability'))conflict='Existing availability requires verified author provenance before native classification';
 if(Object.hasOwn(element.extensions,SQLSERVER_NULLABILITY_EXTENSION))conflict='Existing binding scope cannot be overwritten; reclassify from its retained source';
 if(source.vocabularies[SQLSERVER_NULLABILITY_EXTENSION]&&source.vocabularies[SQLSERVER_NULLABILITY_EXTENSION]!.version!=='1.0.0')conflict='Existing binding vocabulary version is incompatible';
 if(conflict){loss(idealPath,Object.hasOwn(element,'nullability')?element.nullability:null,conflict);result.mapping.outcome='unknown';}
 if(conflict||request.mode==='strict'&&result.residuals.length)result.status='blocked';
 else{const target=copyJson(source) as unknown as Document;const selected=target.modules[mi]!.elements[ei]!;selected.nullability=result.mapping.nullability;
  target.vocabularies[SQLSERVER_NULLABILITY_EXTENSION]??={version:'1.0.0'};
  selected.extensions[SQLSERVER_NULLABILITY_EXTENSION]={origin:'classified',binding:{id:binding.id,version:binding.version},scope:request.scope,carrier:request.carrier,interpretation:result.mapping.interpretation,nativePath:result.mapping.nativePath};result.target=target;}
 result.diagnostics=result.residuals.map(r=>({code:r.path===idealPath?'SQLSERVER_NULLABILITY_CONFLICT':'SQLSERVER_NULLABILITY_UNRESOLVED',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const copied=copyJson(result);if(!check(copied))throw new UmfError('SQLSERVER_NULLABILITY_RESULT',JSON.stringify(check.errors));return copied as unknown as SqlServerNullabilityClassification;
}
/** Receipt consistency is not authentication; any model edit requires reclassification. */
export function verifySqlServerNullabilityClassification(input:SqlServerNullabilityClassification,current:Document):SqlServerNullabilityClassification {
 const receipt=copyJson(input) as unknown as SqlServerNullabilityClassification;
 if(!check(receipt)||receipt.status!=='classified')throw new UmfError('SQLSERVER_NULLABILITY_RECEIPT','Expected complete classified receipt');
 const expected=classifySqlServerNullability(receipt.source,receipt.request);
 if(canonical(copyJson(receipt))!==canonical(copyJson(expected)))throw new UmfError('SQLSERVER_NULLABILITY_RECEIPT','Receipt disagrees with retained source and selected binding');
 if(canonical(copyJson(current))!==canonical(copyJson(receipt.target)))throw new UmfError('SQLSERVER_NULLABILITY_STALE','Target changed after classification');
 return receipt;
}
/** Recover exact original capture text, including unclaimed native content. */
export function recoverSqlServerNullabilitySource(input:SqlServerNullabilityClassification,current:Document):string{
 const receipt=verifySqlServerNullabilityClassification(input,current);return receipt.request.nativeSource;
}
