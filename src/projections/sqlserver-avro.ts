import {copyJson} from '../model/json';
import {renderTree} from '../model/native-json';
import {UmfError,type Document,type Json} from '../model/types';
import {exportSqlServerCatalog,getSqlServerColumnMetadata,getSqlServerConstraintMetadata,getSqlServerIndexMetadata,inspectSqlServer} from '../adapters/sqlserver';
import {importAvroSchema} from '../adapters/avro';
import type {ProjectionIssue} from './json-schema-protobuf';
export interface SqlServerAvroPolicy {id:string;recordName:string;namespace:string;table:{schema:string;name:string};fields:Record<string,{name:string;representation:'value'|'sql-text'}>;lossPolicy:'strict'|'allow-reported-loss';}
export interface SqlServerAvroProjection {status:'blocked'|'projected';source:Document;policy:SqlServerAvroPolicy;issues:ProjectionIssue[];mappings:{sourcePath:string;column:string;field:string;representation:'value'|'sql-text'}[];target?:Document;nativeSchema?:string;}
const ident=/^[A-Za-z_][A-Za-z0-9_]*(?![\s\S])/;
export function projectSqlServerToAvro(source:Document,input:SqlServerAvroPolicy):SqlServerAvroProjection{
 const policy=copyJson(input) as unknown as SqlServerAvroPolicy;
 const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
 if(!object(policy)||typeof policy.id!=='string'||!policy.id||typeof policy.recordName!=='string'||!ident.test(policy.recordName)||typeof policy.namespace!=='string'||!policy.namespace.split('.').every(p=>ident.test(p))||!object(policy.table)||typeof policy.table.schema!=='string'||typeof policy.table.name!=='string'||!object(policy.fields)||!Object.keys(policy.fields).length||!['strict','allow-reported-loss'].includes(policy.lossPolicy)||Object.keys(policy).some(k=>!['id','recordName','namespace','table','fields','lossPolicy'].includes(k))||Object.keys(policy.table).some(k=>!['schema','name'].includes(k)))throw new UmfError('SQLSERVER_AVRO_POLICY','Expected explicit table, field bindings, Avro names and loss policy');
 const targetNames=new Set<string>();for(const binding of Object.values(policy.fields)){if(!object(binding)||typeof binding.name!=='string'||!ident.test(binding.name)||!['value','sql-text'].includes(binding.representation)||Object.keys(binding).some(k=>!['name','representation'].includes(k))||targetNames.has(binding.name))throw new UmfError('SQLSERVER_AVRO_POLICY','Invalid or duplicate target field binding');targetNames.add(binding.name);}
 const checked=inspectSqlServer(source);if(!checked.valid)throw new UmfError('SQLSERVER_AVRO_SOURCE','Invalid source capture');
 const result:SqlServerAvroProjection={status:'blocked',source:copyJson(source) as Document,policy,issues:[],mappings:[]};let fatal=false;
 const issue=(path:string,code:string,classification:ProjectionIssue['classification'],detail:string)=>result.issues.push({path,code,classification,detail,retainedInSource:true});
 const fail=(path:string,detail:string)=>{fatal=true;issue(path,'SQLSERVER_AVRO_UNSUPPORTED','unsupported',detail);};
 for(const d of checked.diagnostics){issue(d.path,d.code,'not-enforced',d.message);if(['SQLSERVER_VERSION','SQLSERVER_MODIFIED','SQLSERVER_ENCODING'].includes(d.code))fatal=true;}
 if(fatal)return result;
 exportSqlServerCatalog(source); // Reject a stale materialized view before deriving a target.
 const columns=getSqlServerColumnMetadata(source).filter(c=>c.table.schema===policy.table.schema&&c.table.name===policy.table.name);
 if(!columns.length){fail('/table','Table is absent or has no captured columns');return result;}
 issue('','SCHEMA_ONLY','representation-change','Schema projection only: SQL/native row values require a separate explicit encoder; source UMF remains required for fidelity');
 issue('/table','DATABASE_SEMANTICS','not-enforced','Keys, checks, foreign keys, permissions, triggers, indexes and other database semantics are not enforced by this Avro record and may be outside the capture');
 const constraints=getSqlServerConstraintMetadata(source).tables.find(t=>t.table.schema===policy.table.schema&&t.table.name===policy.table.name)!;
 for(const section of ['keys','foreign_keys','checks'] as const){
  const path=constraints.path+'/'+section;
  if(!constraints.available[section])issue(path,'CONSTRAINT_COVERAGE_UNAVAILABLE','not-enforced','Native '+section+' were not captured; absence of observations does not imply absence of constraints');
  for(const [index,node] of constraints[section].entries()){
   const c=JSON.parse(renderTree(node)),name=JSON.stringify(c.name);
   const detail=section==='keys'?'Key '+name+' ('+c.kind+') is not enforced across Avro records; column order, index behavior and disabled state remain native':section==='foreign_keys'?'Foreign key '+name+' is not enforced; referenced columns, '+c.delete_action+'/'+c.update_action+' actions, trust, disabled and replication state remain native':'Check '+name+' is not evaluated; SQL null/UNKNOWN behavior, trust, disabled, replication and collation state remain native';
   issue(path+'/'+index,section==='keys'?'KEY_NOT_ENFORCED':section==='foreign_keys'?'FOREIGN_KEY_NOT_ENFORCED':'CHECK_NOT_ENFORCED','not-enforced',detail);
  }
 }
 for(const c of columns)if(!Object.hasOwn(policy.fields,c.element.name!))issue(c.path,'COLUMN_OMITTED','not-enforced','Column deliberately omitted by the selected field bindings');
 const indexes=getSqlServerIndexMetadata(source).tables.find(t=>t.table.schema===policy.table.schema&&t.table.name===policy.table.name)!;
 for(const [index] of indexes.indexes.entries())issue(indexes.path+'/indexes/'+index,'INDEX_NOT_REPRESENTED','not-enforced','Native index/heap semantics are not represented: filtered uniqueness, SQL null/collation behavior, included/order/partition columns, disabled state and physical options remain source-owned');
 const fields:Json[]=[];
 for(const [column,binding] of Object.entries(policy.fields)){
  const entry=columns.find(c=>c.element.name===column);if(!entry){fail('/fields/'+column,'Selected source column does not exist');continue;}
  const c=JSON.parse(renderTree(entry.nativeColumn)),path=entry.path;let type:Json|undefined;
  result.mappings.push({sourcePath:path,column,field:binding.name,representation:binding.representation});
  if(binding.representation==='sql-text'){
   type='string';issue(path,'SQL_TEXT_REPRESENTATION','representation-change','Native text is an explicit application encoding; formatting/session choices, type tags, XML validation and native lexical constraints are not preserved by Avro string');
  }else{
   const family=entry.element.scalarType;
   if(family==='boolean')type='boolean';
   else if(family==='integer'){type=c.system_type_id===127?'long':'int';if(c.system_type_id!==127&&c.system_type_id!==56)issue(path,'INTEGER_RANGE','not-enforced','Avro int admits values outside the native tinyint/smallint range');}
   else if(family==='float'){type=c.system_type_id===59?'float':'double';issue(path,'NONFINITE_VALUES','not-enforced','Avro floating types admit non-finite values that are not SQL Server numeric values');}
   else if(family==='decimal'){
    if(!Number.isInteger(c.precision)||c.precision<1||c.precision>38||!Number.isInteger(c.scale)||c.scale<0||c.scale>c.precision)fail(path,'Invalid or unsupported decimal precision/scale');
    else type={type:'bytes',logicalType:'decimal',precision:c.precision,scale:c.scale};
    if([60,122].includes(c.system_type_id))issue(path,'MONEY_RANGE','not-enforced','Decimal precision/scale does not enforce the narrower native money/smallmoney range');
   }else if(family==='string'){type='string';issue(path,'TEXT_REFINEMENTS','not-enforced','Native byte/character limits, code page, collation and fixed-width padding are not enforced by Avro string');}
   else if(family==='binary'){
    if([173,189].includes(c.system_type_id)){
     if(!Number.isSafeInteger(c.max_length)||c.max_length<1||c.max_length>8000||(c.system_type_id===189&&c.max_length!==8))fail(path,'Invalid fixed binary or rowversion width');
     else type={type:'fixed',name:policy.recordName+'_field_'+fields.length,size:c.max_length};
    }
    else{type='bytes';issue(path,'BINARY_LENGTH','not-enforced','Native varbinary/image length semantics are not enforced by Avro bytes');}
   }else if(family==='date') {type={type:'int',logicalType:'date'};issue(path,'DATE_RANGE','not-enforced','Avro date does not enforce the SQL Server year range');}
   else if(family==='time'&&c.system_type_id===41&&c.scale<=6){type={type:'long',logicalType:'time-micros'};issue(path,'TIME_RESOLUTION','not-enforced','Avro time-micros does not enforce the native scale or all native time value constraints');}
   else if(family==='timestamp'&&[42,43].includes(c.system_type_id)&&c.scale<=6){type={type:'long',logicalType:c.system_type_id===42?'local-timestamp-micros':'timestamp-micros'};issue(path,'TIMESTAMP_REFINEMENTS','not-enforced','Native year range and scale are not enforced; datetimeoffset offset identity is not preserved by an instant');}
   else fail(path,'Native value mapping is unavailable or would lose temporal precision; choose an explicit representation or extend the mapping');
  }
  if(c.is_user_defined)issue(path,'ALIAS_IDENTITY','annotation-only','Native alias identity and any bound rules/defaults remain in the source');
  if(c.is_identity||c.is_computed||c.system_type_id===189)issue(path,'GENERATED_BEHAVIOR','not-enforced','Identity, computed or rowversion generation is not performed by an Avro writer');
  if(c.default_definition!==null)issue(path,'SQL_DEFAULT','not-enforced','SQL defaults do not become Avro reader defaults or make writer fields optional');
  if(type!==undefined)fields.push({name:binding.name,type:c.is_nullable?['null',type]:type,...(typeof c.description==='string'?{doc:c.description}:{})});
 }
 if(fatal||policy.lossPolicy==='strict'&&result.issues.length)return result;
 result.nativeSchema=JSON.stringify({type:'record',name:policy.recordName,namespace:policy.namespace,fields},null,2)+'\n';
 result.target=importAvroSchema(result.nativeSchema,{id:policy.id});result.status='projected';return result;
}
