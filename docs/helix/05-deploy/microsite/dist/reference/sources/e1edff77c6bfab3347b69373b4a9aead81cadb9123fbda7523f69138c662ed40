import manifest from '../../../spec/extensions/sqlserver/package.json';
import captureSchema from '../../../spec/extensions/sqlserver/capture.schema.json';
import {Registry} from '../../registry/registry';
import {validateDocument} from '../../validation/document';
import {createValidator} from '../../validation/schema';
import {copyJson} from '../../model/json';
import {catalogIntegerErrors} from '../../validation/catalog-integers';
import {parseNativeJson,renderTree,nativePointer,treeChild,type NativeJson} from '../../model/native-json';
import {UmfError,type Document,type Json,type Element,type Diagnostic,type ExtensionPackage,type ScalarType} from '../../model/types';
export const SQLSERVER_EXTENSION='umf.sqlserver';
export const sqlserverPackage=manifest as unknown as ExtensionPackage;
type Payload={profile:'sqlserver-catalog-v1';root:NativeJson};
export interface SqlServerColumnMetadata {path:string;table:{schema:string;name:string};element:Element;nativeColumn:NativeJson;}
const check=createValidator().compile<any>(captureSchema);
const types:Record<string,[string,ScalarType]>={'104':['bit','boolean'],'48':['tinyint','integer'],'52':['smallint','integer'],'56':['int','integer'],'127':['bigint','integer'],'106':['decimal','decimal'],'108':['numeric','decimal'],'60':['money','decimal'],'122':['smallmoney','decimal'],'59':['real','float'],'62':['float','float'],'167':['varchar','string'],'175':['char','string'],'231':['nvarchar','string'],'239':['nchar','string'],'35':['text','string'],'99':['ntext','string'],'165':['varbinary','binary'],'173':['binary','binary'],'34':['image','binary'],'189':['timestamp','binary'],'40':['date','date'],'41':['time','time'],'42':['datetime2','timestamp'],'43':['datetimeoffset','timestamp'],'58':['smalldatetime','timestamp'],'61':['datetime','timestamp']};
const str=(n:NativeJson|undefined)=>n?.kind==='string'?n.value:undefined;
function inspect(value:Json):Diagnostic[]{
 const p=value as unknown as Payload,out:Diagnostic[]=[{code:'SQLSERVER_CAPTURE_SCOPE',path:'',severity:'warning',message:'Permission-limited table/column observations; server correspondence and complete native semantics are unverified'}];
 const warning=(path:string)=>out.push({code:'SQLSERVER_ENCODING',path,severity:'warning',message:'Unknown encoding content must remain in UMF and blocks native export'});
 for(const key of Object.keys(p))if(!['profile','root'].includes(key))warning('/'+key);
 function walk(n:NativeJson,path:string){const keys=n.kind==='object'?['kind','members']:n.kind==='array'?['kind','items']:n.kind==='null'?['kind']:['kind','value'];if(Object.keys(n).some(k=>!keys.includes(k)))warning(path);if(n.kind==='object')Object.entries(n.members).forEach(([k,v])=>walk(v,path+'/'+k));if(n.kind==='array')n.items.forEach((v,i)=>walk(v,path+'/'+i));}walk(p.root,'/root');
 // Check declared integer tokens before JSON.parse can round them into valid IDs,
 // lengths or ordinals. Unknown native properties retain their exact source tokens.
 for(const path of catalogIntegerErrors(p.root,captureSchema))out.push({code:'SQLSERVER_INTEGER',path,severity:'error',message:'Declared catalog integers must be exact interoperable integers; numeric rounding is not permitted'});
 if(out.some(d=>d.severity==='error'))return out;
 const native=JSON.parse(renderTree(p.root));if(!check(native)){out.push({code:'SQLSERVER_CAPTURE_STRUCTURE',path:'',severity:'error',message:JSON.stringify(check.errors)});return out;}
 const tables=new Set<string>();for(const table of native.tables){const key=JSON.stringify([table.schema,table.name]);if(tables.has(key))out.push({code:'SQLSERVER_DUPLICATE',path:'/tables',severity:'error',message:'Duplicate qualified table observation'});tables.add(key);const names=new Set<string>(),ids=new Set<number>();for(const c of table.columns){if(names.has(c.name)||ids.has(c.column_id))out.push({code:'SQLSERVER_DUPLICATE',path:'/tables',severity:'error',message:'Duplicate column name or native ID'});names.add(c.name);ids.add(c.column_id);}}
 if(!native.serverVersion?.startsWith('16.'))out.push({code:'SQLSERVER_VERSION',path:'/serverVersion',severity:'warning',message:'Version retained outside the SQL Server 2022 profile'});
 for(const [ti,t] of native.tables.entries()){
  const names=new Set<string>();
  for(const section of ['keys','foreign_keys','checks'])for(const [ci,c] of (t[section]??[]).entries()){
   const path='/tables/'+ti+'/'+section+'/'+ci;
   if(names.has(c.name))out.push({code:'SQLSERVER_DUPLICATE',path,severity:'error',message:'Duplicate constraint name within table'});names.add(c.name);
   if(section!=='checks'){
    const ordinals=new Set<number>(),columns=new Set<number>();
    for(const col of c.columns){const ordinal=section==='keys'?col.key_ordinal:col.ordinal;if(ordinals.has(ordinal)||columns.has(col.column_id))out.push({code:'SQLSERVER_CONSTRAINT_COLUMNS',path,severity:'error',message:'Duplicate constraint column or ordinal'});ordinals.add(ordinal);columns.add(col.column_id);}
    if(!c.columns.length)out.push({code:'SQLSERVER_CONSTRAINT_UNRESOLVED',path,severity:'warning',message:'Constraint column observations are unavailable'});
   }
   if(section==='keys'&&!['PK','UQ'].includes(c.kind)||section==='foreign_keys'&&[c.delete_action,c.update_action].some(a=>!['NO_ACTION','CASCADE','SET_NULL','SET_DEFAULT'].includes(a)))out.push({code:'SQLSERVER_CONSTRAINT_UNKNOWN',path,severity:'warning',message:'Unknown native constraint kind/action retained without interpretation'});
  }
  const indexIds=new Set<number>(),indexNames=new Set<string>();
  for(const [ii,index] of (t.indexes??[]).entries()){
   const path='/tables/'+ti+'/indexes/'+ii;
   if(indexIds.has(index.index_id)||index.name!==null&&indexNames.has(index.name))out.push({code:'SQLSERVER_DUPLICATE',path,severity:'error',message:'Duplicate index name or native ID within table'});
   indexIds.add(index.index_id);if(index.name!==null)indexNames.add(index.name);
   const ids=new Set<number>(),keys=new Set<number>(),orders=new Set<number>(),partitions=new Set<number>();
   for(const column of index.columns){
    if(ids.has(column.index_column_id)||column.key_ordinal>0&&keys.has(column.key_ordinal)||column.column_store_order_ordinal>0&&orders.has(column.column_store_order_ordinal)||column.partition_ordinal>0&&partitions.has(column.partition_ordinal))out.push({code:'SQLSERVER_INDEX_COLUMNS',path,severity:'error',message:'Duplicate index column ID or positive ordering ordinal'});
    ids.add(column.index_column_id);if(column.key_ordinal>0)keys.add(column.key_ordinal);if(column.column_store_order_ordinal>0)orders.add(column.column_store_order_ordinal);if(column.partition_ordinal>0)partitions.add(column.partition_ordinal);
   }
   const known:Record<number,string>={0:'HEAP',1:'CLUSTERED',2:'NONCLUSTERED',3:'XML',4:'SPATIAL',5:'CLUSTERED COLUMNSTORE',6:'NONCLUSTERED COLUMNSTORE',7:'NONCLUSTERED HASH'};
   if(known[index.type]!==index.type_desc)out.push({code:'SQLSERVER_INDEX_UNKNOWN',path,severity:'warning',message:'Unknown index type identity retained without interpretation'});
   if([3,4,7].includes(index.type))out.push({code:'SQLSERVER_INDEX_DETAILS_UNAVAILABLE',path,severity:'warning',message:'Specialized XML, spatial or hash index details are outside this catalog capture'});
   if(index.has_filter&&index.filter_definition===null)out.push({code:'SQLSERVER_INDEX_FILTER_UNAVAILABLE',path,severity:'warning',message:'Filtered index predicate unavailable; do not infer an unfiltered index'});
  }
 }
 if(native.state==='modified')out.push({code:'SQLSERVER_MODIFIED',path:'/state',severity:'warning',message:'Candidate metadata edits do not update SQL Server or synchronize original DDL'});
 return out;
}
export function sqlserverRegistry(){return new Registry().register(sqlserverPackage,inspect);}
export function inspectSqlServer(document:Document){return validateDocument(document,sqlserverRegistry());}
function payload(document:Document):Payload{
 const result=inspectSqlServer(document);if(!result.valid||document.vocabularies[SQLSERVER_EXTENSION]?.version!=='0.1.0')throw new UmfError('SQLSERVER_CAPTURE',JSON.stringify(result.diagnostics));
 const p=document.extensions?.[SQLSERVER_EXTENSION];if(!p)throw new UmfError('SQLSERVER_CAPTURE','Missing SQL Server capture');return copyJson(p) as unknown as Payload;
}
function derive(root:NativeJson):SqlServerColumnMetadata[]{
 if(root.kind!=='object'||root.members.tables?.kind!=='array')return [];const out:SqlServerColumnMetadata[]=[];
 root.members.tables.items.forEach((table,ti)=>{if(table.kind!=='object'||table.members.columns?.kind!=='array')return;table.members.columns.items.forEach((column,ci)=>{
  if(column.kind!=='object')return;const c=column.members,id=c.system_type_id?.kind==='number'?String(Number(c.system_type_id.value)):'',match=types[id];
  const scalarType=match&&str(c.base_type_name)===match[0]&&c.is_assembly_type?.kind==='boolean'&&!c.is_assembly_type.value?match[1]:undefined,path='/tables/'+ti+'/columns/'+ci,description=str(c.description);
  out.push({path,table:{schema:str(table.members.schema)!,name:str(table.members.name)!},nativeColumn:copyJson(column) as NativeJson,element:{id:path,name:str(c.name)!,...(description!==undefined?{description}:{}),...(scalarType?{scalarType}:{}),extensions:{}}});
 });});return out;
}
export function getSqlServerColumnMetadata(document:Document){return derive(payload(document).root);}
export interface SqlServerConstraintMetadata {complete:false;tables:{path:string;table:{schema:string;name:string};available:{keys:boolean;foreign_keys:boolean;checks:boolean};keys:NativeJson[];foreign_keys:NativeJson[];checks:NativeJson[]}[];}
/** Missing observations are distinct from empty, permission-limited catalog results. */
export function getSqlServerConstraintMetadata(document:Document):SqlServerConstraintMetadata{
 const root=payload(document).root;if(root.kind!=='object'||root.members.tables?.kind!=='array')throw new UmfError('SQLSERVER_CAPTURE','Expected captured tables');
 return {complete:false,tables:root.members.tables.items.map((node,index)=>{
  if(node.kind!=='object')throw new UmfError('SQLSERVER_CAPTURE','Expected table');const t=node.members;
  const values=(key:string)=>t[key]?.kind==='array'?copyJson(t[key].items) as NativeJson[]:[];
  return {path:'/tables/'+index,table:{schema:str(t.schema)!,name:str(t.name)!},available:{keys:t.keys?.kind==='array',foreign_keys:t.foreign_keys?.kind==='array',checks:t.checks?.kind==='array'},keys:values('keys'),foreign_keys:values('foreign_keys'),checks:values('checks')};
 })};
}
export interface SqlServerIndexMetadata {complete:false;tables:{path:string;table:{schema:string;name:string};available:boolean;indexes:NativeJson[]}[];}
/** Preserve heap and all observed index rows; column ordinals do not imply portable keys. */
export function getSqlServerIndexMetadata(document:Document):SqlServerIndexMetadata{
 const root=payload(document).root;if(root.kind!=='object'||root.members.tables?.kind!=='array')throw new UmfError('SQLSERVER_CAPTURE','Expected captured tables');
 return {complete:false,tables:root.members.tables.items.map((node,index)=>{
  if(node.kind!=='object')throw new UmfError('SQLSERVER_CAPTURE','Expected table');const t=node.members;
  return {path:'/tables/'+index,table:{schema:str(t.schema)!,name:str(t.name)!},available:t.indexes?.kind==='array',indexes:t.indexes?.kind==='array'?copyJson(t.indexes.items) as NativeJson[]:[]};
 })};
}
function consistent(document:Document){const module=document.modules.find(m=>m.id==='sqlserver.columns'),fields=getSqlServerColumnMetadata(document);if(!module||module.namespace!==''||module.elements.length!==fields.length||fields.some((f,i)=>['id','name','description','scalarType'].some(k=>module.elements[i]?.[k]!==f.element[k])))throw new UmfError('SQLSERVER_METADATA','Native columns and core metadata disagree');}
export function importSqlServerCatalog(text:string,options:{id:string}):Document{
 const root=parseNativeJson(text),doc:Document={umf:'0.1.0',id:options.id,vocabularies:{[SQLSERVER_EXTENSION]:{version:'0.1.0'}},extensions:{[SQLSERVER_EXTENSION]:{profile:'sqlserver-catalog-v1',root} as unknown as Json},modules:[]};payload(doc);doc.modules.push({id:'sqlserver.columns',namespace:'',elements:derive(root).map(c=>c.element)});return doc;
}
export function exportSqlServerCatalog(document:Document):string{
 consistent(document);if(inspectSqlServer(document).diagnostics.some(d=>d.code==='SQLSERVER_ENCODING'))throw new UmfError('SQLSERVER_ENCODING','Unknown source encoding cannot be discarded');return renderTree(payload(document).root)+'\n';
}
export function proposeSqlServerCatalogEdit(document:Document,path:string,text:string):Document{
 exportSqlServerCatalog(document);const result=copyJson(document) as Document,p=result.extensions![SQLSERVER_EXTENSION] as unknown as Payload,parts=nativePointer(path),replacement=parseNativeJson(text);
 if(!parts.length)p.root=replacement;else{let n=p.root;for(const part of parts.slice(0,-1))n=treeChild(n,part);const key=parts.at(-1)!;treeChild(n,key);if(n.kind==='object')n.members[key]=replacement;else if(n.kind==='array')n.items[Number(key)]=replacement;}
 if(p.root.kind!=='object')throw new UmfError('SQLSERVER_CAPTURE','Expected capture object');p.root.members.state={kind:'string',value:'modified'};payload(result);
 const before=getSqlServerColumnMetadata(document),after=getSqlServerColumnMetadata(result),module=result.modules.find(m=>m.id==='sqlserver.columns')!,previous=new Map(module.elements.map(e=>[e.id,e]));
 for(const old of before){const e=previous.get(old.element.id)!,current=after.find(c=>c.element.id===e.id);if((Object.keys(e.extensions).length||Object.keys(e).some(k=>!['id','name','description','scalarType','extensions'].includes(k)))&&(!current||current.element.name!==old.element.name||JSON.stringify(current.table)!==JSON.stringify(old.table)))throw new UmfError('SQLSERVER_METADATA','Attached metadata requires explicit reassociation');}
 module.elements=after.map(c=>{const old=previous.get(c.element.id);if(!old)return c.element;delete old.description;delete old.scalarType;return {...old,...c.element,extensions:old.extensions};});exportSqlServerCatalog(result);return result;
}
