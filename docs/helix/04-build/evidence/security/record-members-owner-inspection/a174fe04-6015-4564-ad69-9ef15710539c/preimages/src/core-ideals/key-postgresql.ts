import {copyJson} from '../model/json';
import {UmfError,pointer,type Document,type Json,type Diagnostic,type ExtensionPackage} from '../model/types';
import {parseNativeJson,renderTree,type NativeJson} from '../model/native-json';
import {exportPostgresqlCatalogCapture,getPostgresqlColumnMetadata} from '../adapters/postgresql/catalog';
import {inspectPostgresqlKeyCatalog} from '../adapters/postgresql/key-catalog';
import {correlatePostgresqlKeyCatalog} from '../adapters/postgresql/key-correlation';
import type {PostgresqlBackend} from '../adapters/postgresql';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import nullability from '../../spec/core/nullability-document.schema.json';import cardinality from '../../spec/core/cardinality-document.schema.json';import facets from '../../spec/core/facet-document.schema.json';import keys from '../../spec/core/key-document.schema.json';
import schema from '../../spec/core/postgresql-key-classification.schema.json';
import nativeSchema from '../../spec/extensions/postgresql-catalog/key-observations-v1.schema.json';
import manifest from '../../spec/extensions/postgresql-keys/package.json';
export const POSTGRESQL_KEYS_EXTENSION='umf.postgresql.keys';
export const postgresqlKeysPackage=manifest as unknown as ExtensionPackage;
export {default as postgresqlKeyClassificationSchema} from '../../spec/core/postgresql-key-classification.schema.json';
export interface PostgresqlKeyRequest {nativeSource:string;supplement:string;mode:'strict'|'report';profile:'captured-stored-values'}
export interface PostgresqlKeyObservation {
 identity:{schema:string;table:string;index:string};nativePath:string;fields:{module:string;element:string}[];primary:boolean;
 enforcement:'immediate-unique-nonnull'|'conditional'|'deferred'|'nullable'|'not-unique'|'unavailable'|'unknown';
 equality:'exact-on-representable-values'|'incompatible'|'unknown';authorIntent:'unknown';provenance:'inferred';scope:'relation-with-descendants';reasons:string[];
}
const binding=schema.properties.binding.const,recovery='Original native catalog and supplement retained; authored key intent is not inferred' as const;
export interface PostgresqlKeyClassification {
 operation:'classify-postgresql-keys';version:'1.0.0';status:'classified'|'blocked';outcome:'exact'|'unknown'|'not-expressible';source:Document;target?:Document;request:PostgresqlKeyRequest;binding:typeof binding;observations:PostgresqlKeyObservation[];
 residuals:{path:string;value:Json;outcome:'unknown'|'not-expressible';reason:string;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
const validator=createValidator(false);for(const s of [legacy,fields,nullability,cardinality,facets,keys])validator.addSchema(s);
const check=validator.compile(schema),requestCheck=validator.compile(schema.properties.request);
const canonical=(v:Json):string=>Array.isArray(v)?'a['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'o{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k]!)).join(',')+'}':JSON.stringify(v);
/** Observe native facts under a fixed stored-value scope, without creating authored keys. */
export async function classifyPostgresqlKeys(input:Document,options:PostgresqlKeyRequest,backend:PostgresqlBackend):Promise<PostgresqlKeyClassification>{
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as PostgresqlKeyRequest;
 if(!requestCheck(request))throw new UmfError('POSTGRESQL_KEY_REQUEST',JSON.stringify(requestCheck.errors));
 const exported=exportPostgresqlCatalogCapture(source);
 if(renderTree(parseNativeJson(request.nativeSource))!==exported.json)throw new UmfError('POSTGRESQL_KEY_ARCHIVE','Native source differs from retained catalog');
 const correlation=await correlatePostgresqlKeyCatalog(source,request.supplement,backend),supplement=inspectPostgresqlKeyCatalog(request.supplement),columns=getPostgresqlColumnMetadata(source);
 const result:PostgresqlKeyClassification={operation:'classify-postgresql-keys',version:'1.0.0',status:'classified',outcome:'exact',source,request,binding,observations:[],residuals:[],diagnostics:[]};
 const loss=(path:string,value:unknown,reason:string,outcome:'unknown'|'not-expressible'='unknown')=>result.residuals.push({path,value:copyJson(value),reason,outcome,recovery});
 let conflict=false;
 if(source.extensions&&Object.hasOwn(source.extensions,POSTGRESQL_KEYS_EXTENSION)){conflict=true;loss('/extensions/'+POSTGRESQL_KEYS_EXTENSION,source.extensions[POSTGRESQL_KEYS_EXTENSION],'Existing observations cannot be overwritten; reclassify their retained source');}
 if(source.vocabularies[POSTGRESQL_KEYS_EXTENSION]&&source.vocabularies[POSTGRESQL_KEYS_EXTENSION]!.version!=='1.0.0'){conflict=true;loss('/vocabularies/'+POSTGRESQL_KEYS_EXTENSION,source.vocabularies[POSTGRESQL_KEYS_EXTENSION],'Incompatible vocabulary version');}
 function unknown(node:NativeJson,rule:any,path:string){
  if(rule.anyOf){const branch=rule.anyOf.find((r:any)=>node.kind==='null'?r.type==='null':r.type!=='null');if(branch)unknown(node,branch,path);return;}
  if(node.kind==='array'&&rule.items){node.items.forEach((n,i)=>unknown(n,rule.items,path+'/'+i));return;}
  if(node.kind==='object'&&rule.properties)for(const [key,value] of Object.entries(node.members)){if(Object.hasOwn(rule.properties,key))unknown(value,rule.properties[key],path+'/'+pointer(key));else loss(path+'/'+pointer(key),value,'Unknown native qualifier retained without interpretation');}
 }
 unknown(supplement.root,nativeSchema,'/supplement');
 for(const [i,index] of supplement.indexes.entries()){
  const path='/supplement/indexes/'+i,match=correlation.matches.find(m=>m.identity.schema===index.schema&&m.identity.table===index.table&&m.identity.index===index.index)!;
  const component=index.components.slice(0,index.keyCount),observation:PostgresqlKeyObservation={identity:{schema:index.schema,table:index.table,index:index.index},nativePath:match.indexPath,fields:[],primary:index.primary,enforcement:'unknown',equality:'unknown',authorIntent:'unknown',provenance:'inferred',scope:'relation-with-descendants',reasons:[]};
  const reason=(message:string)=>observation.reasons.push(message);
  for(const p of match.componentPaths.slice(0,index.keyCount)){if(p===null)continue;const field=columns.find(c=>c.path===p);if(!field)throw new UmfError('POSTGRESQL_KEY_COLUMN','Correlated column has no retained metadata Field');observation.fields.push({module:'postgresql.columns',element:field.element.id});}
  if(!index.valid||!index.ready||!index.live||index.constraint?.validated===false){observation.enforcement='unavailable';reason('Invalid, unready, non-live or unvalidated native state cannot establish enforcement');}
  else if(!index.unique){observation.enforcement='not-unique';reason('Index does not assert native uniqueness');}
  else if(index.predicate!==null||index.children.length>0||index.parents.length>0){observation.enforcement='conditional';reason('Predicate or inheritance changes the covered row set; whole visible-relation uniqueness is not established');}
  else if(!index.immediate||index.constraint?.deferrable){observation.enforcement='deferred';reason('Deferrable constraints can admit transient duplicates before a constraint check');}
  else if(index.expressions!==null||index.relationKind!=='r'||index.accessMethod!=='btree'){reason('Expression keys, relation kind or index method require another qualified interpretation');}
  else if(component.some(c=>c.notNull!==true)){observation.enforcement='nullable';reason('Native null treatment does not establish required core key components');}
  else {observation.enforcement='immediate-unique-nonnull';reason('Captured immediate unconditional uniqueness and NOT NULL apply to this native stored tuple');}
  let exact=true,incompatible=false;
  const classes:Record<string,string>={bool:'bool_ops',int2:'int2_ops',int4:'int4_ops',int8:'int8_ops',bytea:'bytea_ops'};
  for(const c of component){
   if(c.typeSchema!=='pg_catalog'||c.typeKind!=='b'||c.attribute===0){exact=false;continue;}
   if(c.typeName==='bpchar'){exact=false;incompatible=true;reason('Blank-padded character equality collapses distinct Unicode strings');continue;}
   if(c.typeName==='text'||c.typeName==='varchar'){
    if(c.operatorClass!=='pg_catalog.text_ops'||c.collation?.schema!=='pg_catalog'||c.collation.name!=='C'||!c.collation.deterministic){exact=false;reason('String comparator is not the qualified deterministic C-collation subset');}
    else reason('C-collation equality is exact only for representable PostgreSQL strings; NUL and input/type coercions remain native restrictions');
   }else if(c.typeName===null||!Object.hasOwn(classes,c.typeName)||c.operatorClass!=='pg_catalog.'+classes[c.typeName]||c.collation!==null){exact=false;reason('Native type, operator class, domain or numeric refinement needs separate equality qualification');}
  }
  observation.equality=exact?'exact-on-representable-values':incompatible?'incompatible':'unknown';
  loss(path,index,'Native key names and enforcement observations do not establish authored stable key IDs, names or identity intent');
  if(observation.enforcement!=='immediate-unique-nonnull')loss(path,index,observation.reasons[0]!,observation.enforcement==='unknown'?'unknown':'not-expressible');
  if(observation.equality!=='exact-on-representable-values')loss(path+'/components',component,'Exact core tuple equality is not established for these native comparators/refinements',observation.equality==='incompatible'?'not-expressible':'unknown');
  else loss(path+'/components',component,'Comparator agreement covers native representable stored values only; widths, NUL, input coercions and remaining native domain restrictions are not erased');
  result.observations.push(observation);
 }
 if(result.residuals.length)result.outcome=result.residuals.some(r=>r.outcome==='not-expressible')?'not-expressible':'unknown';
 if(conflict||request.mode==='strict'&&result.residuals.length)result.status='blocked';
 else{
  const target=copyJson(source) as unknown as Document;target.vocabularies[POSTGRESQL_KEYS_EXTENSION]??={version:'1.0.0'};target.extensions??={};target.extensions[POSTGRESQL_KEYS_EXTENSION]=copyJson({origin:'classified',binding,profile:request.profile,nativeSource:request.nativeSource,supplement:request.supplement,observations:result.observations});
  if(!validateDocument(target).valid)throw new UmfError('POSTGRESQL_KEY_TARGET','Invalid classification target');result.target=target;
 }
 result.diagnostics=result.residuals.map(r=>({code:'POSTGRESQL_KEY_RESIDUAL',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const copied=copyJson(result);if(!check(copied))throw new UmfError('POSTGRESQL_KEY_RESULT',JSON.stringify(check.errors));return copied as unknown as PostgresqlKeyClassification;
}
export async function verifyPostgresqlKeyClassification(input:PostgresqlKeyClassification,current:Document,backend:PostgresqlBackend):Promise<PostgresqlKeyClassification>{
 const receipt=copyJson(input) as unknown as PostgresqlKeyClassification;
 if(!check(receipt)||receipt.status!=='classified')throw new UmfError('POSTGRESQL_KEY_RECEIPT','Expected complete classified receipt');
 const expected=await classifyPostgresqlKeys(receipt.source,receipt.request,backend);
 if(canonical(copyJson(receipt))!==canonical(copyJson(expected)))throw new UmfError('POSTGRESQL_KEY_RECEIPT','Receipt differs from retained native source and request');
 if(canonical(copyJson(current))!==canonical(copyJson(receipt.target)))throw new UmfError('POSTGRESQL_KEY_STALE','Classification target changed');return receipt;
}
export async function recoverPostgresqlKeySource(input:PostgresqlKeyClassification,current:Document,backend:PostgresqlBackend){const r=await verifyPostgresqlKeyClassification(input,current,backend);return {nativeSource:r.request.nativeSource,supplement:r.request.supplement};}
