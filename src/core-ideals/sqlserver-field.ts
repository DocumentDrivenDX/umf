import {copyJson} from '../model/json';
import {UmfError,type Document,type Json,type Diagnostic} from '../model/types';
import {verifyCoreKindDeclaration,type CoreKindDeclaration} from '../model/field-kind';
import {getSqlServerColumnMetadata,exportSqlServerCatalog} from '../adapters/sqlserver';
import {parseNativeJson,renderTree} from '../model/native-json';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import kinds from '../../spec/core/kind-operation.schema.json';import schema from '../../spec/core/sqlserver-field-classification.schema.json';
export {default as sqlserverFieldClassificationSchema} from '../../spec/core/sqlserver-field-classification.schema.json';
export interface SqlServerFieldRequest {column:string;nativeSource:string;mode:'strict'|'report';author?:CoreKindDeclaration}
const binding={id:'umf.sqlserver.catalog.field',version:'1.0.0',nativeVersion:'16.0.4295.3',subset:'Captured catalog column membership; excludes raw DDL and native constraint/value equivalence'} as const;
export interface SqlServerFieldClassification {
 operation:'classify-sqlserver-field';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:SqlServerFieldRequest;binding:typeof binding;
 mapping:{origin:'classified';kind:'field';idealPath:string;nativePath:string;nativeFragment:Json;basis:'checked-catalog-column-membership';outcome:'exact'|'unknown'};
 residuals:{path:string;value:Json;reason:string;recovery:'Original assertion and native fragment retained in source; reclassify with corrected provenance'}[];diagnostics:Diagnostic[];
}
const validator=createValidator();validator.addSchema(legacy);validator.addSchema(fields);validator.addSchema(kinds);const check=validator.compile(schema),checkRequest=validator.compile(schema.properties.request);
/** Native paths are JSON pointers into the retained capture text, not pointers into the tagged UMF encoding. */
export function classifySqlServerField(input:Document,options:SqlServerFieldRequest):SqlServerFieldClassification {
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as SqlServerFieldRequest;
 if(!checkRequest(request))throw new UmfError('SQLSERVER_FIELD_REQUEST',JSON.stringify(checkRequest.errors));
 if(!validateDocument(source).valid||source.umf!=='0.2.0')throw new UmfError('SQLSERVER_FIELD_VERSION','Explicitly migrated valid envelope required');
 const exported=exportSqlServerCatalog(source);
 const archive=parseNativeJson(request.nativeSource);
 if(renderTree(archive)+'\n'!==exported)throw new UmfError('SQLSERVER_FIELD_ARCHIVE','Native archive differs from captured tree');
 const version=archive.kind==='object'?archive.members.serverVersion:undefined;if(version?.kind!=='string'||version.value!=='16.0.4295.3')throw new UmfError('SQLSERVER_FIELD_SERVER','This binding requires SQL Server 16.0.4295.3');
 const metadata=getSqlServerColumnMetadata(source).find(c=>c.path===request.column);
 if(!metadata)throw new UmfError('SQLSERVER_FIELD_COLUMN','Captured column path not found',request.column);
 const mi=source.modules.findIndex(m=>m.id==='sqlserver.columns'),ei=source.modules[mi]?.elements.findIndex(e=>e.id===metadata.element.id)??-1;
 if(mi<0||ei<0)throw new UmfError('SQLSERVER_FIELD_METADATA','Derived column module is required');
 const element=source.modules[mi]!.elements[ei]!,idealPath=`/modules/${mi}/elements/${ei}/kind`;
 const result:SqlServerFieldClassification={operation:'classify-sqlserver-field',version:'1.0.0',status:'classified',source,request,binding,mapping:{origin:'classified',kind:'field',idealPath,nativePath:metadata.path,nativeFragment:copyJson(metadata.nativeColumn),basis:'checked-catalog-column-membership',outcome:'exact'},residuals:[],diagnostics:[]};
 let reason:string|undefined;
 if(request.author!==undefined){try{const author=verifyCoreKindDeclaration(request.author,source);if(author.identity.module!=='sqlserver.columns'||author.identity.element!==element.id)reason='Author receipt identifies another column';else if(author.provenance.kind!=='field')reason='Authored kind conflicts with native catalog column membership';}catch(error){if(!(error instanceof UmfError))throw error;reason='Invalid or stale author provenance: '+error.code;}}
 else if(Object.hasOwn(element,'kind'))reason='Existing kind needs verified author provenance; native observation cannot replace it';
 if(reason){result.status='blocked';result.mapping.outcome='unknown';result.residuals.push({path:idealPath,value:Object.hasOwn(element,'kind')?copyJson(element.kind):null,reason,recovery:'Original assertion and native fragment retained in source; reclassify with corrected provenance'});result.diagnostics.push({code:'SQLSERVER_FIELD_CONFLICT',path:idealPath,message:reason,severity:'error'});}
 else {const target=copyJson(source) as unknown as Document;target.modules[mi]!.elements[ei]!.kind='field';result.target=target;}
 const output=copyJson(result);if(!check(output))throw new UmfError('SQLSERVER_FIELD_RESULT',JSON.stringify(check.errors));return output as unknown as SqlServerFieldClassification;
}
export function recoverSqlServerFieldCapture(input:SqlServerFieldClassification,current:Document):string {
 const receipt=copyJson(input) as unknown as SqlServerFieldClassification;
 if(!check(receipt)||receipt.status!=='classified')throw new UmfError('SQLSERVER_FIELD_RECEIPT','Expected complete classified receipt');
 const expected=classifySqlServerField(receipt.source,receipt.request);
 const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key]!)).join(',')+'}':JSON.stringify(value);
 if(canonical(copyJson(receipt))!==canonical(copyJson(expected)))throw new UmfError('SQLSERVER_FIELD_RECEIPT','Receipt disagrees with native basis');
 if(canonical(copyJson(current))!==canonical(copyJson(receipt.target)))throw new UmfError('SQLSERVER_FIELD_STALE','Current model changed; recompute classification');
 return receipt.request.nativeSource;
}
