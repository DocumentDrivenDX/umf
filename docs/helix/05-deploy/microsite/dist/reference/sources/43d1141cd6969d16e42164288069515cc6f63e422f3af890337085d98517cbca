import {copyJson} from '../model/json';
import {UmfError,pointer,type Document,type JsonObject} from '../model/types';
import {renderTree} from '../model/native-json';
import {inspectPostgresqlCatalog,findPostgresqlCatalogRelation} from '../adapters/postgresql/catalog';
import {importJsonSchema} from '../adapters/json-schema';
import type {ProjectionIssue} from './json-schema-protobuf';
export interface PostgresqlRowPolicy {
 id:string;schemaId:string;relation:{schema:string;name:string};
 columns:Record<string,'sql-text'|'json-boolean'|'json-int32'|'json-value'>;
 lossPolicy:'strict'|'allow-reported-loss';
}
export interface PostgresqlRowProjection {
 status:'blocked'|'projected';complete:false;source:Document;policy:PostgresqlRowPolicy;
 issues:ProjectionIssue[];mappings:{column:string;nativeType:string;encoding:string;targetPointer:string}[];
 target?:Document;nativeSchema?:string;sql?:string;
}
/** Read-row encoding contract; never an INSERT validator or automatic migration. */
export function projectPostgresqlRowToJsonSchema(source:Document,input:PostgresqlRowPolicy):PostgresqlRowProjection{
 const policy=copyJson(input) as unknown as PostgresqlRowPolicy;
 if(!policy||typeof policy.id!=='string'||!policy.id||typeof policy.schemaId!=='string'||!policy.relation||typeof policy.relation.schema!=='string'||!policy.relation.schema||typeof policy.relation.name!=='string'||!policy.relation.name||!policy.columns||typeof policy.columns!=='object'||Array.isArray(policy.columns)||!Object.keys(policy.columns).length||Object.values(policy.columns).some(v=>!['sql-text','json-boolean','json-int32','json-value'].includes(v))||!['strict','allow-reported-loss'].includes(policy.lossPolicy)||Object.keys(policy).some(k=>!['id','schemaId','relation','columns','lossPolicy'].includes(k))||Object.keys(policy.relation).some(k=>!['schema','name'].includes(k)))throw new UmfError('POSTGRESQL_ROW_POLICY','Explicit relation, encodings and loss policy are required');
 if([policy.relation.schema,policy.relation.name,...Object.keys(policy.columns)].some(s=>s.includes('\0')))throw new UmfError('POSTGRESQL_ROW_POLICY','NUL is not a SQL identifier');
 try{if(new URL(policy.schemaId).hash)throw Error();}catch{throw new UmfError('POSTGRESQL_ROW_POLICY','Expected absolute fragment-free schema URI');}
 const checked=inspectPostgresqlCatalog(source);if(!checked.valid)throw new UmfError('POSTGRESQL_ROW_SOURCE','Invalid catalog capture');
 const result:PostgresqlRowProjection={status:'blocked',complete:false,source:copyJson(source) as unknown as Document,policy,issues:[],mappings:[]};
 const issue=(path:string,code:string,classification:ProjectionIssue['classification'],detail:string)=>result.issues.push({path,code,classification,detail,retainedInSource:true});
 for(const d of checked.diagnostics)issue(d.path,d.code,'not-enforced',d.message);
 issue('','POSTGRESQL_ROW_ONLY','not-enforced','Read-row shape only. Catalog correspondence, defaults, generated expressions, domain/check/key/foreign-key constraints, privileges, policies, triggers, ordering and database state remain authoritative in PostgreSQL; no INSERT validation or SQL execution is performed.');
 let node;try{node=findPostgresqlCatalogRelation(source,policy.relation);}catch(e){issue('/relation','POSTGRESQL_ROW_RELATION','unsupported',(e as Error).message);return result;}
 if(!node){issue('/relation','POSTGRESQL_ROW_RELATION','unsupported','Selected relation was not captured');return result;}
 // Validation-only host view: native unknown values stay exact in result.source.
 const relation=JSON.parse(renderTree(node));const columns=relation.columns??[];
 if(!['r','p','v','m','f'].includes(relation.kind)){issue('/relation','POSTGRESQL_ROW_KIND','unsupported','Expected a row-producing relation');return result;}
 const props:Record<string,JsonObject>=Object.create(null);const values:string[]=[];let fatal=false;
 const quote=(name:string)=>'"'+name.replaceAll('"','""')+'"';
 const literal=(name:string)=>"E'"+name.replaceAll('\\','\\\\').replaceAll("'","''")+"'";
 for(const column of columns)if(!Object.hasOwn(policy.columns,column.name))issue('/columns/'+pointer(column.name),'POSTGRESQL_COLUMN_OMITTED','not-enforced','Native column is omitted from the selected read-row representation');
 for(const [name,encoding] of Object.entries(policy.columns)){
  const matches=columns.filter((c:any)=>c.name===name);const path='/columns/'+pointer(name);
  if(matches.length!==1){fatal=true;issue(path,'POSTGRESQL_COLUMN','unsupported','Column is missing or ambiguous in the capture');continue;}
  const c=matches[0];let shape:JsonObject={};let expression='r.'+quote(name);
  if(encoding==='sql-text'){
   shape={type:'string'};expression+='::text';issue(path,'POSTGRESQL_TEXT_ENCODING','representation-change','Uses the server native text output/cast; native type structure, lexical/domain constraints and session-dependent formatting are not portable JSON validation.');
  }else if(encoding==='json-boolean'&&c.type==='boolean')shape={type:'boolean'};
  else if(encoding==='json-int32'&&['smallint','integer'].includes(c.type))shape={type:'integer',minimum:c.type==='smallint'?-32768:-2147483648,maximum:c.type==='smallint'?32767:2147483647};
  else if(encoding==='json-value'&&['json','jsonb'].includes(c.type)){
   shape={};issue(path,'POSTGRESQL_JSON_VALUE','representation-change','SQL NULL and JSON null share an output representation; JSON Schema does not preserve duplicate object keys or guarantee exact client parsing of embedded numbers.');
  }else{fatal=true;issue(path,'POSTGRESQL_ENCODING','unsupported','Encoding '+encoding+' is not verified for native type '+c.type+'; choose an explicit native-text representation or add a proven binding');continue;}
  if(!c.notNull&&encoding!=='json-value')shape={anyOf:[shape,{type:'null'}]};
  if(c.comment!==null)shape.description=c.comment;
  props[name]=shape;values.push('('+values.length+','+literal(name)+',pg_catalog.to_json('+expression+'))');
  result.mappings.push({column:name,nativeType:c.type,encoding,targetPointer:'/properties/'+pointer(name)});
 }
 if(checked.diagnostics.some(d=>d.code==='POSTGRESQL_CATALOG_MODIFIED'||d.code==='POSTGRESQL_CATALOG_VERSION')){fatal=true;issue('','POSTGRESQL_ROW_UNVERIFIED','unsupported','Modified metadata or untested server versions cannot generate executable row queries');}
 if(fatal||policy.lossPolicy==='strict'&&result.issues.length)return result;
 result.nativeSchema=JSON.stringify({$schema:'https://json-schema.org/draft/2020-12/schema',$id:policy.schemaId,type:'object',properties:props,required:Object.keys(props),additionalProperties:false},null,2)+'\n';
 result.target=importJsonSchema(result.nativeSchema,{id:policy.id,baseUri:policy.schemaId});
 result.sql='SELECT (SELECT pg_catalog.json_object_agg(v.key,v.value ORDER BY v.ordinal) FROM (VALUES '+values.join(',')+') AS v(ordinal,key,value)) AS row FROM '+quote(policy.relation.schema)+'.'+quote(policy.relation.name)+' AS r;';
 result.status='projected';return result;
}
