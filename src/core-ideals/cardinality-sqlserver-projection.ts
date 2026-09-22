import {copyJson} from '../model/json';
import {UmfError,pointer,type Document,type Json,type Diagnostic} from '../model/types';
import {verifyCoreCardinalityDeclaration,type CoreCardinalityDeclaration} from '../model/cardinality';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';
import fields from '../../spec/core/field-document.schema.json';
import kinds from '../../spec/core/cardinality-operation.schema.json';
import availability from '../../spec/core/nullability-document.schema.json';
import containers from '../../spec/core/cardinality-document.schema.json';
import schema from '../../spec/core/cardinality-sqlserver-projection.schema.json';
export {default as cardinalitySqlServerProjectionSchema} from '../../spec/core/cardinality-sqlserver-projection.schema.json';
import {sqlServerCarriers as carriers,sqlServerIdentifier as identifier,sqlServerLiteral as literal} from './sqlserver-syntax';
export interface CardinalitySqlServerRequest {id:string;namespace:string;tableName:string;columnName:string;nativeType:keyof typeof carriers;mode:'strict'|'report';storage:'scalar'|'json-array'|'json-object';requireExactValues:boolean}
const binding=schema.properties.binding.const;
export interface CardinalitySqlServerProjection {
 operation:'project-cardinality-sqlserver';version:'1.0.0';status:'projected'|'blocked';source:Document;author:CoreCardinalityDeclaration;request:CardinalitySqlServerRequest;target?:{format:'sqlserver-ddl';sql:string};nativeSql?:string;diagnostics:Diagnostic[];binding:typeof binding;
 mapping:{origin:'authored';cardinality:'one'|'array'|'map'|'unspecified';encoding:'scalar'|'json-array'|'json-object'|'carrier-only';basis:'Explicit author declaration and selected native carrier; residuals qualify unrepresented obligations';idealPath:string;nativePath:'/sql';outcome:'exact'|'approximated'|'unknown'|'not-expressible'};
 residuals:{path:string;value:Json;reason:string;outcome:'approximated'|'unknown'|'not-expressible';recovery:'Recover source meaning with retained projection receipt; native-only import does not recover author intent'}[];
}
const validator=createValidator();validator.addSchema(legacy);validator.addSchema(fields);validator.addSchema(availability);validator.addSchema(containers);validator.addSchema(kinds);const check=validator.compile(schema);
const checkRequest=validator.compile({...schema.properties.request});
export function projectCardinalityToSqlServer(input:CoreCardinalityDeclaration,options:CardinalitySqlServerRequest):CardinalitySqlServerProjection {
 const copied=copyJson(input) as unknown as CoreCardinalityDeclaration;
 const author=verifyCoreCardinalityDeclaration(copied,copied.target),source=copyJson(author.target) as unknown as Document,request=copyJson(options) as unknown as CardinalitySqlServerRequest;
 if(source.umf!=='0.4.0')throw new UmfError('CARDINALITY_SQLSERVER_VERSION','This binding requires a core 0.4.0 declaration; facet-envelope projection requires a separately qualified binding');
 if(!checkRequest(request))throw new UmfError('CARDINALITY_SQLSERVER_REQUEST',JSON.stringify(checkRequest.errors));
 const namespace=identifier(request.namespace),tableName=identifier(request.tableName),columnName=identifier(request.columnName);
 const mi=source.modules.findIndex(m=>m.id===author.identity.module),module=source.modules[mi]!,ei=module.elements.findIndex(e=>e.id===author.identity.element),element=module.elements[ei]!,path=`/modules/${mi}/elements/${ei}`;
 const result:CardinalitySqlServerProjection={operation:'project-cardinality-sqlserver',version:'1.0.0',status:'projected',source,author,request,binding,mapping:{origin:'authored',cardinality:author.provenance.cardinality,encoding:request.storage,basis:'Explicit author declaration and selected native carrier; residuals qualify unrepresented obligations',idealPath:path+'/cardinality',nativePath:'/sql',outcome:'exact'},residuals:[],diagnostics:[]};
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
 const family=carriers[request.nativeType];
 const shape=author.provenance.cardinality,expected=request.storage==='scalar'?'one':request.storage==='json-array'?'array':'map';
 if(shape!=='unspecified'&&shape!==expected){result.mapping.encoding='carrier-only';loss(path+'/cardinality',shape,'Selected native representation does not express authored shape; no value conversion is implied','not-expressible');}
 if(request.requireExactValues)loss(path,element,request.nativeType==='real'?'Binary32 narrows binary64 1.0000000000000002 to 1.0':'This schema binding does not establish exact value-domain conversion','approximated');
 if(request.storage!=='scalar')loss(path+'/cardinality',shape,'JSON text storage requires JSON-compatible values within native text limits; arbitrary ideal member domains are not implicitly converted','approximated');
 if(request.storage==='json-object')loss(path+'/cardinality',shape,'ISJSON OBJECT does not enforce unique keys; duplicate-member and comparison intent remain separate','approximated');
 if(element.itemType!==undefined){
  const ref=element.itemType as {module:string;element:string},im=source.modules.findIndex(m=>m.id===ref.module),ie=source.modules[im]!.elements.findIndex(e=>e.id===ref.element);
  loss(path+'/itemType',element.itemType,'Item reference is retained; JSON shape checks do not enforce item type, availability or nested constraints','approximated');
  loss(`/modules/${im}/elements/${ie}`,source.modules[im]!.elements[ie]!,'Full item definition retained; recursive native conversion is not fabricated');
 }
 const clause=request.storage==='scalar'?'':` CHECK (ISJSON(${columnName},${request.storage==='json-array'?'ARRAY':'OBJECT'})=1)`;
 // Explicit SQL NULL avoids session-default changes; authored availability is an independent residual above.
 let text=`CREATE TABLE ${namespace}.${tableName} (${columnName} ${request.nativeType} NULL${clause});\n`;
 if(element.description!==undefined){
  const description=literal(element.description);
  if(element.description.length>3750)loss(path+'/description',element.description,'Description exceeds the bounded extended-property value size','not-expressible');
  else text+=`EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=${description}, @level0type=N'SCHEMA', @level0name=${literal(request.namespace)}, @level1type=N'TABLE', @level1name=${literal(request.tableName)}, @level2type=N'COLUMN', @level2name=${literal(request.columnName)};\n`;
 }
 if(element.scalarType!==undefined&&element.scalarType!==family)loss(path+'/scalarType',element.scalarType,'Explicit native type does not establish the stated scalar family','not-expressible');
 if(result.residuals.length)result.mapping.outcome=result.residuals.some(r=>r.outcome==='not-expressible')?'not-expressible':result.residuals.some(r=>r.outcome==='unknown')?'unknown':'approximated';
 if(request.mode==='strict'&&result.residuals.length)result.status='blocked';else {result.target={format:'sqlserver-ddl',sql:text};result.nativeSql=text;}
 result.diagnostics=result.residuals.map(r=>({code:'CARDINALITY_MEANING_NOT_PROJECTED',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const output=copyJson(result);if(!check(output))throw new UmfError('CARDINALITY_SQLSERVER_RESULT',JSON.stringify(check.errors));return output as unknown as CardinalitySqlServerProjection;
}
/** Recover retained author meaning only when the receipt and supplied native target still agree. */
export function recoverCardinalityFromSqlServer(input:CardinalitySqlServerProjection,nativeText:string):Document {
 const receipt=copyJson(input) as unknown as CardinalitySqlServerProjection;
 if(!check(receipt)||receipt.status!=='projected'||!receipt.target)throw new UmfError('CARDINALITY_SQLSERVER_RECEIPT','Expected projected receipt');
 const expected=projectCardinalityToSqlServer(receipt.author,receipt.request);
 const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key]!)).join(',')+'}':JSON.stringify(value);
 if(canonical(copyJson(expected))!==canonical(copyJson(receipt)))throw new UmfError('CARDINALITY_SQLSERVER_RECEIPT','Receipt does not match retained source and binding');
 if(typeof nativeText!=='string'||nativeText!==receipt.nativeSql||nativeText!==receipt.target.sql)throw new UmfError('CARDINALITY_SQLSERVER_STALE','Native target changed; retained report cannot assert recovery');
 return copyJson(receipt.source) as unknown as Document;
}
