import {copyJson} from '../model/json';
import {UmfError,type Document,type Json,type Diagnostic,type ExtensionPackage} from '../model/types';
import {parseNativeJson,renderTree} from '../model/native-json';
import {exportSqlServerCatalog,getSqlServerIndexMetadata,getSqlServerColumnMetadata} from '../adapters/sqlserver';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import nullability from '../../spec/core/nullability-document.schema.json';import cardinality from '../../spec/core/cardinality-document.schema.json';import facets from '../../spec/core/facet-document.schema.json';import keys from '../../spec/core/key-document.schema.json';
import schema from '../../spec/core/sqlserver-key-classification.schema.json';
import manifest from '../../spec/extensions/sqlserver-keys/package.json';
export const SQLSERVER_KEYS_EXTENSION='umf.sqlserver.keys';
export const sqlserverKeysPackage=manifest as unknown as ExtensionPackage;
export {default as sqlserverKeyClassificationSchema} from '../../spec/core/sqlserver-key-classification.schema.json';
export interface SqlServerKeyRequest {nativeSource:string;mode:'strict'|'report';profile:'captured-stored-values'}
export interface SqlServerKeyObservation {
 identity:{schema:string;table:string;indexId:number;name:string|null};nativePath:string;fields:{module:string;element:string}[];primary:boolean;
 enforcement:'immediate-unique-nonnull'|'conditional'|'nullable'|'not-unique'|'unavailable'|'unknown';equality:'exact-on-representable-values'|'incompatible'|'unknown';ignoreDuplicateKey:boolean;authorIntent:'unknown';provenance:'inferred';scope:'captured-table-stored-values';reasons:string[];
}
const binding=schema.properties.binding.const,recovery='Original native catalog retained; authored key intent is not inferred' as const;
export interface SqlServerKeyClassification {
 operation:'classify-sqlserver-keys';version:'1.0.0';status:'classified'|'blocked';outcome:'exact'|'unknown'|'not-expressible';source:Document;target?:Document;request:SqlServerKeyRequest;binding:typeof binding;observations:SqlServerKeyObservation[];
 residuals:{path:string;value:Json;outcome:'unknown'|'not-expressible';reason:string;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
const validator=createValidator(false);for(const s of [legacy,fields,nullability,cardinality,facets,keys])validator.addSchema(s);
const check=validator.compile(schema),requestCheck=validator.compile(schema.properties.request);
const canonical=(v:Json):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k]!)).join(',')+'}':JSON.stringify(v);
const fail=(message:string):never=>{throw new UmfError('SQLSERVER_KEY_CORRELATION',message);};
/** Captured facts are observations, not authenticated state or authored identity. */
export function classifySqlServerKeys(input:Document,options:SqlServerKeyRequest):SqlServerKeyClassification {
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as SqlServerKeyRequest;
 if(!requestCheck(request))throw new UmfError('SQLSERVER_KEY_REQUEST',JSON.stringify(requestCheck.errors));
 const exported=exportSqlServerCatalog(source);
 if(renderTree(parseNativeJson(request.nativeSource))+'\n'!==exported)throw new UmfError('SQLSERVER_KEY_ARCHIVE','Native text differs from retained catalog');
 const native=JSON.parse(exported),views=getSqlServerIndexMetadata(source),columns=getSqlServerColumnMetadata(source);
 if(native.profile!=='sqlserver-catalog-v3'||native.state!=='captured'||native.serverVersion!==binding.nativeVersion)throw new UmfError('SQLSERVER_KEY_PROFILE','Expected captured v3 catalog from pinned SQL Server 16.0.4295.3');
 const result:SqlServerKeyClassification={operation:'classify-sqlserver-keys',version:'1.0.0',status:'classified',outcome:'exact',source,request,binding,observations:[],residuals:[],diagnostics:[]};
 const loss=(path:string,value:unknown,reason:string,outcome:'unknown'|'not-expressible'='unknown')=>result.residuals.push({path,value:copyJson(value),reason,outcome,recovery});
 let conflict=false;
 if(source.extensions&&Object.hasOwn(source.extensions,SQLSERVER_KEYS_EXTENSION)){conflict=true;loss('/extensions/'+SQLSERVER_KEYS_EXTENSION,source.extensions[SQLSERVER_KEYS_EXTENSION],'Existing observations cannot be overwritten');}
 if(source.vocabularies[SQLSERVER_KEYS_EXTENSION]&&source.vocabularies[SQLSERVER_KEYS_EXTENSION]!.version!=='1.0.0'){conflict=true;loss('/vocabularies/'+SQLSERVER_KEYS_EXTENSION,source.vocabularies[SQLSERVER_KEYS_EXTENSION],'Incompatible vocabulary version');}
 // Every unclaimed native qualifier stays in exact source text, including unknown numeric lexemes.
 loss('/nativeSource',request.nativeSource,'This captured, permission-limited catalog is not authenticated live state; all unknown native qualifiers and unclaimed metadata remain in the retained archive');
 for(const [ti,table] of native.tables.entries()){
  const view=views.tables[ti]!;if(!view.available||!Array.isArray(table.keys))fail('Required index/key inventory is unavailable');
  for(const key of table.keys){const matches=table.indexes.filter((i:any)=>i.name===key.name);if(matches.length!==1)fail('Constraint has no unique corresponding index');const i=matches[0];
   if(!i.is_unique||i.is_primary_key!==(key.kind==='PK')||i.is_unique_constraint!==(key.kind==='UQ')||i.is_disabled!==key.is_disabled||i.ignore_dup_key!==key.ignore_dup_key||i.type_desc!==key.index_type)fail('Constraint and index enforcement assertions disagree');
   const ordered=i.columns.filter((c:any)=>c.key_ordinal>0).sort((a:any,b:any)=>a.key_ordinal-b.key_ordinal),declared=[...key.columns].sort((a:any,b:any)=>a.key_ordinal-b.key_ordinal);
   if(ordered.length!==declared.length||ordered.some((c:any,j:number)=>['column_id','name','key_ordinal','is_descending_key'].some(k=>c[k]!==declared[j][k])))fail('Constraint and index tuples disagree');
  }
  for(const [ii,index] of table.indexes.entries()){
   const path=view.path+'/indexes/'+ii,raw=view.indexes[ii]!;
   if((index.is_primary_key||index.is_unique_constraint)&&!table.keys.some((k:any)=>k.name===index.name))fail('Index constraint flag has no corresponding constraint');
   if(index.is_primary_key&&index.is_unique_constraint||!index.is_unique&&(index.is_primary_key||index.is_unique_constraint))fail('Contradictory native uniqueness flags');
   const components=index.columns.filter((c:any)=>c.key_ordinal>0).sort((a:any,b:any)=>a.key_ordinal-b.key_ordinal),resolved:any[]=[],seen=new Set<number>();
   for(const [j,c] of components.entries()){
    if(c.key_ordinal!==j+1||c.is_included_column||seen.has(c.column_id))fail('Key ordinals must be contiguous, unique and separate from INCLUDE columns');seen.add(c.column_id);
    const ci=table.columns.findIndex((f:any)=>f.column_id===c.column_id&&f.name===c.name);if(ci<0)fail('Index component does not resolve to its captured column');resolved.push({native:table.columns[ci],path:view.path+'/columns/'+ci});
   }
   const observation:SqlServerKeyObservation={identity:{schema:table.schema,table:table.name,indexId:index.index_id,name:index.name},nativePath:path,fields:resolved.map(c=>{const f=columns.find(f=>f.path===c.path);if(!f)fail('Captured Field metadata missing');return {module:'sqlserver.columns',element:f!.element.id};}),primary:index.is_primary_key,enforcement:'unknown',equality:'unknown',ignoreDuplicateKey:index.ignore_dup_key,authorIntent:'unknown',provenance:'inferred',scope:'captured-table-stored-values',reasons:[]};
   const reason=(s:string)=>observation.reasons.push(s);
   if(index.is_disabled||index.is_hypothetical){observation.enforcement='unavailable';reason('Disabled or hypothetical indexes do not establish enforced uniqueness');}
   else if(!index.is_unique){observation.enforcement='not-unique';reason('Index does not assert uniqueness');}
   else if(index.has_filter||index.filter_definition!==null){observation.enforcement='conditional';reason('Filtered uniqueness does not cover all stored rows');}
   else if(![1,2].includes(index.type)||index.type_desc!==(index.type===1?'CLUSTERED':'NONCLUSTERED')||!components.length||resolved.some(c=>c.native.is_computed)){reason('Index type, missing tuple or computed component requires separate qualification');}
   else if(resolved.some(c=>c.native.is_nullable)){observation.enforcement='nullable';reason('Unique SQL NULL treatment does not establish required components');}
   else{observation.enforcement='immediate-unique-nonnull';reason('Captured unconditional rowstore uniqueness and NOT NULL cover the native stored tuple');}
   if(index.ignore_dup_key)reason('IGNORE_DUP_KEY can skip incoming duplicates instead of failing the write; stored uniqueness is a separate assertion');
   let exact=components.length>0,incompatible=false;
   const exactTypes:Record<number,string>={104:'bit',48:'tinyint',52:'smallint',56:'int',127:'bigint',106:'decimal',108:'numeric',60:'money',122:'smallmoney'};
   for(const {native:c} of resolved){
    if(c.is_computed||c.is_user_defined||c.is_assembly_type){exact=false;continue;}
    if([167,175,231,239,165,173].includes(c.system_type_id)){exact=false;incompatible=true;reason('Native string trailing-space or binary trailing-zero equality can collapse distinct ideal values');}
    else if(exactTypes[c.system_type_id]!==c.base_type_name){exact=false;reason('Native type has no qualified core Key comparator');}
   }
   observation.equality=exact?'exact-on-representable-values':incompatible?'incompatible':'unknown';
   loss(path,raw,'Native index names and enforcement do not establish authored stable key IDs, names or identity intent');
   if(observation.enforcement!=='immediate-unique-nonnull')loss(path,raw,observation.reasons[0]!,observation.enforcement==='unknown'?'unknown':'not-expressible');
   loss(path+'/columns',raw,observation.equality==='exact-on-representable-values'?'Comparator agreement covers representable stored values only; native width, precision, scale and input coercions remain attached':'Native comparator/refinements do not establish exact UMF tuple equality',observation.equality==='incompatible'?'not-expressible':'unknown');
   result.observations.push(observation);
  }
 }
 result.outcome=result.residuals.some(r=>r.outcome==='not-expressible')?'not-expressible':'unknown';
 if(conflict||request.mode==='strict')result.status='blocked';else{
  const target=copyJson(source) as unknown as Document;target.vocabularies[SQLSERVER_KEYS_EXTENSION]??={version:'1.0.0'};target.extensions??={};target.extensions[SQLSERVER_KEYS_EXTENSION]=copyJson({origin:'classified',binding,profile:request.profile,nativeSource:request.nativeSource,observations:result.observations});
  if(!validateDocument(target).valid)throw new UmfError('SQLSERVER_KEY_TARGET','Invalid target');result.target=target;
 }
 result.diagnostics=result.residuals.map(r=>({code:'SQLSERVER_KEY_RESIDUAL',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const copied=copyJson(result);if(!check(copied))throw new UmfError('SQLSERVER_KEY_RESULT',JSON.stringify(check.errors));return copied as unknown as SqlServerKeyClassification;
}
export function verifySqlServerKeyClassification(input:SqlServerKeyClassification,current:Document):SqlServerKeyClassification {
 const receipt=copyJson(input) as unknown as SqlServerKeyClassification;
 if(!check(receipt)||receipt.status!=='classified')throw new UmfError('SQLSERVER_KEY_RECEIPT','Expected complete classified receipt');
 const expected=classifySqlServerKeys(receipt.source,receipt.request);
 if(canonical(copyJson(receipt))!==canonical(copyJson(expected)))throw new UmfError('SQLSERVER_KEY_RECEIPT','Receipt differs from retained source and request');
 if(canonical(copyJson(current))!==canonical(copyJson(receipt.target)))throw new UmfError('SQLSERVER_KEY_STALE','Classification target changed');return receipt;
}
export function recoverSqlServerKeySource(input:SqlServerKeyClassification,current:Document):string{return verifySqlServerKeyClassification(input,current).request.nativeSource;}
