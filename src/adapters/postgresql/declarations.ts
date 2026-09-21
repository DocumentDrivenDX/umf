import {getPostgresqlNode,inspectPostgresql,validatePostgresqlAst} from './index';
import {copyJson} from '../../model/json';
import {renderTree,nativePointer,treeChild,type NativeJson} from '../../model/native-json';
import {type Document,type Diagnostic,type Element,type ScalarType} from '../../model/types';
export interface PostgresqlDdlColumn {path:string;element:Element;typeResolution:'builtin-syntax'|'unresolved';nativeColumn:NativeJson;}
export interface PostgresqlDdlDeclaration {path:string;statementIndex:number;kind:'create-table'|'create-foreign-table'|'alter-table'|'create-composite';schemaContext:string|null;requiresCatalogExpansion:boolean;relation:NativeJson;columns:PostgresqlDdlColumn[];nativeStatement:NativeJson;}
export interface PostgresqlDdlDeclarations {status:'observed'|'blocked';complete:false;declarations:PostgresqlDdlDeclaration[];unhandled:{path:string;nativeStatement:NativeJson}[];diagnostics:Diagnostic[];}
const families:Record<string,ScalarType>={bool:'boolean',int2:'integer',int4:'integer',int8:'integer',numeric:'decimal',float4:'float',float8:'float',text:'string',varchar:'string',bpchar:'string',bytea:'binary',date:'date',time:'time',timetz:'time',timestamp:'timestamp',timestamptz:'timestamp'};
/** Declaration inventory, never an executed catalog or replay of DDL state changes. */
export function getPostgresqlDdlDeclarations(document:Document):PostgresqlDdlDeclarations{
 const checked=inspectPostgresql(document),result:PostgresqlDdlDeclarations={status:'blocked',complete:false,declarations:[],unhandled:[],diagnostics:checked.diagnostics.map(d=>({...d}))};
 if(!checked.valid)return result;
 const root=getPostgresqlNode(document,''),tree=JSON.parse(renderTree(root));
 if(checked.diagnostics.some(d=>['POSTGRESQL_VERSION','POSTGRESQL_REPRESENTATION'].includes(d.code)))return result;
 if(!validatePostgresqlAst(tree).valid){result.diagnostics.push({code:'POSTGRESQL_DDL_AST',path:'',severity:'error',message:'Known native AST fields are invalid'});return result;}
 const native=(path:string)=>{let value=root;for(const key of nativePointer(path))value=treeChild(value,key);return copyJson(value) as NativeJson;};
 const warn=(path:string,message:string)=>result.diagnostics.push({code:'POSTGRESQL_DDL_UNRESOLVED',path,severity:'warning',message});
 function column(c:any,path:string,targetName?:string):PostgresqlDdlColumn{
  const t=c.typeName,names=t?.names;let scalarType:ScalarType|undefined;
  // Only explicit/parser-normalized pg_catalog names establish a syntactic family.
  // Arbitrary unqualified names can be shadowed by search_path; no lexical guessing.
  const known=t&&Object.keys(t).every(k=>['names','typeOid','setof','pct_type','typmods','typemod','arrayBounds','location'].includes(k));
  if(known&&!t.setof&&!t.pct_type&&!t.typeOid&&!t.arrayBounds?.length&&Array.isArray(names)&&names.length===2&&names.every((n:any)=>n&&Object.keys(n).length===1&&n.String&&Object.keys(n.String).every((k:string)=>k==='sval'))&&names[0].String.sval==='pg_catalog'&&Object.hasOwn(families,names[1].String.sval))scalarType=families[names[1].String.sval];
  if(!scalarType)warn(path+'/typeName','Type remains unresolved, structured, array-valued or outside the known qualified builtin families');
  const name=c.colname??targetName;
  return {path,element:{id:path,...(typeof name==='string'?{name}:{}),...(scalarType?{scalarType}:{}),extensions:{}},typeResolution:scalarType?'builtin-syntax':'unresolved',nativeColumn:native(path)};
 }
 function visit(node:any,path:string,statementIndex:number,schemaContext:string|null){
  if(node.CreateSchemaStmt){const s=node.CreateSchemaStmt;(s.schemaElts??[]).forEach((n:any,i:number)=>visit(n,path+'/CreateSchemaStmt/schemaElts/'+i,statementIndex,s.schemaname??null));warn(path,'CREATE SCHEMA context retained; authorization and execution order are not resolved');return;}
  if(node.CompositeTypeStmt){
   const body=node.CompositeTypeStmt,basePath=path+'/CompositeTypeStmt';
   if(!body.typevar){result.unhandled.push({path,nativeStatement:native(path)});warn(path,'Composite declaration has no type identity');return;}
   const columns:PostgresqlDdlColumn[]=[];let expansion=false;
   for(const [i,entry] of (body.coldeflist??[]).entries()){
    if(entry.ColumnDef)columns.push(column(entry.ColumnDef,basePath+'/coldeflist/'+i+'/ColumnDef'));else expansion=true;
   }
   result.declarations.push({path:basePath,statementIndex,kind:'create-composite',schemaContext,requiresCatalogExpansion:expansion,relation:native(basePath+'/typevar'),columns,nativeStatement:native(basePath)});return;
  }
  const kind=node.CreateStmt?'create-table':node.CreateForeignTableStmt?'create-foreign-table':node.AlterTableStmt?'alter-table':undefined;
  if(!kind){result.unhandled.push({path,nativeStatement:native(path)});warn(path,'Statement is retained without declaration extraction or execution');return;}
  const key=kind==='create-table'?'CreateStmt':kind==='create-foreign-table'?'CreateForeignTableStmt':'AlterTableStmt',body=node[key],base=kind==='create-foreign-table'?body.base:body,basePath=path+'/'+key+(kind==='create-foreign-table'?'/base':'');
  if(!base?.relation){result.unhandled.push({path,nativeStatement:native(path)});warn(path,'Declaration has no relation observation');return;}
  const columns:PostgresqlDdlColumn[]=[];let expansion=!!(base.inhRelations?.length||base.ofTypename||base.partbound||kind==='alter-table');
  if(kind==='alter-table')for(const [i,cmd] of (base.cmds??[]).entries()){
   if(cmd.AlterTableCmd?.def?.ColumnDef)columns.push(column(cmd.AlterTableCmd.def.ColumnDef,basePath+'/cmds/'+i+'/AlterTableCmd/def/ColumnDef',cmd.AlterTableCmd.name));
  }else for(const [i,entry] of (base.tableElts??[]).entries()){
   if(entry.ColumnDef)columns.push(column(entry.ColumnDef,basePath+'/tableElts/'+i+'/ColumnDef'));
   else if(entry.TableLikeClause||!entry.Constraint)expansion=true;
  }
  if(expansion)warn(basePath,'Inheritance, LIKE, typed/partition tables or ALTER effects require catalog expansion; extracted columns are explicit syntax only');
  result.declarations.push({path:path+'/'+key,statementIndex,kind,schemaContext,requiresCatalogExpansion:expansion,relation:native(basePath+'/relation'),columns,nativeStatement:native(path+'/'+key)});
 }
 for(const [i,stmt] of (tree.stmts??[]).entries())if(stmt.stmt)visit(stmt.stmt,'/stmts/'+i+'/stmt',i,null);
 result.status='observed';return result;
}
