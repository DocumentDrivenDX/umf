import {copyJson} from '../model/json';
import {renderTree} from '../model/native-json';
import {UmfError,type Document,type Json} from '../model/types';
import {exportPostgresqlCatalogCapture,getPostgresqlColumnMetadata,inspectPostgresqlCatalog,findPostgresqlCatalogRelation} from '../adapters/postgresql/catalog';
import {importAvroSchema} from '../adapters/avro';
import type {ProjectionIssue} from './json-schema-protobuf';
export type PostgresqlAvroRepresentation='value'|'finite-decimal'|'avro-temporal'|'sql-text';
export interface PostgresqlAvroPolicy {id:string;recordName:string;namespace:string;table:{schema:string;name:string};fields:Record<string,{name:string;representation:PostgresqlAvroRepresentation}>;lossPolicy:'strict'|'allow-reported-loss';}
export interface PostgresqlAvroProjection {status:'blocked'|'projected';source:Document;policy:PostgresqlAvroPolicy;issues:ProjectionIssue[];mappings:{sourcePath:string;column:string;field:string;representation:PostgresqlAvroRepresentation}[];target?:Document;nativeSchema?:string;}
const ident=/^[A-Za-z_][A-Za-z0-9_]*(?![\s\S])/;
/** Schema projection only. Finite/temporal bindings declare a restricted value domain. */
export function projectPostgresqlToAvro(source:Document,input:PostgresqlAvroPolicy):PostgresqlAvroProjection{
 const policy=copyJson(input) as unknown as PostgresqlAvroPolicy;
 const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
 if(!object(policy)||typeof policy.id!=='string'||!policy.id||typeof policy.recordName!=='string'||!ident.test(policy.recordName)||typeof policy.namespace!=='string'||!policy.namespace.split('.').every(p=>ident.test(p))||!object(policy.table)||typeof policy.table.schema!=='string'||typeof policy.table.name!=='string'||!object(policy.fields)||!Object.keys(policy.fields).length||!['strict','allow-reported-loss'].includes(policy.lossPolicy)||Object.keys(policy).some(k=>!['id','recordName','namespace','table','fields','lossPolicy'].includes(k))||Object.keys(policy.table).some(k=>!['schema','name'].includes(k)))throw new UmfError('POSTGRESQL_AVRO_POLICY','Expected explicit table, field bindings, Avro names and loss policy');
 const names=new Set<string>();for(const b of Object.values(policy.fields)){if(!object(b)||typeof b.name!=='string'||!ident.test(b.name)||!['value','finite-decimal','avro-temporal','sql-text'].includes(b.representation)||Object.keys(b).some(k=>!['name','representation'].includes(k))||names.has(b.name))throw new UmfError('POSTGRESQL_AVRO_POLICY','Invalid or duplicate target field binding');names.add(b.name);}
 const checked=inspectPostgresqlCatalog(source);if(!checked.valid)throw new UmfError('POSTGRESQL_AVRO_SOURCE','Invalid source capture');
 const result:PostgresqlAvroProjection={status:'blocked',source:copyJson(source) as Document,policy,issues:[],mappings:[]};let fatal=false;
 const issue=(path:string,code:string,classification:ProjectionIssue['classification'],detail:string)=>result.issues.push({path,code,classification,detail,retainedInSource:true});
 const fail=(path:string,detail:string)=>{fatal=true;issue(path,'POSTGRESQL_AVRO_UNSUPPORTED','unsupported',detail);};
 for(const d of checked.diagnostics){issue(d.path,d.code,'not-enforced',d.message);if(['POSTGRESQL_CATALOG_VERSION','POSTGRESQL_CATALOG_MODIFIED','POSTGRESQL_CATALOG_REPRESENTATION'].includes(d.code))fatal=true;}
 if(fatal)return result;
 exportPostgresqlCatalogCapture(source);
 const relation=findPostgresqlCatalogRelation(source,policy.table);
 if(!relation){fail('/table','Selected relation was not captured');return result;}
 const columns=getPostgresqlColumnMetadata(source).filter(c=>c.relation.schema===policy.table.schema&&c.relation.name===policy.table.name);
 if(!columns.length||columns.some(c=>!['r','p'].includes(c.relation.kind))){fail('/table','Expected an ordinary or partitioned table with captured columns');return result;}
 if(new Set(columns.map(c=>c.element.name)).size!==columns.length){fail('/table','Ambiguous duplicate native column names');return result;}
 issue('','SCHEMA_ONLY','representation-change','Schema projection only; native row values need a separate encoder, including exact int64, decimal and epoch conversion');
 issue('/table','DATABASE_SEMANTICS','not-enforced','Constraints, identity/default generation, indexes, partitioning, permissions, relationships and database behavior remain in the source; Avro does not execute them');
 for(const c of columns)if(!Object.hasOwn(policy.fields,c.element.name!))issue(c.path,'COLUMN_OMITTED','not-enforced','Column deliberately omitted by the selected bindings');
 const fields:Json[]=[];
 for(const [column,binding] of Object.entries(policy.fields)){
  const entry=columns.find(c=>c.element.name===column);if(!entry){fail('/fields/'+column,'Selected column does not exist');continue;}
  const c=JSON.parse(renderTree(entry.nativeColumn)),path=entry.path,t=c.nativeType,family=entry.element.scalarType;let type:Json|undefined;
  result.mappings.push({sourcePath:path,column,field:binding.name,representation:binding.representation});
  if(binding.representation==='sql-text'){
   type='string';issue(path,'SQL_TEXT_REPRESENTATION','representation-change','Explicit application text encoding requires native formatting/session choices; Avro string does not enforce native lexical, domain, array or type semantics');
  }else if(binding.representation==='finite-decimal'&&family==='decimal'){
   const modifier=t.modifier,raw=modifier-4;
   if(!Number.isInteger(modifier)||modifier<4||modifier>2147483647){fail(path,'Finite decimal requires a constrained native numeric typmod');continue;}
   const precision=(raw>>>16)&65535,scale=((raw&2047)^1024)-1024;
   if(precision<1||precision>1000||scale< -1000||scale>1000||(((precision<<16)|(scale&2047))+4)!==modifier){fail(path,'Invalid native numeric typmod');continue;}
   type={type:'bytes',logicalType:'decimal',precision:Math.max(precision,scale,precision-scale),scale:Math.max(0,scale)};
   issue(path,'DECIMAL_SPECIAL_VALUES','representation-change','Finite-decimal explicitly excludes native NaN; no instance filtering or coercion is performed');
   issue(path,'DECIMAL_COERCION','not-enforced','Avro does not execute PostgreSQL numeric rounding or input coercion');
   if(scale<0||scale>precision)issue(path,'DECIMAL_DOMAIN_WIDENED','not-enforced','Avro precision/scale admits values outside native negative-scale quantization or fractional-only range');
  }else if(binding.representation==='avro-temporal'&&['date','time','timestamp'].includes(family??'')){
   if(t.name==='timetz'){fail(path,'Time with time zone needs an offset-preserving representation; choose sql-text');continue;}
   if(t.name!=='date'&&(!Number.isInteger(t.modifier)||t.modifier< -1||t.modifier>6)){fail(path,'Invalid native temporal precision');continue;}
   type={type:t.name==='date'?'int':'long',logicalType:t.name==='date'?'date':t.name==='time'?'time-micros':t.name==='timestamp'?'local-timestamp-micros':'timestamp-micros'};
   issue(path,'TEMPORAL_DOMAIN','representation-change','Explicit Avro temporal subset excludes native infinities, time 24:00 and values outside target carrier/library ranges; epoch conversion and rejection require a separate encoder');
   issue(path,'TEMPORAL_REFINEMENTS','not-enforced','Native precision, input/session timezone behavior and calendar range are not enforced by the target schema');
  }else if(binding.representation==='value'){
   if(family==='boolean')type='boolean';
   else if(family==='integer'){type=t.name==='int8'?'long':'int';if(t.name==='int2')issue(path,'INTEGER_RANGE','not-enforced','Avro int admits values outside smallint range');}
   else if(family==='float'){type=t.name==='float4'?'float':'double';issue(path,'FLOAT_BEHAVIOR','not-enforced','Native NaN ordering, comparisons and input overflow/underflow behavior are not Avro schema constraints');}
   else if(family==='string'){type='string';issue(path,'TEXT_REFINEMENTS','not-enforced','Native length, collation, fixed-width padding and NUL exclusion are not enforced by Avro string');}
   else if(family==='binary')type='bytes';
   else fail(path,'No unrestricted value mapping; decimal/temporal require explicit subset bindings, and arrays/domains/other types require explicit text or future native mappings');
  }else fail(path,'Representation does not match the native type family');
  if(type!==undefined)fields.push({name:binding.name,type:c.notNull?type:['null',type],...(typeof c.comment==='string'?{doc:c.comment}:{})});
 }
 if(fatal||policy.lossPolicy==='strict'&&result.issues.length)return result;
 result.nativeSchema=JSON.stringify({type:'record',name:policy.recordName,namespace:policy.namespace,fields},null,2)+'\n';result.target=importAvroSchema(result.nativeSchema,{id:policy.id});result.status='projected';return result;
}
