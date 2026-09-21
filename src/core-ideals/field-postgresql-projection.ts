import {copyJson} from '../model/json';
import {UmfError,pointer,type Document,type Json,type Diagnostic} from '../model/types';
import {verifyCoreKindDeclaration,type CoreKindDeclaration} from '../model/field-kind';
import {importPostgresqlSql,getPostgresqlSource,type PostgresqlBackend} from '../adapters/postgresql';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';
import fields from '../../spec/core/field-document.schema.json';
import kinds from '../../spec/core/kind-operation.schema.json';
import schema from '../../spec/core/field-postgresql-projection.schema.json';
export {default as fieldPostgresqlProjectionSchema} from '../../spec/core/field-postgresql-projection.schema.json';
const carriers={boolean:['bool','boolean'],smallint:['int2','integer'],integer:['int4','integer'],bigint:['int8','integer'],numeric:['numeric','decimal'],real:['float4','float'],'double precision':['float8','float'],text:['text','string'],bytea:['bytea','binary'],date:['date','date'],time:['time','time'],'time with time zone':['timetz','time'],timestamp:['timestamp','timestamp'],'timestamp with time zone':['timestamptz','timestamp']} as const;
export interface FieldPostgresqlRequest {id:string;namespace:string;tableName:string;columnName:string;nativeType:keyof typeof carriers;mode:'strict'|'report'}
function identifier(value:string):string {
 if(!value||value.includes('\0')||Array.from(value).some(c=>c.length===1&&c.charCodeAt(0)>=0xd800&&c.charCodeAt(0)<=0xdfff)||new TextEncoder().encode(value).length>63)throw new UmfError('POSTGRESQL_FIELD_IDENTIFIER','Expected nonempty valid Unicode identifier of at most 63 UTF-8 bytes');
 return '"'+value.replace(/"/g,'""')+'"';
}
function literal(value:string):string {
 if(value.includes('\0')||Array.from(value).some(c=>c.length===1&&c.charCodeAt(0)>=0xd800&&c.charCodeAt(0)<=0xdfff))throw new UmfError('POSTGRESQL_FIELD_DESCRIPTION','Description cannot contain NUL or unpaired surrogates');
 return "E'"+value.replace(/\\/g,'\\\\').replace(/'/g,"''")+"'";
}
const binding={id:'umf.core.field.postgresql',version:'1.0.0',nativeVersion:'17.4',subset:'Single authored Field with explicit pg_catalog carrier; no value-domain or execution equivalence'} as const;
export interface FieldPostgresqlProjection {
 operation:'project-field-postgresql';version:'1.0.0';status:'projected'|'blocked';source:Document;author:CoreKindDeclaration;request:FieldPostgresqlRequest;target?:Document;nativeSql?:string;diagnostics:Diagnostic[];binding:typeof binding;
 mapping:{origin:'authored';idealPath:string;nativePath:'/stmts/0/stmt/CreateStmt/tableElts/0/ColumnDef';outcome:'exact'|'unknown'|'not-expressible'};
 residuals:{path:string;value:Json;reason:string;outcome:'unknown'|'not-expressible';recovery:'Recover source meaning with retained projection receipt; native-only import does not recover author intent'}[];
}
const validator=createValidator();validator.addSchema(legacy);validator.addSchema(fields);validator.addSchema(kinds);const check=validator.compile(schema);
const checkRequest=validator.compile({...schema.properties.request});
export async function projectFieldToPostgresql(input:CoreKindDeclaration,options:FieldPostgresqlRequest,backend:PostgresqlBackend):Promise<FieldPostgresqlProjection> {
 const copied=copyJson(input) as unknown as CoreKindDeclaration;
 const author=verifyCoreKindDeclaration(copied,copied.target),source=copyJson(author.target) as unknown as Document,request=copyJson(options) as unknown as FieldPostgresqlRequest;
 if(!checkRequest(request))throw new UmfError('FIELD_POSTGRESQL_REQUEST',JSON.stringify(checkRequest.errors));
 const namespace=identifier(request.namespace),tableName=identifier(request.tableName),columnName=identifier(request.columnName);
 const mi=source.modules.findIndex(m=>m.id===author.identity.module),module=source.modules[mi]!,ei=module.elements.findIndex(e=>e.id===author.identity.element),element=module.elements[ei]!,path=`/modules/${mi}/elements/${ei}`;
 const result:FieldPostgresqlProjection={operation:'project-field-postgresql',version:'1.0.0',status:'projected',source,author,request,binding,mapping:{origin:'authored',idealPath:path+'/kind',nativePath:'/stmts/0/stmt/CreateStmt/tableElts/0/ColumnDef',outcome:'exact'},residuals:[],diagnostics:[]};
 const loss=(path:string,value:unknown,reason:string,outcome:'unknown'|'not-expressible'='unknown')=>result.residuals.push({path,value:copyJson(value),reason,outcome,recovery:'Recover source meaning with retained projection receipt; native-only import does not recover author intent'});
 if(author.provenance.kind!=='field')loss(path+'/kind',element.kind,'Record/group is not a single native column','not-expressible');
 if(element.name!==undefined&&element.name!==request.columnName)loss(path+'/name',element.name,'Explicit native column name differs from ideal name','not-expressible');
 // Closed projection scope: every source property outside the implemented mapping is disclosed.
 for(const [key,value] of Object.entries(source))if(!['umf','id','modules','vocabularies'].includes(key))loss('/'+pointer(key),value,'Document metadata is retained but not projected');
 if(Object.keys(source.vocabularies).length)loss('/vocabularies',source.vocabularies,'Native vocabulary semantics are not projected');
 source.modules.forEach((m,i)=>{
  if(i!==mi){loss('/modules/'+i,m,'Other module is outside selected Field projection');return;}
  for(const [key,value] of Object.entries(m))if(!['id','namespace','elements'].includes(key))loss(`/modules/${i}/`+pointer(key),value,'Module metadata is not projected');
  m.elements.forEach((e,j)=>{if(j!==ei)loss(`/modules/${i}/elements/${j}`,e,'Other element is outside selected Field projection');});
 });
 for(const [key,value] of Object.entries(element))if(!['id','kind','name','description','scalarType'].includes(key)&&!(key==='extensions'&&value&&typeof value==='object'&&Object.keys(value).length===0))loss(path+'/'+pointer(key),value,'Field metadata is retained but not projected');
 const [nativeName,family]=carriers[request.nativeType];
 const text=`CREATE TABLE ${namespace}.${tableName} (${columnName} pg_catalog.${nativeName});\n`+(element.description!==undefined?`COMMENT ON COLUMN ${namespace}.${tableName}.${columnName} IS ${literal(element.description)};\n`:'');
 if(element.scalarType!==undefined&&element.scalarType!==family)loss(path+'/scalarType',element.scalarType,'Explicit native type does not establish the stated scalar family','not-expressible');
 if(result.residuals.length)result.mapping.outcome=result.residuals.some(r=>r.outcome==='not-expressible')?'not-expressible':'unknown';
 // A record/group never becomes a field even under report policy.
 if(author.provenance.kind!=='field'||request.mode==='strict'&&result.residuals.length)result.status='blocked';else {result.target=await importPostgresqlSql(text,backend,{id:request.id});result.nativeSql=text;}
 result.diagnostics=result.residuals.map(r=>({code:'FIELD_MEANING_NOT_PROJECTED',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const output=copyJson(result);if(!check(output))throw new UmfError('FIELD_POSTGRESQL_RESULT',JSON.stringify(check.errors));return output as unknown as FieldPostgresqlProjection;
}
/** Recover retained author meaning only when the receipt and supplied native target still agree. */
export async function recoverFieldFromPostgresql(input:FieldPostgresqlProjection,nativeText:string,backend:PostgresqlBackend):Promise<Document> {
 const receipt=copyJson(input) as unknown as FieldPostgresqlProjection;
 if(!check(receipt)||receipt.status!=='projected'||!receipt.target)throw new UmfError('FIELD_POSTGRESQL_RECEIPT','Expected projected receipt');
 const expected=await projectFieldToPostgresql(receipt.author,receipt.request,backend);
 const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key]!)).join(',')+'}':JSON.stringify(value);
 if(canonical(copyJson(expected))!==canonical(copyJson(receipt)))throw new UmfError('FIELD_POSTGRESQL_RECEIPT','Receipt does not match retained source and binding');
 if(typeof nativeText!=='string'||nativeText!==receipt.nativeSql||nativeText!==getPostgresqlSource(receipt.target))throw new UmfError('FIELD_POSTGRESQL_STALE','Native target changed; retained report cannot assert recovery');
 return copyJson(receipt.source) as unknown as Document;
}
