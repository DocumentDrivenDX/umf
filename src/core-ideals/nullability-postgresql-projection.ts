import {copyJson} from '../model/json';
import {UmfError,pointer,type Document,type Json,type Diagnostic} from '../model/types';
import {verifyCoreNullabilityDeclaration,type CoreNullabilityDeclaration} from '../model/nullability';
import {importPostgresqlSql,getPostgresqlSource,type PostgresqlBackend} from '../adapters/postgresql';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';
import fields from '../../spec/core/field-document.schema.json';
import kinds from '../../spec/core/nullability-operation.schema.json';
import availability from '../../spec/core/nullability-document.schema.json';
import schema from '../../spec/core/nullability-postgresql-projection.schema.json';
export {default as nullabilityPostgresqlProjectionSchema} from '../../spec/core/nullability-postgresql-projection.schema.json';
import {carriers,identifier,literal} from './postgresql-syntax';
export interface NullabilityPostgresqlRequest {id:string;namespace:string;tableName:string;columnName:string;nativeType:keyof typeof carriers;mode:'strict'|'report';scope:'stored-relation'|'query-result'|'write-input'|'unresolved';carrier:'sql-null'|'unresolved'}
const binding=schema.properties.binding.const;
export interface NullabilityPostgresqlProjection {
 operation:'project-nullability-postgresql';version:'1.0.0';status:'projected'|'blocked';source:Document;author:CoreNullabilityDeclaration;request:NullabilityPostgresqlRequest;target?:Document;nativeSql?:string;diagnostics:Diagnostic[];binding:typeof binding;
 mapping:{origin:'authored';nullability:'required'|'absent-allowed'|'unspecified';encoding:'not-null'|'null'|'omitted';scope:NullabilityPostgresqlRequest['scope'];carrier:NullabilityPostgresqlRequest['carrier'];idealPath:string;nativePath:'/stmts/0/stmt/CreateStmt/tableElts/0/ColumnDef';outcome:'exact'|'unknown'|'not-expressible'};
 residuals:{path:string;value:Json;reason:string;outcome:'unknown'|'not-expressible';recovery:'Recover source meaning with retained projection receipt; native-only import does not recover author intent'}[];
}
const validator=createValidator();validator.addSchema(legacy);validator.addSchema(fields);validator.addSchema(availability);validator.addSchema(kinds);const check=validator.compile(schema);
const checkRequest=validator.compile({...schema.properties.request});
export async function projectNullabilityToPostgresql(input:CoreNullabilityDeclaration,options:NullabilityPostgresqlRequest,backend:PostgresqlBackend):Promise<NullabilityPostgresqlProjection> {
 const copied=copyJson(input) as unknown as CoreNullabilityDeclaration;
 const author=verifyCoreNullabilityDeclaration(copied,copied.target),source=copyJson(author.target) as unknown as Document,request=copyJson(options) as unknown as NullabilityPostgresqlRequest;
 if(!checkRequest(request))throw new UmfError('NULLABILITY_POSTGRESQL_REQUEST',JSON.stringify(checkRequest.errors));
 const namespace=identifier(request.namespace),tableName=identifier(request.tableName),columnName=identifier(request.columnName);
 const mi=source.modules.findIndex(m=>m.id===author.identity.module),module=source.modules[mi]!,ei=module.elements.findIndex(e=>e.id===author.identity.element),element=module.elements[ei]!,path=`/modules/${mi}/elements/${ei}`;
 const result:NullabilityPostgresqlProjection={operation:'project-nullability-postgresql',version:'1.0.0',status:'projected',source,author,request,binding,mapping:{origin:'authored',nullability:author.provenance.nullability,encoding:'omitted',scope:request.scope,carrier:request.carrier,idealPath:path+'/nullability',nativePath:'/stmts/0/stmt/CreateStmt/tableElts/0/ColumnDef',outcome:'exact'},residuals:[],diagnostics:[]};
 const loss=(path:string,value:unknown,reason:string,outcome:'unknown'|'not-expressible'='unknown')=>result.residuals.push({path,value:copyJson(value),reason,outcome,recovery:'Recover source meaning with retained projection receipt; native-only import does not recover author intent'});
 if(element.name!==undefined&&element.name!==request.columnName)loss(path+'/name',element.name,'Explicit native column name differs from ideal name','not-expressible');
 // Closed projection scope: every source property outside the implemented mapping is disclosed.
 for(const [key,value] of Object.entries(source))if(!['umf','id','modules','vocabularies'].includes(key))loss('/'+pointer(key),value,'Document metadata is retained but not projected');
 if(Object.keys(source.vocabularies).length)loss('/vocabularies',source.vocabularies,'Native vocabulary semantics are not projected');
 source.modules.forEach((m,i)=>{
  if(i!==mi){loss('/modules/'+i,m,'Other module is outside selected Field projection');return;}
  if(m.namespace&&m.namespace!==request.namespace)loss(`/modules/${i}/namespace`,m.namespace,'Native schema name differs from ideal namespace','not-expressible');
  for(const [key,value] of Object.entries(m))if(!['id','namespace','elements'].includes(key))loss(`/modules/${i}/`+pointer(key),value,'Module metadata is not projected');
  m.elements.forEach((e,j)=>{if(j!==ei)loss(`/modules/${i}/elements/${j}`,e,'Other element is outside selected Field projection');});
 });
 for(const [key,value] of Object.entries(element))if(!['id','kind','name','description','scalarType','nullability'].includes(key)&&!(key==='extensions'&&value&&typeof value==='object'&&Object.keys(value).length===0))loss(path+'/'+pointer(key),value,'Field metadata is retained but not projected');
 const [nativeName,family]=carriers[request.nativeType];
 let availabilitySql='';
 if(author.provenance.nullability!=='unspecified'){
  if(request.scope!=='stored-relation')loss(path+'/nullability',author.provenance.nullability,'Only stored-relation availability is implemented; query guarantees and omitted inputs require other bindings','not-expressible');
  else if(request.carrier!=='sql-null')loss(path+'/nullability',author.provenance.nullability,'Explicit SQL-NULL absence carrier required; no equivalence with omitted members is inferred');
  else if(author.provenance.nullability==='required'){availabilitySql=' NOT NULL';result.mapping.encoding='not-null';}
  else{availabilitySql=' NULL';result.mapping.encoding='null';}
 }
 const text=`CREATE TABLE ${namespace}.${tableName} (${columnName} pg_catalog.${nativeName}${availabilitySql});\n`+(element.description!==undefined?`COMMENT ON COLUMN ${namespace}.${tableName}.${columnName} IS ${literal(element.description)};\n`:'');
 if(element.scalarType!==undefined&&element.scalarType!==family)loss(path+'/scalarType',element.scalarType,'Explicit native type does not establish the stated scalar family','not-expressible');
 if(result.residuals.length)result.mapping.outcome=result.residuals.some(r=>r.outcome==='not-expressible')?'not-expressible':'unknown';
 if(request.mode==='strict'&&result.residuals.length)result.status='blocked';else {result.target=await importPostgresqlSql(text,backend,{id:request.id});result.nativeSql=text;}
 result.diagnostics=result.residuals.map(r=>({code:'NULLABILITY_MEANING_NOT_PROJECTED',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const output=copyJson(result);if(!check(output))throw new UmfError('NULLABILITY_POSTGRESQL_RESULT',JSON.stringify(check.errors));return output as unknown as NullabilityPostgresqlProjection;
}
/** Recover retained author meaning only when the receipt and supplied native target still agree. */
export async function recoverNullabilityFromPostgresql(input:NullabilityPostgresqlProjection,nativeText:string,backend:PostgresqlBackend):Promise<Document> {
 const receipt=copyJson(input) as unknown as NullabilityPostgresqlProjection;
 if(!check(receipt)||receipt.status!=='projected'||!receipt.target)throw new UmfError('NULLABILITY_POSTGRESQL_RECEIPT','Expected projected receipt');
 const expected=await projectNullabilityToPostgresql(receipt.author,receipt.request,backend);
 const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key]!)).join(',')+'}':JSON.stringify(value);
 if(canonical(copyJson(expected))!==canonical(copyJson(receipt)))throw new UmfError('NULLABILITY_POSTGRESQL_RECEIPT','Receipt does not match retained source and binding');
 if(typeof nativeText!=='string'||nativeText!==receipt.nativeSql||nativeText!==getPostgresqlSource(receipt.target))throw new UmfError('NULLABILITY_POSTGRESQL_STALE','Native target changed; retained report cannot assert recovery');
 return copyJson(receipt.source) as unknown as Document;
}
