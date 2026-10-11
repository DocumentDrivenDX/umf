import {copyJson} from '../model/json';
import {UmfError,type Document,type Json,type Diagnostic} from '../model/types';
import {verifyCoreKindDeclaration,type CoreKindDeclaration} from '../model/field-kind';
import {getPostgresqlColumnMetadata,exportPostgresqlCatalogCapture,getPostgresqlCatalogNode} from '../adapters/postgresql/catalog';
import {parseNativeJson,renderTree} from '../model/native-json';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import kinds from '../../spec/core/kind-operation.schema.json';import schema from '../../spec/core/postgresql-field-classification.schema.json';
export {default as postgresqlFieldClassificationSchema} from '../../spec/core/postgresql-field-classification.schema.json';
export interface PostgresqlFieldRequest {column:string;nativeSource:string;mode:'strict'|'report';author?:CoreKindDeclaration}
const binding={id:'umf.postgresql.catalog.field',version:'1.0.0',nativeVersion:'17.4',subset:'Captured catalog column membership; excludes raw DDL and native constraint/value equivalence'} as const;
export interface PostgresqlFieldClassification {
 operation:'classify-postgresql-field';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:PostgresqlFieldRequest;binding:typeof binding;
 mapping:{origin:'classified';kind:'field';idealPath:string;nativePath:string;nativeFragment:Json;basis:'checked-catalog-column-membership';outcome:'exact'|'unknown'};
 residuals:{path:string;value:Json;reason:string;recovery:'Original assertion and native fragment retained in source; reclassify with corrected provenance'}[];diagnostics:Diagnostic[];
}
const validator=createValidator();validator.addSchema(legacy);validator.addSchema(fields);validator.addSchema(kinds);const check=validator.compile(schema),checkRequest=validator.compile(schema.properties.request);
/** Native paths are JSON pointers into the retained capture text, not pointers into the tagged UMF encoding. */
export function classifyPostgresqlField(input:Document,options:PostgresqlFieldRequest):PostgresqlFieldClassification {
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as PostgresqlFieldRequest;
 if(!checkRequest(request))throw new UmfError('POSTGRESQL_FIELD_REQUEST',JSON.stringify(checkRequest.errors));
 if(!validateDocument(source).valid||source.umf!=='0.2.0')throw new UmfError('POSTGRESQL_FIELD_VERSION','Explicitly migrated valid envelope required');
 const exported=exportPostgresqlCatalogCapture(source);
 if(renderTree(parseNativeJson(request.nativeSource))!==exported.json)throw new UmfError('POSTGRESQL_FIELD_ARCHIVE','Native archive differs from captured tree');
 const version=getPostgresqlCatalogNode(source,'/serverVersion');if(version.kind!=='number'||Number(version.value)!==170004)throw new UmfError('POSTGRESQL_FIELD_SERVER','This binding requires PostgreSQL 17.4');
 const metadata=getPostgresqlColumnMetadata(source).find(c=>c.path===request.column);
 if(!metadata)throw new UmfError('POSTGRESQL_FIELD_COLUMN','Captured column path not found',request.column);
 const mi=source.modules.findIndex(m=>m.id==='postgresql.columns'),ei=source.modules[mi]?.elements.findIndex(e=>e.id===metadata.element.id)??-1;
 if(mi<0||ei<0)throw new UmfError('POSTGRESQL_FIELD_METADATA','Derived column module is required');
 const element=source.modules[mi]!.elements[ei]!,idealPath=`/modules/${mi}/elements/${ei}/kind`;
 const result:PostgresqlFieldClassification={operation:'classify-postgresql-field',version:'1.0.0',status:'classified',source,request,binding,mapping:{origin:'classified',kind:'field',idealPath,nativePath:metadata.path,nativeFragment:copyJson(metadata.nativeColumn),basis:'checked-catalog-column-membership',outcome:'exact'},residuals:[],diagnostics:[]};
 let reason:string|undefined;
 if(request.author!==undefined){try{const author=verifyCoreKindDeclaration(request.author,source);if(author.identity.module!=='postgresql.columns'||author.identity.element!==element.id)reason='Author receipt identifies another column';else if(author.provenance.kind!=='field')reason='Authored kind conflicts with native catalog column membership';}catch(error){if(!(error instanceof UmfError))throw error;reason='Invalid or stale author provenance: '+error.code;}}
 else if(Object.hasOwn(element,'kind'))reason='Existing kind needs verified author provenance; native observation cannot replace it';
 if(reason){result.status='blocked';result.mapping.outcome='unknown';result.residuals.push({path:idealPath,value:Object.hasOwn(element,'kind')?copyJson(element.kind):null,reason,recovery:'Original assertion and native fragment retained in source; reclassify with corrected provenance'});result.diagnostics.push({code:'POSTGRESQL_FIELD_CONFLICT',path:idealPath,message:reason,severity:'error'});}
 else {const target=copyJson(source) as unknown as Document;target.modules[mi]!.elements[ei]!.kind='field';result.target=target;}
 const output=copyJson(result);if(!check(output))throw new UmfError('POSTGRESQL_FIELD_RESULT',JSON.stringify(check.errors));return output as unknown as PostgresqlFieldClassification;
}
export function recoverPostgresqlFieldCapture(input:PostgresqlFieldClassification,current:Document):string {
 const receipt=copyJson(input) as unknown as PostgresqlFieldClassification;
 if(!check(receipt)||receipt.status!=='classified')throw new UmfError('POSTGRESQL_FIELD_RECEIPT','Expected complete classified receipt');
 const expected=classifyPostgresqlField(receipt.source,receipt.request);
 const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key]!)).join(',')+'}':JSON.stringify(value);
 if(canonical(copyJson(receipt))!==canonical(copyJson(expected)))throw new UmfError('POSTGRESQL_FIELD_RECEIPT','Receipt disagrees with native basis');
 if(canonical(copyJson(current))!==canonical(copyJson(receipt.target)))throw new UmfError('POSTGRESQL_FIELD_STALE','Current model changed; recompute classification');
 return receipt.request.nativeSource;
}
