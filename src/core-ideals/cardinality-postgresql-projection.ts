import {copyJson} from '../model/json';
import {UmfError,pointer,type Document,type Json,type Diagnostic} from '../model/types';
import {verifyCoreCardinalityDeclaration,type CoreCardinalityDeclaration} from '../model/cardinality';
import {importPostgresqlSql,getPostgresqlSource,type PostgresqlBackend} from '../adapters/postgresql';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';
import fields from '../../spec/core/field-document.schema.json';
import kinds from '../../spec/core/cardinality-operation.schema.json';
import availability from '../../spec/core/nullability-document.schema.json';
import containers from '../../spec/core/cardinality-document.schema.json';
import schema from '../../spec/core/cardinality-postgresql-projection.schema.json';
export {default as cardinalityPostgresqlProjectionSchema} from '../../spec/core/cardinality-postgresql-projection.schema.json';
import {carriers,identifier,literal} from './postgresql-syntax';
export interface CardinalityPostgresqlRequest {id:string;namespace:string;tableName:string;columnName:string;nativeType:keyof typeof carriers|'jsonb';mode:'strict'|'report';storage:'scalar'|'array'|'jsonb-object';requireExactValues:boolean}
const binding=schema.properties.binding.const;
export interface CardinalityPostgresqlProjection {
 operation:'project-cardinality-postgresql';version:'1.0.0';status:'projected'|'blocked';source:Document;author:CoreCardinalityDeclaration;request:CardinalityPostgresqlRequest;target?:Document;nativeSql?:string;diagnostics:Diagnostic[];binding:typeof binding;
 mapping:{origin:'authored';cardinality:'one'|'array'|'map'|'unspecified';encoding:'scalar'|'sequence-check'|'object-check'|'carrier-only';idealPath:string;nativePath:'/stmts/0/stmt/CreateStmt/tableElts/0/ColumnDef';outcome:'exact'|'approximated'|'unknown'|'not-expressible'};
 residuals:{path:string;value:Json;reason:string;outcome:'approximated'|'unknown'|'not-expressible';recovery:'Recover source meaning with retained projection receipt; native-only import does not recover author intent'}[];
}
const validator=createValidator();validator.addSchema(legacy);validator.addSchema(fields);validator.addSchema(availability);validator.addSchema(containers);validator.addSchema(kinds);const check=validator.compile(schema);
const checkRequest=validator.compile({...schema.properties.request});
export async function projectCardinalityToPostgresql(input:CoreCardinalityDeclaration,options:CardinalityPostgresqlRequest,backend:PostgresqlBackend):Promise<CardinalityPostgresqlProjection> {
 const copied=copyJson(input) as unknown as CoreCardinalityDeclaration;
 const author=verifyCoreCardinalityDeclaration(copied,copied.target),source=copyJson(author.target) as unknown as Document,request=copyJson(options) as unknown as CardinalityPostgresqlRequest;
 if(!checkRequest(request))throw new UmfError('CARDINALITY_POSTGRESQL_REQUEST',JSON.stringify(checkRequest.errors));
 const namespace=identifier(request.namespace),tableName=identifier(request.tableName),columnName=identifier(request.columnName);
 const mi=source.modules.findIndex(m=>m.id===author.identity.module),module=source.modules[mi]!,ei=module.elements.findIndex(e=>e.id===author.identity.element),element=module.elements[ei]!,path=`/modules/${mi}/elements/${ei}`;
 const result:CardinalityPostgresqlProjection={operation:'project-cardinality-postgresql',version:'1.0.0',status:'projected',source,author,request,binding,mapping:{origin:'authored',cardinality:author.provenance.cardinality,encoding:request.storage==='array'?'sequence-check':request.storage==='jsonb-object'?'object-check':'scalar',idealPath:path+'/cardinality',nativePath:'/stmts/0/stmt/CreateStmt/tableElts/0/ColumnDef',outcome:'exact'},residuals:[],diagnostics:[]};
 const loss=(path:string,value:unknown,reason:string,outcome:'approximated'|'unknown'|'not-expressible'='unknown')=>result.residuals.push({path,value:copyJson(value),reason,outcome,recovery:'Recover source meaning with retained projection receipt; native-only import does not recover author intent'});
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
 for(const [key,value] of Object.entries(element))if(!['id','kind','name','description','scalarType','cardinality','itemType'].includes(key)&&!(key==='extensions'&&value&&typeof value==='object'&&Object.keys(value).length===0))loss(path+'/'+pointer(key),value,'Field metadata is retained but not projected');
 const [nativeName,family]=request.nativeType==='jsonb'?['jsonb',undefined]:carriers[request.nativeType];
 const shape=author.provenance.cardinality;
 const expected=request.storage==='array'?'array':request.storage==='jsonb-object'?'map':'one';
 if(shape!=='unspecified'&&shape!==expected){result.mapping.encoding='carrier-only';loss(path+'/cardinality',shape,'Selected storage does not express the declared shape; no implicit value conversion is performed','not-expressible');}
 if(request.requireExactValues)loss(path,element,request.nativeType==='real'?'Binary32 cannot preserve binary64 1.0000000000000002; narrowing changes it to 1.0':'This shape binding does not establish exact value-domain conversion','approximated');
 if(request.storage==='array'){
  loss(path+'/cardinality',shape,'Native homogeneous item type constrains a general ideal sequence; arbitrary item domains require explicit conversion evidence','approximated');
 }
 if(request.storage==='jsonb-object')loss(path+'/cardinality',shape,'JSONB rejects NUL keys and out-of-range numeric values and normalizes duplicate keys; no unrestricted ideal-map equivalence','approximated');
 if(element.itemType!==undefined){
  const ref=element.itemType as {module:string;element:string};
  const im=source.modules.findIndex(m=>m.id===ref.module),ie=source.modules[im]!.elements.findIndex(e=>e.id===ref.element);
  loss(path+'/itemType',element.itemType,'Item reference remains authored metadata; nested types, item availability and value domains are not implicitly converted','approximated');
  loss(`/modules/${im}/elements/${ie}`,source.modules[im]!.elements[ie]!,'Full item definition retained for recovery; recursive native types are not fabricated');
 }
 const checkSql=request.storage==='array'?` CHECK (${columnName} IS NULL OR pg_catalog.cardinality(${columnName})=0 OR (pg_catalog.array_ndims(${columnName})=1 AND pg_catalog.array_lower(${columnName},1)=1))`:request.storage==='jsonb-object'?` CHECK (pg_catalog.jsonb_typeof(${columnName})='object')`:'';
 const text=`CREATE TABLE ${namespace}.${tableName} (${columnName} pg_catalog.${nativeName}${request.storage==='array'?'[]':''}${checkSql});\n`+(element.description!==undefined?`COMMENT ON COLUMN ${namespace}.${tableName}.${columnName} IS ${literal(element.description)};\n`:'');
 if(element.scalarType!==undefined&&element.scalarType!==family)loss(path+'/scalarType',element.scalarType,'Explicit native type does not establish the stated scalar family','not-expressible');
 if(result.residuals.length)result.mapping.outcome=result.residuals.some(r=>r.outcome==='not-expressible')?'not-expressible':result.residuals.some(r=>r.outcome==='unknown')?'unknown':'approximated';
 if(request.mode==='strict'&&result.residuals.length)result.status='blocked';else {result.target=await importPostgresqlSql(text,backend,{id:request.id});result.nativeSql=text;}
 result.diagnostics=result.residuals.map(r=>({code:'CARDINALITY_MEANING_NOT_PROJECTED',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const output=copyJson(result);if(!check(output))throw new UmfError('CARDINALITY_POSTGRESQL_RESULT',JSON.stringify(check.errors));return output as unknown as CardinalityPostgresqlProjection;
}
/** Recover retained author meaning only when the receipt and supplied native target still agree. */
export async function recoverCardinalityFromPostgresql(input:CardinalityPostgresqlProjection,nativeText:string,backend:PostgresqlBackend):Promise<Document> {
 const receipt=copyJson(input) as unknown as CardinalityPostgresqlProjection;
 if(!check(receipt)||receipt.status!=='projected'||!receipt.target)throw new UmfError('CARDINALITY_POSTGRESQL_RECEIPT','Expected projected receipt');
 const expected=await projectCardinalityToPostgresql(receipt.author,receipt.request,backend);
 const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key]!)).join(',')+'}':JSON.stringify(value);
 if(canonical(copyJson(expected))!==canonical(copyJson(receipt)))throw new UmfError('CARDINALITY_POSTGRESQL_RECEIPT','Receipt does not match retained source and binding');
 if(typeof nativeText!=='string'||nativeText!==receipt.nativeSql||nativeText!==getPostgresqlSource(receipt.target))throw new UmfError('CARDINALITY_POSTGRESQL_STALE','Native target changed; retained report cannot assert recovery');
 return copyJson(receipt.source) as unknown as Document;
}
