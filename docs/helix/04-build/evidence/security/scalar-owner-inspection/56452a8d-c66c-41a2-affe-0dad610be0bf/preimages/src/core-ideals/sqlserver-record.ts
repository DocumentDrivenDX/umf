import {copyJson} from '../model/json';
import {UmfError,type Document,type Json,type Diagnostic} from '../model/types';
import {type CoreKindDeclaration,verifyCoreKindDeclaration} from '../model/field-kind';
import {classifySqlServerField,type SqlServerFieldClassification} from './sqlserver-field';
import {getSqlServerColumnMetadata,exportSqlServerCatalog} from '../adapters/sqlserver';
import {parseNativeJson,renderTree} from '../model/native-json';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import kinds from '../../spec/core/kind-operation.schema.json';import schema from '../../spec/core/sqlserver-record-classification.schema.json';
export {default as sqlserverRecordClassificationSchema} from '../../spec/core/sqlserver-record-classification.schema.json';
export interface SqlServerRecordRequest {recordModule:string;recordId:string;mode:'strict'|'report';nativeSource:string;relation:{schema:string;name:string};authors?:CoreKindDeclaration[]}
const binding={id:'umf.sqlserver.catalog.record',version:'1.0.0',nativeVersion:'16.0.4295.3',subset:'Captured table member roles only; permission-limited observations, no native identity/constraint equivalence'} as const;
type Mapping=Omit<SqlServerFieldClassification['mapping'],'kind'|'basis'>&{kind:'field'|'record';basis:'checked-catalog-column-membership'|'checked-catalog-table-members'};
export interface SqlServerRecordClassification {
 operation:'classify-sqlserver-record';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:SqlServerRecordRequest;binding:typeof binding;mappings:Mapping[];
 residuals:{path:string;value:Json;reason:string;recovery:'Source and native fragments retained; resolve conflict then recompute whole record classification'}[];diagnostics:Diagnostic[];
}
const validator=createValidator();validator.addSchema(legacy);validator.addSchema(fields);validator.addSchema(kinds);const check=validator.compile(schema),checkRequest=validator.compile(schema.properties.request);
export function classifySqlServerRecord(input:Document,options:SqlServerRecordRequest):SqlServerRecordClassification {
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as SqlServerRecordRequest;
 if(!checkRequest(request))throw new UmfError('SQLSERVER_RECORD_REQUEST',JSON.stringify(checkRequest.errors));
 if(!validateDocument(source).valid||source.umf!=='0.2.0')throw new UmfError('SQLSERVER_RECORD_VERSION','Explicitly migrated valid envelope required');
 const archive=parseNativeJson(request.nativeSource);
 if(exportSqlServerCatalog(source)!==renderTree(archive)+'\n')throw new UmfError('SQLSERVER_RECORD_ARCHIVE','Native archive differs from captured tree');
 const version=archive.kind==='object'?archive.members.serverVersion:undefined;if(version?.kind!=='string'||version.value!=='16.0.4295.3')throw new UmfError('SQLSERVER_RECORD_SERVER','This binding requires SQL Server 16.0.4295.3');
 const relations=archive.kind==='object'?archive.members.tables:undefined;if(!relations)throw new UmfError('SQLSERVER_RECORD_TABLES','Missing captured table observations');
 const matches=relations.kind==='array'?relations.items.flatMap((n,index)=>n.kind==='object'&&n.members.schema?.kind==='string'&&n.members.schema.value===request.relation.schema&&n.members.name?.kind==='string'&&n.members.name.value===request.relation.name?[{n,index}]:[]):[];
 if(matches.length!==1)throw new UmfError('SQLSERVER_RECORD_IDENTITY','Qualified relation is missing or ambiguous');
 const {n:native,index}=matches[0]!,nativePath='/tables/'+index,mi=source.modules.findIndex(m=>m.id==='sqlserver.columns');if(mi<0)throw new UmfError('SQLSERVER_RECORD_METADATA','Derived column module is required');
 const columns=getSqlServerColumnMetadata(source).filter(c=>c.path.startsWith(nativePath+'/columns/'));
 const result:SqlServerRecordClassification={operation:'classify-sqlserver-record',version:'1.0.0',status:'classified',source,request,binding,mappings:[],residuals:[],diagnostics:[]};
 const block=(code:string,path:string,value:unknown,reason:string)=>{result.status='blocked';result.residuals.push({path,value:copyJson(value),reason,recovery:'Source and native fragments retained; resolve conflict then recompute whole record classification'});result.diagnostics.push({code,path,message:reason,severity:'error'});};
 if(source.modules.some(m=>m.id===request.recordModule))block('RECORD_IDENTITY_COLLISION','/modules',request.recordModule,'Requested record module already exists; no merge is implied');
 const names=new Set<string>();let previousPosition=0;
 for(const column of columns){
  const name=column.element.name,position=column.nativeColumn.kind==='object'?column.nativeColumn.members.column_id:undefined;
  if(!name||names.has(name))block('SQLSERVER_MEMBER_IDENTITY',column.path,column.nativeColumn,'Captured table member names must be nonempty and unique');
  if(name)names.add(name);
  if(position?.kind!=='number'||!Number.isSafeInteger(Number(position.value))||Number(position.value)<=previousPosition)block('SQLSERVER_MEMBER_ORDER',column.path,column.nativeColumn,'Captured column positions must be positive and strictly increasing');
  else previousPosition=Number(position.value);
 }
 const authors=new Map<string,CoreKindDeclaration>();
 for(const author of request.authors??[]){
  try{verifyCoreKindDeclaration(author,source);}catch(error){if(!(error instanceof UmfError))throw error;block('STALE_AUTHOR',author.provenance.idealPath,author,'Author receipt differs from source: '+error.code);continue;}
  if(author.identity.module!=='sqlserver.columns'||!columns.some(c=>c.element.id===author.identity.element)||authors.has(author.identity.element))block('AUTHOR_IDENTITY',author.provenance.idealPath,author,'Duplicate or unrelated member author receipt');else authors.set(author.identity.element,author);
 }
 for(const column of columns){const author=authors.get(column.element.id),classified=classifySqlServerField(source,{column:column.path,nativeSource:request.nativeSource,mode:request.mode,...(author?{author}:{})});result.mappings.push(classified.mapping);for(const residual of classified.residuals)block('FIELD_KIND_CONFLICT',residual.path,residual.value,residual.reason);}
 const recordPath=`/modules/${source.modules.length}/elements/0`;
 result.mappings.push({origin:'classified',kind:'record',idealPath:recordPath+'/kind',nativePath,nativeFragment:copyJson(native),basis:'checked-catalog-table-members',outcome:result.status==='classified'?'exact':'unknown'});
 if(result.status==='classified'){
  const target=copyJson(source) as unknown as Document,ids=new Set(columns.map(c=>c.element.id));for(const element of target.modules[mi]!.elements)if(ids.has(element.id))element.kind='field';
  target.modules.push({id:request.recordModule,namespace:request.relation.schema,elements:[{id:request.recordId,name:request.relation.name,kind:'record',extensions:{},references:columns.map(c=>({role:'member',module:'sqlserver.columns',element:c.element.id}))}]});
  const validation=validateDocument(target);if(!validation.valid)throw new UmfError('SQLSERVER_RECORD_TARGET',JSON.stringify(validation.diagnostics));result.target=target;
 }
 const output=copyJson(result);if(!check(output))throw new UmfError('SQLSERVER_RECORD_RESULT',JSON.stringify(check.errors));return output as unknown as SqlServerRecordClassification;
}
export function recoverSqlServerRecordCapture(input:SqlServerRecordClassification,current:Document):string {
 const receipt=copyJson(input) as unknown as SqlServerRecordClassification;
 if(!check(receipt)||receipt.status!=='classified')throw new UmfError('SQLSERVER_RECORD_RECEIPT','Expected complete classification receipt');
 const expected=classifySqlServerRecord(receipt.source,receipt.request);
 const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key]!)).join(',')+'}':JSON.stringify(value);
 if(canonical(copyJson(receipt))!==canonical(copyJson(expected)))throw new UmfError('SQLSERVER_RECORD_RECEIPT','Receipt differs from recomputation');
 if(canonical(copyJson(current))!==canonical(copyJson(receipt.target)))throw new UmfError('SQLSERVER_RECORD_STALE','Current model changed');return receipt.request.nativeSource;
}
