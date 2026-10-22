import {copyJson} from '../model/json';
import {UmfError,type Document,type Json,type Diagnostic,type Cardinality,type ExtensionPackage} from '../model/types';
import {parseNativeJson,renderTree,type NativeJson} from '../model/native-json';
import {exportSqlServerCatalog,getSqlServerColumnMetadata,getSqlServerConstraintMetadata} from '../adapters/sqlserver';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';
import fields from '../../spec/core/field-document.schema.json';
import availability from '../../spec/core/nullability-document.schema.json';
import core from '../../spec/core/cardinality-document.schema.json';
import nativeSchema from '../../spec/core/native-json.schema.json';
import schema from '../../spec/core/sqlserver-cardinality-classification.schema.json';
import manifest from '../../spec/extensions/sqlserver-cardinality/package.json';
export const SQLSERVER_CARDINALITY_EXTENSION='umf.sqlserver.cardinality';
export const sqlserverCardinalityPackage=manifest as unknown as ExtensionPackage;
export {default as sqlserverCardinalityClassificationSchema} from '../../spec/core/sqlserver-cardinality-classification.schema.json';
export interface SqlServerCardinalityRequest {column:string;nativeSource:string;mode:'strict'|'report';profile:'native-scalar'|'json-array'|'json-object'|'unresolved';identity:{module:string;element:string};constraint:string|null;}
const binding=schema.properties.binding.const;
const basis='Explicit representation selection and pinned catalog constraint profile; physical column and logical Field remain distinct' as const;
const recovery='Retain original native archive and author assertions; classification does not replace native meaning' as const;
export interface SqlServerCardinalityClassification {
 operation:'classify-sqlserver-cardinality';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:SqlServerCardinalityRequest;binding:typeof binding;
 mapping:{origin:'classified';idealPath:string;nativePath:string;nativeFragment:NativeJson;cardinality:Cardinality;interpretation:'declared'|'unknown'|'unsupported';outcome:'exact'|'approximated'|'unknown'|'not-expressible';basis:typeof basis};
 residuals:{path:string;value:Json;reason:string;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
const validator=createValidator();for(const s of [legacy,fields,availability,core,nativeSchema])validator.addSchema(s);
const check=validator.compile(schema),checkRequest=validator.compile(schema.properties.request);
const canonical=(v:Json):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k]!)).join(',')+'}':JSON.stringify(v);
const str=(n:NativeJson|undefined)=>n?.kind==='string'?n.value:undefined;
const falseFlag=(n:NativeJson|undefined)=>n?.kind==='boolean'&&!n.value;
/** Create a separately identified logical Field; never relabel a native text column. */
export function classifySqlServerCardinality(input:Document,options:SqlServerCardinalityRequest):SqlServerCardinalityClassification {
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as SqlServerCardinalityRequest;
 if(!checkRequest(request))throw new UmfError('SQLSERVER_CARDINALITY_REQUEST',JSON.stringify(checkRequest.errors));
 if(source.umf!=='0.4.0'||!validateDocument(source).valid)throw new UmfError('SQLSERVER_CARDINALITY_SOURCE','Valid core 0.4.0 required; migrate explicitly');
 const root=parseNativeJson(request.nativeSource);
 if(renderTree(root)+'\n'!==exportSqlServerCatalog(source))throw new UmfError('SQLSERVER_CARDINALITY_ARCHIVE','Native text differs from retained capture');
 if(root.kind!=='object'||str(root.members.serverVersion)!=='16.0.4295.3'||str(root.members.profile)!=='sqlserver-catalog-v3'||str(root.members.state)!=='captured')throw new UmfError('SQLSERVER_CARDINALITY_PROFILE','Pinned captured catalog-v3 required');
 const column=getSqlServerColumnMetadata(source).find(c=>c.path===request.column);
 if(!column||column.nativeColumn.kind!=='object')throw new UmfError('SQLSERVER_CARDINALITY_COLUMN','Native column not found');
 const native=column.nativeColumn.members,existing=source.modules.findIndex(m=>m.id===request.identity.module),mi=existing<0?source.modules.length:existing;
 const module=source.modules[existing],ei=module?module.elements.length:0,path=`/modules/${mi}/elements/${ei}/cardinality`;
 const r:SqlServerCardinalityClassification={operation:'classify-sqlserver-cardinality',version:'1.0.0',status:'classified',source,request,binding,mapping:{origin:'classified',idealPath:path,nativePath:column.path,nativeFragment:column.nativeColumn,cardinality:'unspecified',interpretation:'unknown',outcome:'unknown',basis},residuals:[],diagnostics:[]};
 const loss=(p:string,value:unknown,reason:string)=>r.residuals.push({path:p,value:copyJson(value),reason,recovery});
 if(request.profile==='native-scalar'&&request.constraint===null&&column.element.scalarType!==undefined){r.mapping.cardinality='one';r.mapping.interpretation='declared';r.mapping.outcome='exact';}
 else if(['json-array','json-object'].includes(request.profile)){
  const table=getSqlServerConstraintMetadata(source).tables.find(t=>t.table.schema===column.table.schema&&t.table.name===column.table.name);
  const matches=table?.checks.filter(c=>c.kind==='object'&&str(c.members.name)===request.constraint)??[];
  const constraint=matches.length===1&&matches[0]?.kind==='object'?matches[0].members:undefined;
  const expected='(isjson(['+column.element.name!.replaceAll(']',']]')+'],'+(request.profile==='json-array'?'ARRAY':'OBJECT')+')=(1))';
  const parent=constraint?.parent_column_id;
  const associated=parent?.kind==='number'&&(parent.value==='0'||native.column_id?.kind==='number'&&parent.value===native.column_id.value);
  const recognized=str(native.type_schema)==='sys'&&str(native.type_name)==='nvarchar'&&str(native.base_type_name)==='nvarchar'&&falseFlag(native.is_computed)&&falseFlag(native.is_assembly_type)&&falseFlag(native.is_user_defined)&&associated&&constraint&&str(constraint.definition)===expected&&falseFlag(constraint.is_disabled)&&falseFlag(constraint.is_not_trusted)&&falseFlag(constraint.is_not_for_replication);
  if(recognized){
   r.mapping.cardinality=request.profile==='json-array'?'array':'map';r.mapping.interpretation='declared';r.mapping.outcome=request.profile==='json-array'?'exact':'approximated';
   if(request.profile==='json-object')loss(column.path,constraint,'ISJSON OBJECT permits duplicate keys; the ideal exact-string-key map cannot preserve duplicate members without a residual');
  }else loss(column.path,column.nativeColumn,'Selected JSON representation requires the exact pinned column/constraint profile with enabled, trusted, non-replication-exempt enforcement; arbitrary expressions and unknown state remain unresolved');
 }else loss(column.path,column.nativeColumn,'Selected representation is unresolved or does not establish a supported native scalar');
 let conflict:string|undefined;
 if(request.identity.module==='sqlserver.columns')conflict='Logical representation cannot replace or extend the native column module';
 if(module?.elements.some(e=>e.id===request.identity.element))conflict='Logical Field identity already exists; authored or classified meaning cannot be overwritten';
 if(source.vocabularies[SQLSERVER_CARDINALITY_EXTENSION]&&source.vocabularies[SQLSERVER_CARDINALITY_EXTENSION]!.version!=='1.0.0')conflict='Incompatible binding vocabulary version';
 if(conflict){loss(path,null,conflict);r.mapping.outcome='unknown';}
 if(conflict||request.mode==='strict'&&r.residuals.length)r.status='blocked';
 else{
  const target=copyJson(source) as unknown as Document;
  if(existing<0)target.modules.push({id:request.identity.module,namespace:'',elements:[]});
  target.vocabularies[SQLSERVER_CARDINALITY_EXTENSION]??={version:'1.0.0'};
  target.modules[mi]!.elements.push({id:request.identity.element,kind:'field',name:column.element.name!,cardinality:r.mapping.cardinality,...(request.profile==='native-scalar'&&r.mapping.cardinality==='one'?{scalarType:column.element.scalarType!}:{}),extensions:{[SQLSERVER_CARDINALITY_EXTENSION]:{origin:'classified',physicalColumn:request.column,binding:{id:binding.id,version:binding.version},profile:request.profile,interpretation:r.mapping.interpretation,nativePath:column.path,basis}}});
  if(!validateDocument(target).valid)throw new UmfError('SQLSERVER_CARDINALITY_TARGET','Invalid logical Field target');
  exportSqlServerCatalog(target);r.target=target;
 }
 r.diagnostics=r.residuals.map(v=>({code:'SQLSERVER_CARDINALITY_RESIDUAL',path:v.path,message:v.reason,severity:r.status==='blocked'?'error':'warning'}));
 const output=copyJson(r);if(!check(output))throw new UmfError('SQLSERVER_CARDINALITY_RESULT',JSON.stringify(check.errors));return output as unknown as SqlServerCardinalityClassification;
}
export function verifySqlServerCardinalityClassification(input:SqlServerCardinalityClassification,current:Document){
 const r=copyJson(input) as unknown as SqlServerCardinalityClassification;
 if(!check(r)||r.status!=='classified')throw new UmfError('SQLSERVER_CARDINALITY_RECEIPT','Complete classified receipt required');
 if(canonical(copyJson(r))!==canonical(copyJson(classifySqlServerCardinality(r.source,r.request))))throw new UmfError('SQLSERVER_CARDINALITY_RECEIPT','Receipt differs from retained source and request');
 if(canonical(copyJson(current))!==canonical(copyJson(r.target)))throw new UmfError('SQLSERVER_CARDINALITY_STALE','Target changed');return r;
}
export function recoverSqlServerCardinalitySource(input:SqlServerCardinalityClassification,current:Document){return verifySqlServerCardinalityClassification(input,current).request.nativeSource;}
