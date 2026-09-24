import {copyJson} from '../model/json';
import {readJsonValue} from '../model/serialization';
import {UmfError,type Document} from '../model/types';
import {exportSqlServerCatalog,inspectSqlServer} from '../adapters/sqlserver';
import type {ProjectionIssue} from './json-schema-protobuf';
export interface SqlServerDdlPolicy {aliases:'reject'|'base-type';physicalLayout:'default-rowstore';nativeExpressions:'verbatim';sourceState:'captured-only'|'allow-candidate';lossPolicy:'strict'|'allow-reported-loss';}
export interface SqlServerDdlStatement {sourcePath:string;kind:'schema'|'table'|'key'|'check'|'foreign-key'|'index'|'disable'|'description';sql:string;}
export interface SqlServerDdlProjection {status:'blocked'|'projected';source:Document;policy:SqlServerDdlPolicy;issues:ProjectionIssue[];statements:SqlServerDdlStatement[];nativeSource?:string;}
const types:Record<number,string>={104:'bit',48:'tinyint',52:'smallint',56:'int',127:'bigint',106:'decimal',108:'numeric',60:'money',122:'smallmoney',59:'real',62:'float',167:'varchar',175:'char',231:'nvarchar',239:'nchar',35:'text',99:'ntext',165:'varbinary',173:'binary',34:'image',189:'timestamp',40:'date',41:'time',42:'datetime2',43:'datetimeoffset',58:'smalldatetime',61:'datetime',36:'uniqueidentifier',98:'sql_variant',241:'xml'};
const q=(s:unknown)=>{if(typeof s!=='string'||!s||s.length>128||s.includes('\0'))throw new UmfError('SQLSERVER_DDL_IDENTIFIER','Expected a nonempty SQL Server identifier of at most 128 UTF-16 units');return '['+s.replace(/]/g,']]')+']';};
const literal=(s:string)=>"N'"+s.replace(/'/g,"''")+"'";
/** Reviewable lowering to new ordinary tables. Never executes source expressions or generated SQL. */
export function projectSqlServerToDdl(input:Document,options:SqlServerDdlPolicy):SqlServerDdlProjection{
 const source=copyJson(input) as Document,policy=copyJson(options) as unknown as SqlServerDdlPolicy;
 if(!policy||!['reject','base-type'].includes(policy.aliases)||policy.physicalLayout!=='default-rowstore'||policy.nativeExpressions!=='verbatim'||!['captured-only','allow-candidate'].includes(policy.sourceState)||!['strict','allow-reported-loss'].includes(policy.lossPolicy)||Object.keys(policy).some(k=>!['aliases','physicalLayout','nativeExpressions','sourceState','lossPolicy'].includes(k)))throw new UmfError('SQLSERVER_DDL_POLICY','Explicit alias, layout, expression, source-state and loss policies required');
 const checked=inspectSqlServer(source);if(!checked.valid)throw new UmfError('SQLSERVER_DDL_SOURCE','Invalid source capture');
 const result:SqlServerDdlProjection={status:'blocked',source,policy,issues:[],statements:[]},statements:SqlServerDdlStatement[]=[],deferred:SqlServerDdlStatement[]=[];let fatal=false;
 const issue=(path:string,code:string,detail:string,classification:ProjectionIssue['classification']='not-enforced')=>result.issues.push({path,code,classification,detail,retainedInSource:true});
 const fail=(path:string,detail:string)=>{fatal=true;issue(path,'SQLSERVER_DDL_UNSUPPORTED',detail,'unsupported');};
 for(const d of checked.diagnostics){issue(d.path,d.code,d.message);if(['SQLSERVER_VERSION','SQLSERVER_ENCODING'].includes(d.code)||d.code==='SQLSERVER_MODIFIED'&&policy.sourceState==='captured-only')fatal=true;}
 if(fatal)return result;
 // Export checks core/native consistency. Decode conservatively: no rounded native numeric metadata.
 const native=readJsonValue(exportSqlServerCatalog(source),'json') as Record<string,any>;
 const add=(sourcePath:string,kind:SqlServerDdlStatement['kind'],sql:string,later=false)=>(later?deferred:statements).push({sourcePath,kind,sql});
 issue('','CAPTURE_LOWERING','Captured observations do not describe all server semantics: security, triggers, temporal/memory-optimized/storage features, column persistence/sparse/encryption/replication flags, bound objects and dependencies are not reconstructed. Target is new ordinary tables on default storage.');
 issue('','NATIVE_EXPRESSIONS','Default, computed, check and filter expressions are copied verbatim for review; their dependencies, session environment and execution safety are not established. This API does not execute SQL.','representation-change');
 const known=(value:Record<string,any>,keys:string[],path:string)=>{for(const key of Object.keys(value))if(!keys.includes(key))issue(path+'/'+key.replace(/~/g,'~0').replace(/\//g,'~1'),'UNKNOWN_NATIVE_METADATA','Uninterpreted native metadata remains in source');};
 known(native,['profile','state','serverVersion','query','tables'],'');
 const ordered=(columns:any[],key:string,path:string)=>{const sorted=[...columns].sort((a,b)=>a[key]-b[key]);if(!sorted.length||sorted.some((c,i)=>c[key]!==i+1))fail(path,'Missing or noncontiguous positive column ordinals');return sorted;};
 const tableKey=(schema:string,name:string)=>JSON.stringify([schema,name]);
 const tables=new Map<string,any>(native.tables.map((t:any)=>[tableKey(t.schema,t.name),t]));
 const schemas=new Set<string>();
 for(const [ti,t] of native.tables.entries()){
  const path='/tables/'+ti,table=q(t.schema)+'.'+q(t.name);
  if(!schemas.has(t.schema)){schemas.add(t.schema);add(path,'schema','IF SCHEMA_ID('+literal(t.schema)+') IS NULL EXEC('+literal('CREATE SCHEMA '+q(t.schema))+');');}
  known(t,['schema','name','columns','keys','checks','foreign_keys','indexes'],path);
  const columns:string[]=[];
  for(const [ci,c] of t.columns.entries()){
   const cp=path+'/columns/'+ci;
   known(c,['name','column_id','system_type_id','user_type_id','type_schema','type_name','base_type_name','is_user_defined','is_assembly_type','max_length','precision','scale','is_nullable','is_identity','is_computed','collation_name','default_definition','computed_definition','identity_seed','identity_increment','description'],cp);
   if(c.is_computed){if(!c.computed_definition){fail(cp,'Computed definition unavailable');continue;}columns.push(q(c.name)+' AS '+c.computed_definition);issue(cp,'COMPUTED_PERSISTENCE_UNAVAILABLE','Computed persistence, dependency definitions and SET environment were not captured; emitted as non-persisted');continue;}
   if(c.is_assembly_type||types[c.system_type_id]!==c.base_type_name){fail(cp,'Unknown/CLR native type identity');continue;}
   if(c.is_user_defined||c.type_name!==c.base_type_name||c.type_schema!=='sys'){
    if(policy.aliases==='reject'){fail(cp,'Alias type declarations are not present in this capture');continue;}
    issue(cp,'ALIAS_TO_BASE_TYPE','Explicit policy replaces the declared alias with its captured base type; alias identity, bound rules/defaults remain source-owned','representation-change');
   }
   let type=types[c.system_type_id]!;
   if(['varchar','nvarchar','char','nchar','binary','varbinary'].includes(type)){
    const length=c.max_length/(type.startsWith('n')?2:1),max=c.max_length===-1&&['varchar','nvarchar','varbinary'].includes(type);
    if(!max&&(!Number.isInteger(length)||length<1||length>(type.startsWith('n')?4000:8000))){fail(cp,'Invalid native byte length');continue;}type+='('+(max?'max':length)+')';
   }else if(['decimal','numeric'].includes(type)){if(c.precision<1||c.precision>38||c.scale>c.precision){fail(cp,'Invalid decimal precision/scale');continue;}type+='('+c.precision+','+c.scale+')';}
   else if(['time','datetime2','datetimeoffset'].includes(type)){if(c.scale>7){fail(cp,'Invalid temporal scale');continue;}type+='('+c.scale+')';}
   else if(type==='float'){if(c.precision<1||c.precision>53){fail(cp,'Invalid float precision');continue;}type+='('+c.precision+')';}
   else if(type==='xml')issue(cp,'XML_COLLECTION_UNAVAILABLE','Typed XML schema collection/document constraints are not captured; emitted untyped XML');
   let definition=q(c.name)+' '+type;
   if(c.collation_name!==null){if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(c.collation_name)){fail(cp,'Unsupported collation token');continue;}definition+=' COLLATE '+c.collation_name;}
   if(c.is_identity){if(!/^-?[0-9]+$/.test(c.identity_seed??'')||!/^-?[0-9]+$/.test(c.identity_increment??'')){fail(cp,'Exact integer identity seed/increment required');continue;}definition+=' IDENTITY('+c.identity_seed+','+c.identity_increment+')';issue(cp,'IDENTITY_STATE_UNAVAILABLE','Identity seed/increment retained; current counter and replication flag are not captured');}
   definition+=c.is_nullable?' NULL':' NOT NULL';
   if(c.default_definition!==null){definition+=' DEFAULT '+c.default_definition;issue(cp,'DEFAULT_IDENTITY_UNAVAILABLE','Default expression retained; constraint name or bound-default identity is not captured');}
   columns.push(definition);
  }
  if(!columns.length)fail(path,'Cannot emit an empty table');
  add(path,'table','CREATE TABLE '+table+' (\n  '+columns.join(',\n  ')+'\n);');
  for(const [ci,c] of t.columns.entries())if(c.description!==null)add(path+'/columns/'+ci+'/description','description',"EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value="+literal(c.description)+", @level0type=N'SCHEMA', @level0name="+literal(t.schema)+", @level1type=N'TABLE', @level1name="+literal(t.name)+", @level2type=N'COLUMN', @level2name="+literal(c.name)+';');
  for(const section of ['keys','checks','foreign_keys','indexes'])if(!Object.hasOwn(t,section))issue(path+'/'+section,'CATALOG_SECTION_UNAVAILABLE','Section not captured; generated SQL cannot assert absence of '+section);
 }
 // All tables first; then keys/indexes; then relational constraints, so cycles are representable.
 for(const [ti,t] of native.tables.entries()){
  const path='/tables/'+ti,table=q(t.schema)+'.'+q(t.name),column=(id:number,name:string|null,p:string)=>{if(!t.columns.some((c:any)=>c.column_id===id&&c.name===name)){fail(p,'Column name/ID does not resolve in the table');return '[unresolved]';}return q(name);};
  for(const [ki,k] of (t.keys??[]).entries()){
   const kp=path+'/keys/'+ki;known(k,['name','kind','is_system_named','index_type','is_disabled','ignore_dup_key','columns'],kp);
   if(!['PK','UQ'].includes(k.kind)||!['CLUSTERED','NONCLUSTERED'].includes(k.index_type)||k.is_disabled){fail(kp,'Unsupported key kind, index type or disabled key dependency');continue;}
   if(k.is_system_named)issue(kp,'SYSTEM_NAME_BECOMES_EXPLICIT','Constraint name retained as explicit, not system-generated','representation-change');
   const cols=ordered(k.columns,'key_ordinal',kp).map(c=>{known(c,['key_ordinal','column_id','name','is_descending_key'],kp+'/columns/'+k.columns.indexOf(c));return column(c.column_id,c.name,kp)+(c.is_descending_key?' DESC':' ASC');});
   add(kp,'key','ALTER TABLE '+table+' ADD CONSTRAINT '+q(k.name)+' '+(k.kind==='PK'?'PRIMARY KEY':'UNIQUE')+' '+k.index_type+' ('+cols.join(', ')+') WITH (IGNORE_DUP_KEY='+(k.ignore_dup_key?'ON':'OFF')+');');
  }
  for(const [ii,i] of (t.indexes??[]).entries()){
   const ip=path+'/indexes/'+ii;known(i,['index_id','name','type','type_desc','is_unique','is_primary_key','is_unique_constraint','is_disabled','is_hypothetical','ignore_dup_key','fill_factor','is_padded','allow_row_locks','allow_page_locks','has_filter','filter_definition','compression_delay','optimize_for_sequential_key','data_space_id','data_space_name','data_space_type','columns'],ip);
   for(const [ci,c] of i.columns.entries())known(c,['index_column_id','column_id','name','key_ordinal','partition_ordinal','is_descending_key','is_included_column','column_store_order_ordinal'],ip+'/columns/'+ci);
   if(i.data_space_type==='PARTITION_SCHEME'||i.columns.some((c:any)=>c.partition_ordinal>0))issue(ip,'PARTITION_LAYOUT_LOWERED','Partition scheme/function/boundaries not reconstructed; emitted on default storage','representation-change');
   issue(ip,'INDEX_PHYSICAL_DETAILS','Data-space placement, index IDs, compression/rowgroup/storage details and omitted physical options are not reconstructed');
   if(i.is_primary_key||i.is_unique_constraint){if(!(t.keys??[]).some((k:any)=>k.name===i.name))fail(ip,'Constraint-owned index has no captured key');continue;}
   if(i.type===0)continue;
   if(i.is_hypothetical||[5,6].includes(i.type)){issue(ip,'INDEX_LAYOUT_OMITTED','Explicit default-rowstore policy omits hypothetical/columnstore access structures','representation-change');continue;}
   if(![1,2].includes(i.type)||i.type_desc!==(i.type===1?'CLUSTERED':'NONCLUSTERED')){fail(ip,'Specialized or unknown index type cannot be reconstructed');continue;}
   if(i.has_filter&&i.filter_definition===null){fail(ip,'Filtered predicate unavailable');continue;}
   const keys=ordered(i.columns.filter((c:any)=>c.key_ordinal>0),'key_ordinal',ip).map(c=>column(c.column_id,c.name,ip)+(c.is_descending_key?' DESC':' ASC'));
   const included=i.columns.filter((c:any)=>c.is_included_column).map((c:any)=>column(c.column_id,c.name,ip));
   const opts=['IGNORE_DUP_KEY='+(i.ignore_dup_key?'ON':'OFF'),...(i.fill_factor>0?['FILLFACTOR='+i.fill_factor]:[]),'PAD_INDEX='+(i.is_padded?'ON':'OFF'),'ALLOW_ROW_LOCKS='+(i.allow_row_locks?'ON':'OFF'),'ALLOW_PAGE_LOCKS='+(i.allow_page_locks?'ON':'OFF'),'OPTIMIZE_FOR_SEQUENTIAL_KEY='+(i.optimize_for_sequential_key?'ON':'OFF')];
   if(i.fill_factor===0)issue(ip,'FILLFACTOR_DEFAULT','Native zero denotes the default; omit the DDL option and use the target server default');
   add(ip,'index','CREATE '+(i.is_unique?'UNIQUE ':'')+i.type_desc+' INDEX '+q(i.name)+' ON '+table+' ('+keys.join(', ')+')'+(included.length?' INCLUDE ('+included.join(', ')+')':'')+(i.has_filter?' WHERE '+i.filter_definition:'')+' WITH ('+opts.join(', ')+');');
   if(i.is_disabled){if(i.type===1){fail(ip,'Disabled clustered index affects table accessibility and dependent indexes');continue;}add(ip,'disable','ALTER INDEX '+q(i.name)+' ON '+table+' DISABLE;',true);}
  }
  for(const [ci,c] of (t.checks??[]).entries()){
   const cp=path+'/checks/'+ci;known(c,['name','is_system_named','parent_column_id','definition','is_disabled','is_not_trusted','is_not_for_replication','uses_database_collation'],cp);
   if(!c.definition){fail(cp,'Check definition unavailable');continue;}
   if(c.is_system_named)issue(cp,'SYSTEM_NAME_BECOMES_EXPLICIT','Check name retained as explicit, not system-generated','representation-change');
   if(c.parent_column_id)issue(cp,'CHECK_SCOPE_LOWERED','Column-scoped check emitted as table-scoped check','representation-change');
   add(cp,'check','ALTER TABLE '+table+' WITH '+(c.is_not_trusted?'NOCHECK':'CHECK')+' ADD CONSTRAINT '+q(c.name)+' CHECK '+(c.is_not_for_replication?'NOT FOR REPLICATION ':'')+'('+c.definition+');',true);
   if(c.is_disabled)add(cp,'disable','ALTER TABLE '+table+' NOCHECK CONSTRAINT '+q(c.name)+';',true);
  }
  for(const [fi,f] of (t.foreign_keys??[]).entries()){
   const fp=path+'/foreign_keys/'+fi;known(f,['name','is_system_named','is_disabled','is_not_trusted','is_not_for_replication','delete_action','update_action','referenced_schema','referenced_table','columns'],fp);
   const target=tables.get(tableKey(f.referenced_schema,f.referenced_table));
   if(!target||![f.delete_action,f.update_action].every(a=>['NO_ACTION','CASCADE','SET_NULL','SET_DEFAULT'].includes(a))){fail(fp,'Referenced table or native action is unresolved');continue;}
   const cols=ordered(f.columns,'ordinal',fp),from=cols.map(c=>column(c.column_id,c.column_name,fp)),to=cols.map(c=>{known(c,['ordinal','column_id','column_name','referenced_column_id','referenced_column_name'],fp+'/columns/'+f.columns.indexOf(c));if(!target.columns.some((tc:any)=>tc.column_id===c.referenced_column_id&&tc.name===c.referenced_column_name))fail(fp,'Referenced column name/ID unresolved');return q(c.referenced_column_name);});
   if(f.is_system_named)issue(fp,'SYSTEM_NAME_BECOMES_EXPLICIT','Foreign key name retained as explicit, not system-generated','representation-change');
   add(fp,'foreign-key','ALTER TABLE '+table+' WITH '+(f.is_not_trusted?'NOCHECK':'CHECK')+' ADD CONSTRAINT '+q(f.name)+' FOREIGN KEY ('+from.join(', ')+') REFERENCES '+q(f.referenced_schema)+'.'+q(f.referenced_table)+' ('+to.join(', ')+') ON DELETE '+f.delete_action.replace(/_/g,' ')+' ON UPDATE '+f.update_action.replace(/_/g,' ')+(f.is_not_for_replication?' NOT FOR REPLICATION':'')+';',true);
   if(f.is_disabled)add(fp,'disable','ALTER TABLE '+table+' NOCHECK CONSTRAINT '+q(f.name)+';',true);
  }
 }
 if(fatal||policy.lossPolicy==='strict'&&result.issues.length)return result;
 result.statements=[...statements,...deferred];result.nativeSource='SET ANSI_NULLS ON;\nSET QUOTED_IDENTIFIER ON;\nSET ANSI_PADDING ON;\nSET ANSI_WARNINGS ON;\nSET ARITHABORT ON;\nSET CONCAT_NULL_YIELDS_NULL ON;\nSET NUMERIC_ROUNDABORT OFF;\n'+result.statements.map(s=>s.sql).join('\n')+'\n';result.status='projected';return result;
}
