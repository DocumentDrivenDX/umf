import {copyJson} from '../model/json';
import {UmfError,pointer,type Document,type Json,type Diagnostic} from '../model/types';
import {verifyCoreKindDeclaration,type CoreKindDeclaration} from '../model/field-kind';
import {sqlServerCarriers as carriers,sqlServerIdentifier as identifier,sqlServerLiteral as literal} from './sqlserver-syntax';
import {type FieldSqlServerRequest,type FieldSqlServerProjection} from './field-sqlserver-projection';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import kinds from '../../spec/core/kind-operation.schema.json';import schema from '../../spec/core/record-sqlserver-projection.schema.json';
export {default as recordSqlServerProjectionSchema} from '../../spec/core/record-sqlserver-projection.schema.json';
export interface RecordSqlServerRequest {id:string;namespace:string;tableName:string;identifierCollation:'Latin1_General_100_BIN2';mode:'strict'|'report';fields:{author:CoreKindDeclaration;columnName:string;nativeType:FieldSqlServerRequest['nativeType']}[]}
const binding={id:'umf.core.record.sqlserver',version:'1.0.0',nativeVersion:'16.0.4295.3',subset:'Authored flat record with explicit builtin nullable carriers; requires database identifier collation Latin1_General_100_BIN2; no value-domain equivalence'} as const;
export interface RecordSqlServerProjection {operation:'project-record-sqlserver';version:'1.0.0';status:'projected'|'blocked';source:Document;author:CoreKindDeclaration;request:RecordSqlServerRequest;binding:typeof binding;target?:{format:'sqlserver-ddl';sql:string};nativeSql?:string;mappings:{origin:'authored';kind:'record'|'field';idealPath:string;nativePath:string;outcome:'exact'|'unknown'|'not-expressible'}[];residuals:FieldSqlServerProjection['residuals'];diagnostics:Diagnostic[]}
const validator=createValidator();validator.addSchema(legacy);validator.addSchema(fields);validator.addSchema(kinds);const check=validator.compile(schema),checkRequest=validator.compile(schema.properties.request);
export function projectRecordToSqlServer(input:CoreKindDeclaration,options:RecordSqlServerRequest):RecordSqlServerProjection {
 const copied=copyJson(input) as unknown as CoreKindDeclaration,author=verifyCoreKindDeclaration(copied,copied.target),source=copyJson(author.target) as unknown as Document,request=copyJson(options) as unknown as RecordSqlServerRequest;
 if(!checkRequest(request))throw new UmfError('RECORD_SQLSERVER_REQUEST',JSON.stringify(checkRequest.errors));
 const qualified=identifier(request.namespace)+'.'+identifier(request.tableName);for(const field of request.fields)identifier(field.columnName);
 const locate=(id:{module:string;element:string})=>{const mi=source.modules.findIndex(m=>m.id===id.module),ei=source.modules[mi]?.elements.findIndex(e=>e.id===id.element)??-1;if(mi<0||ei<0)throw new UmfError('RECORD_SQLSERVER_IDENTITY','Missing declared element');return {element:source.modules[mi]!.elements[ei]!,path:`/modules/${mi}/elements/${ei}`,mi};};
 const selected=locate(author.identity),record=selected.element,identity=(v:{module:string;element:string})=>JSON.stringify([v.module,v.element]);
 const result:RecordSqlServerProjection={operation:'project-record-sqlserver',version:'1.0.0',status:'projected',source,author,request,binding,mappings:[],residuals:[],diagnostics:[]};let hard=false;
 const loss=(path:string,value:unknown,reason:string,unexpressible=false,fatal=false)=>{hard ||= fatal;result.residuals.push({path,value:copyJson(value),reason,outcome:unexpressible?'not-expressible':'unknown',recovery:'Recover source meaning with retained projection receipt; native-only import does not recover author intent'});result.diagnostics.push({code:fatal?'RECORD_BINDING_CONFLICT':'RECORD_MEANING_NOT_PROJECTED',path,message:reason,severity:fatal||request.mode==='strict'?'error':'warning'});};
 if(author.provenance.kind!=='record')loss(selected.path+'/kind',record.kind,'Only an authored record can define the native table',true,true);
 if(record.name!==undefined&&record.name!==request.tableName)loss(selected.path+'/name',record.name,'Native table name differs from ideal name',true);
 const members=new Map<string,NonNullable<typeof record.references>[number]>();
 for(const [index,ref] of (record.references??[]).entries()){
  if(ref.role!=='member'){loss(selected.path+'/references/'+index,ref,'Non-member relationship is retained but not projected');continue;}
  if(members.has(identity(ref)))loss(selected.path+'/references/'+index,ref,'Duplicate record member',true,true);else members.set(identity(ref),ref);
  for(const [key,value] of Object.entries(ref))if(!['role','module','element'].includes(key))loss(selected.path+'/references/'+index+'/'+pointer(key),value,'Reference metadata is not projected');
 }
 const bindings=new Map<string,RecordSqlServerRequest['fields'][number]>(),names=new Set<string>();
 for(const field of request.fields){
  verifyCoreKindDeclaration(field.author,source);
  const key=identity(field.author.identity);
  if(bindings.has(key)||!members.has(key))loss(field.author.provenance.idealPath,field,'Duplicate or non-member native binding',true,true);else bindings.set(key,field);
  if(names.has(field.columnName))loss(field.author.provenance.idealPath,field.columnName,'Native column names collide',true,true);names.add(field.columnName);
 }
 const columns:Record<string,unknown>[]=[],included=new Set([selected.path]),locations:{path:string;scalarType?:string}[]=[];
 for(const [key,ref] of members){
  const found=locate(ref),field=bindings.get(key);included.add(found.path);
  if(!field){loss(found.path,found.element,'Missing explicit member binding',true,true);continue;}
  if(field.author.provenance.kind!=='field')loss(found.path+'/kind',found.element.kind,'Record member is not an authored field',true,true);
  if(found.element.name!==undefined&&found.element.name!==field.columnName)loss(found.path+'/name',found.element.name,'Native column name differs from ideal name',true);
  result.mappings.push({origin:'authored',kind:'field',idealPath:found.path+'/kind',nativePath:'/sql',outcome:'exact'});
  columns.push({name:field.columnName,data_type:field.nativeType,...(found.element.description!==undefined?{description:found.element.description}:{})});locations.push({path:found.path,...(found.element.scalarType!==undefined?{scalarType:found.element.scalarType}:{})});
 }
 for(const [key,value] of Object.entries(source))if(!['umf','id','modules','vocabularies'].includes(key))loss('/'+pointer(key),value,'Document metadata is not projected');
 if(Object.keys(source.vocabularies).length)loss('/vocabularies',source.vocabularies,'Native vocabulary semantics are not projected');
 source.modules.forEach((module,mi)=>{
  const root='/modules/'+mi;
  if(!module.elements.some((_,ei)=>included.has(root+'/elements/'+ei))){loss(root,module,'Module lies outside projected record');return;}
  for(const [key,value] of Object.entries(module))if(!['id','namespace','elements'].includes(key))loss(root+'/'+pointer(key),value,'Module metadata is not projected');
  module.elements.forEach((element,ei)=>{
   const path=root+'/elements/'+ei;if(!included.has(path)){loss(path,element,'Element lies outside projected record');return;}
   const known=path===selected.path?['id','kind','name','description','references']:['id','kind','name','description','scalarType'];
   for(const [key,value] of Object.entries(element))if(!known.includes(key)&&!(key==='extensions'&&value&&typeof value==='object'&&Object.keys(value).length===0))loss(path+'/'+pointer(key),value,'Element metadata is not projected');
  });
 });
 let nativeSql:string|undefined;
 if(!columns.length)loss(selected.path,record,'SQL Server cannot express a zero-column table',true,true);
 if(!hard){
  const definitions=columns.map(column=>identifier(column.name as string)+' '+column.data_type+' NULL');
  nativeSql=`IF CONVERT(nvarchar(128), DATABASEPROPERTYEX(DB_NAME(), 'Collation')) <> N'Latin1_General_100_BIN2' THROW 50000, 'UMF requires database identifier collation Latin1_General_100_BIN2', 1;\nCREATE TABLE ${qualified} (${definitions.join(', ')});\n`;
  const describe=(value:string,path:string,column?:string)=>{
   const description=literal(value);if(value.length>3750){loss(path,value,'Description exceeds the bounded extended-property value size',true);return;}
   nativeSql+=`EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=${description}, @level0type=N'SCHEMA', @level0name=${literal(request.namespace)}, @level1type=N'TABLE', @level1name=${literal(request.tableName)}`+(column!==undefined?`, @level2type=N'COLUMN', @level2name=${literal(column)}`:'')+';\n';
  };
  if(record.description!==undefined)describe(record.description,selected.path+'/description');
  columns.forEach((column,index)=>{if(column.description!==undefined)describe(column.description as string,locations[index]!.path+'/description',column.name as string);});
  locations.forEach((location,index)=>{if(location.scalarType!==undefined&&location.scalarType!==carriers[columns[index]!.data_type as FieldSqlServerRequest['nativeType']])loss(location.path+'/scalarType',location.scalarType,'Native type does not establish ideal scalar family',true);});
 }
 for(const mapping of result.mappings){const prefix=mapping.idealPath.slice(0,-5);if(result.residuals.some(r=>r.path.startsWith(prefix+'/')))mapping.outcome='unknown';}
 result.mappings.unshift({origin:'authored',kind:'record',idealPath:selected.path+'/kind',nativePath:'/sql',outcome:result.residuals.length?'unknown':'exact'});
 if(hard||request.mode==='strict'&&result.residuals.length)result.status='blocked';else {result.target={format:'sqlserver-ddl',sql:nativeSql!};result.nativeSql=nativeSql!;}
 const output=copyJson(result);if(!check(output))throw new UmfError('RECORD_SQLSERVER_RESULT',JSON.stringify(check.errors));return output as unknown as RecordSqlServerProjection;
}
export function recoverRecordFromSqlServer(input:RecordSqlServerProjection,nativeText:string):Document {
 const receipt=copyJson(input) as unknown as RecordSqlServerProjection;
 if(!check(receipt)||receipt.status!=='projected'||!receipt.target)throw new UmfError('RECORD_SQLSERVER_RECEIPT','Expected complete projection receipt');
 const expected=projectRecordToSqlServer(receipt.author,receipt.request);
 const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key]!)).join(',')+'}':JSON.stringify(value);
 if(canonical(copyJson(receipt))!==canonical(copyJson(expected)))throw new UmfError('RECORD_SQLSERVER_RECEIPT','Receipt differs from recomputed projection');
 if(typeof nativeText!=='string'||receipt.nativeSql!==nativeText||receipt.target.sql!==nativeText)throw new UmfError('RECORD_SQLSERVER_STALE','Native target changed');
 return copyJson(receipt.source) as unknown as Document;
}
