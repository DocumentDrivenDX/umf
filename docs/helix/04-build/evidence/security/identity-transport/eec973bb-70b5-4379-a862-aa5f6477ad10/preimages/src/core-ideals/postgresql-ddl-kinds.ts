import {copyJson} from '../model/json';
import {UmfError,type Document,type Json,type Diagnostic,type Element} from '../model/types';
import {importPostgresqlSql,exportPostgresqlSql,getPostgresqlSource,getPostgresqlNode,type PostgresqlBackend} from '../adapters/postgresql';
import {getPostgresqlDdlDeclarations} from '../adapters/postgresql/declarations';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import schema from '../../spec/core/postgresql-ddl-kinds.schema.json';
export {default as postgresqlDdlKindsSchema} from '../../spec/core/postgresql-ddl-kinds.schema.json';
export interface PostgresqlDdlKindRequest {module:string;recordId:string;declaration:string;mode:'strict'|'report'}
const binding={id:'umf.postgresql.ddl.record',version:'1.0.0',nativeVersion:'17.4',subset:'Explicit CREATE TABLE declaration only; no catalog expansion or statement replay'} as const;
const compositeBinding={id:'umf.postgresql.ddl.composite',version:'1.0.0',nativeVersion:'17.4',subset:'Explicit CREATE TYPE AS composite attributes only; no type resolution or statement replay'} as const;
export interface PostgresqlDdlKinds {
 operation:'classify-postgresql-ddl-record';version:'1.0.0';scope:'declared-only';status:'classified'|'blocked';source:Document;target?:Document;request:PostgresqlDdlKindRequest;binding:typeof binding|typeof compositeBinding;namespaceResolution:'explicit'|'create-schema-context'|'unresolved';
 mappings:{origin:'classified';kind:'field'|'record';idealPath:string;nativePath:string;nativeFragment:Json;basis:'checked-raw-column-declaration'|'checked-raw-table-declaration'|'checked-raw-composite-declaration';outcome:'exact'|'unknown'}[];
 residuals:{path:string;value:Json;reason:string;recovery:'Source and native fragments retained; resolve conflict then recompute whole record classification'}[];diagnostics:Diagnostic[];
}
const validator=createValidator();validator.addSchema(legacy);validator.addSchema(fields);const check=validator.compile(schema),checkRequest=validator.compile(schema.properties.request);
const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key]!)).join(',')+'}':JSON.stringify(value);
export async function classifyPostgresqlDdlRecord(input:Document,options:PostgresqlDdlKindRequest,backend:PostgresqlBackend):Promise<PostgresqlDdlKinds>{
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as PostgresqlDdlKindRequest;
 if(!checkRequest(request))throw new UmfError('POSTGRESQL_DDL_KIND_REQUEST',JSON.stringify(checkRequest.errors));
 if(!validateDocument(source).valid||source.umf!=='0.2.0')throw new UmfError('POSTGRESQL_DDL_KIND_VERSION','Explicitly migrated valid envelope required');
 await exportPostgresqlSql(source,backend);
 const original=await importPostgresqlSql(getPostgresqlSource(source),backend,{id:'archive-check'});
 if(canonical(copyJson(getPostgresqlNode(original,'')))!==canonical(copyJson(getPostgresqlNode(source,''))))throw new UmfError('POSTGRESQL_DDL_KIND_ARCHIVE','Source archive differs from edited AST; reimport reviewed native text before classification');
 const inventory=getPostgresqlDdlDeclarations(source),declaration=inventory.declarations.find(d=>d.path===request.declaration);
 if(inventory.status!=='observed'||!declaration)throw new UmfError('POSTGRESQL_DDL_KIND_DECLARATION','Selected native declaration is absent or unavailable');
 const result:PostgresqlDdlKinds={operation:'classify-postgresql-ddl-record',version:'1.0.0',scope:'declared-only',status:'classified',source,request,binding:declaration.kind==='create-composite'?compositeBinding:binding,namespaceResolution:'unresolved',mappings:[],residuals:[],diagnostics:[{code:'POSTGRESQL_DECLARATION_ONLY',path:declaration.path,message:'Declared structure only; no catalog resolution, execution or later-statement replay',severity:'warning'}]};
 const loss=(code:string,path:string,value:unknown,reason:string,fatal=true)=>{if(fatal||request.mode==='strict')result.status='blocked';result.residuals.push({path,value:copyJson(value),reason,recovery:'Source and native fragments retained; resolve conflict then recompute whole record classification'});result.diagnostics.push({code,path,message:reason,severity:fatal||request.mode==='strict'?'error':'warning'});};
 if(source.modules.some(m=>m.id===request.module))loss('POSTGRESQL_DDL_KIND_COLLISION','/modules',request.module,'Output module already exists; existing meaning cannot be overwritten');
 if(!['create-table','create-composite'].includes(declaration.kind)||declaration.requiresCatalogExpansion)loss('POSTGRESQL_DDL_KIND_EXPANSION',declaration.path,declaration.nativeStatement,'Only explicit table/composite member lists without catalog expansion are covered');
 const relation=declaration.relation;
 if(relation.kind!=='object'||relation.members.relname?.kind!=='string')throw new UmfError('POSTGRESQL_DDL_KIND_RELATION','Missing native relation name');
 const explicit=relation.members.schemaname?.kind==='string'?relation.members.schemaname.value:undefined;
 const namespace=explicit??declaration.schemaContext??'';
 result.namespaceResolution=explicit!==undefined?'explicit':declaration.schemaContext!==null?'create-schema-context':'unresolved';
 if(result.namespaceResolution==='unresolved')loss('POSTGRESQL_DDL_NAMESPACE',declaration.path+'/relation',relation,'Unqualified relation requires search_path; empty core namespace makes no default-schema assertion',false);
 const names=new Set<string>(),elements:Element[]=[],base='/modules/'+source.modules.length+'/elements';
 for(const [index,column] of declaration.columns.entries()){
  const name=column.element.name;if(!name||names.has(name))loss('POSTGRESQL_DDL_MEMBER_NAME',column.path,column.nativeColumn,'Declared column names must be nonempty and unique');if(name)names.add(name);
  elements.push({...copyJson(column.element) as unknown as Element,id:request.recordId+'/field/'+index,kind:'field'});
  result.mappings.push({origin:'classified',kind:'field',idealPath:base+'/'+(index+1)+'/kind',nativePath:column.path,nativeFragment:copyJson(column.nativeColumn),basis:'checked-raw-column-declaration',outcome:'exact'});
 }
 result.mappings.unshift({origin:'classified',kind:'record',idealPath:base+'/0/kind',nativePath:declaration.path,nativeFragment:copyJson(declaration.nativeStatement),basis:declaration.kind==='create-composite'?'checked-raw-composite-declaration':'checked-raw-table-declaration',outcome:result.residuals.length?'unknown':'exact'});
 if(result.status==='classified'){
  const target=copyJson(source) as unknown as Document;target.modules.push({id:request.module,namespace,elements:[{id:request.recordId,name:relation.members.relname.value,kind:'record',extensions:{},references:elements.map(e=>({role:'member',module:request.module,element:e.id}))},...elements]});
  if(!validateDocument(target).valid)throw new UmfError('POSTGRESQL_DDL_KIND_TARGET','Invalid derived core record');result.target=target;
 }
 const output=copyJson(result);if(!check(output))throw new UmfError('POSTGRESQL_DDL_KIND_RESULT',JSON.stringify(check.errors));return output as unknown as PostgresqlDdlKinds;
}
export async function recoverPostgresqlDdlKinds(input:PostgresqlDdlKinds,current:Document,backend:PostgresqlBackend):Promise<string>{
 const receipt=copyJson(input) as unknown as PostgresqlDdlKinds;if(!check(receipt)||receipt.status!=='classified')throw new UmfError('POSTGRESQL_DDL_KIND_RECEIPT','Expected complete classification receipt');
 const expected=await classifyPostgresqlDdlRecord(receipt.source,receipt.request,backend);
 if(canonical(copyJson(expected))!==canonical(copyJson(receipt)))throw new UmfError('POSTGRESQL_DDL_KIND_RECEIPT','Receipt differs from checked native source');
 if(canonical(copyJson(current))!==canonical(copyJson(receipt.target)))throw new UmfError('POSTGRESQL_DDL_KIND_STALE','Current model changed');return getPostgresqlSource(receipt.source);
}
