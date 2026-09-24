import {copyJson} from '../model/json';
import {UmfError,type Document,type Json,type Diagnostic} from '../model/types';
import {lookupCoreKey,verifyCoreKeyOperation,type CoreKeyDeclaration,type CoreRecordIdentity} from '../model/keys';
import type {CoreKeyDefinition,CoreKeyFieldReference} from '../validation/keys';
import {validateDocument} from '../validation/document';
import {importPostgresqlSql,getPostgresqlSource,type PostgresqlBackend} from '../adapters/postgresql';
import {carriers,identifier} from './postgresql-syntax';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import nullability from '../../spec/core/nullability-document.schema.json';import cardinality from '../../spec/core/cardinality-document.schema.json';import facets from '../../spec/core/facet-document.schema.json';import keys from '../../spec/core/key-document.schema.json';import keyOperation from '../../spec/core/key-operation.schema.json';
import schema from '../../spec/core/key-postgresql-projection.schema.json';
export {default as keyPostgresqlProjectionSchema} from '../../spec/core/key-postgresql-projection.schema.json';
export interface KeyPostgresqlRequest {
 id:string;record:CoreRecordIdentity;namespace:string;tableName:string;scope:'new-table-stored-values';keyNames:{keyId:string;name:string}[];mode:'strict'|'report';
 columns:{field:CoreRecordIdentity;name:string;nativeType:keyof typeof carriers}[];
}
const binding=schema.properties.binding.const;
const recovery='Recover authored source from retained receipt; native import alone does not recover authored identity' as const;
export interface KeyPostgresqlProjection {
 operation:'project-keys-postgresql';version:'1.0.0';status:'projected'|'blocked';source:Document;authors:CoreKeyDeclaration[];request:KeyPostgresqlRequest;binding:typeof binding;target?:Document;nativeSql?:string;
 mappings:{keyId:string;keyName:string;idealPath:string;nativePath:string;columns:string[];primary:boolean;constraintName:string;origin:'authored';enforcement:'primary-key-not-null'|'unique-not-null';equality:'exact-on-representable-values';outcome:'not-expressible'}[];
 residuals:{path:string;value:Json;reason:string;outcome:'unknown'|'not-expressible';recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
const validator=createValidator(false);for(const s of [legacy,fields,nullability,cardinality,facets,keys,keyOperation])validator.addSchema(s);
const check=validator.compile(schema),requestCheck=validator.compile(schema.properties.request);
const canonical=(v:Json):string=>Array.isArray(v)?'a['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'o{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k]!)).join(',')+'}':JSON.stringify(v);
const same=(a:unknown,b:unknown)=>canonical(copyJson(a))===canonical(copyJson(b));
const identity=(r:CoreRecordIdentity)=>JSON.stringify([r.module,r.element]);
function locate(source:Document,ref:CoreRecordIdentity){const mi=source.modules.findIndex(m=>m.id===ref.module),ei=source.modules[mi]?.elements.findIndex(e=>e.id===ref.element)??-1;if(mi<0||ei<0)throw new UmfError('KEY_POSTGRESQL_REFERENCE','Unresolved element identity');return {element:source.modules[mi]!.elements[ei]!,path:`/modules/${mi}/elements/${ei}`};}
/** Consume verified declarations by stable ID. Native names never supply authored identity. */
export async function projectKeysToPostgresql(input:Document,authorInput:CoreKeyDeclaration[],options:KeyPostgresqlRequest,backend:PostgresqlBackend):Promise<KeyPostgresqlProjection> {
 const source=copyJson(input) as unknown as Document,authors=copyJson(authorInput) as unknown as CoreKeyDeclaration[],request=copyJson(options) as unknown as KeyPostgresqlRequest;
 if(!requestCheck(request))throw new UmfError('KEY_POSTGRESQL_REQUEST',JSON.stringify(requestCheck.errors));
 if(source.umf!=='0.6.0'||!validateDocument(source).valid)throw new UmfError('KEY_POSTGRESQL_SOURCE','Valid explicit core 0.6.0 required');
 const record=locate(source,request.record),declared=record.element.keys as CoreKeyDefinition[]|undefined,members=record.element.members as CoreKeyFieldReference[]|undefined;
 if(record.element.kind!=='record'||!declared?.length||!members?.length)throw new UmfError('KEY_POSTGRESQL_RECORD','Selected Record must have authored keys and explicit membership');
 if(!Array.isArray(authors)||authors.length!==declared.length)throw new UmfError('KEY_POSTGRESQL_AUTHORS','Exactly one verified declaration for every current key is required');
 const seen=new Set<string>();
 for(const author of authors){
  if(author.operation!=='declare-core-key')throw new UmfError('KEY_POSTGRESQL_AUTHORS','Expected key declarations');
  verifyCoreKeyOperation(author,author.target);
  if(author.target.id!==source.id||identity(author.identity)!==identity(request.record)||seen.has(author.request.id))throw new UmfError('KEY_POSTGRESQL_AUTHORS','Duplicate or mismatched author identity');seen.add(author.request.id);
  const current=lookupCoreKey(source,{...request.record,key:author.request.id}),prior=lookupCoreKey(author.target,{...request.record,key:author.request.id});
  if(!same(current.key,prior.key))throw new UmfError('KEY_POSTGRESQL_STALE','Key meaning changed since declaration');
  // Unrelated later key declarations/list ordering may differ; component meaning may not.
  for(const ref of current.key.fields)if(!same(locate(source,ref).element,locate(author.target,ref).element))throw new UmfError('KEY_POSTGRESQL_STALE','Key component changed since declaration');
  const priorMembers=locate(author.target,request.record).element.members as CoreKeyFieldReference[];
  for(const ref of current.key.fields){const now=members.find(m=>identity(m)===identity(ref)),then=priorMembers.find(m=>identity(m)===identity(ref));if(!same(now,then))throw new UmfError('KEY_POSTGRESQL_STALE','Key ownership qualifier changed since declaration');}
 }
 const mapped=new Map<string,KeyPostgresqlRequest['columns'][number]>(),names=new Set<string>();
 for(const column of request.columns){const id=identity(column.field);if(mapped.has(id)||names.has(column.name)||!members.some(m=>identity(m)===id))throw new UmfError('KEY_POSTGRESQL_COLUMNS','Column identities and names must be unique and owned by the selected Record');mapped.set(id,column);names.add(column.name);}
 if(mapped.size!==members.length)throw new UmfError('KEY_POSTGRESQL_COLUMNS','Map every owned Field explicitly');
 const result:KeyPostgresqlProjection={operation:'project-keys-postgresql',version:'1.0.0',status:'projected',source,authors,request,binding,mappings:[],residuals:[],diagnostics:[]};
 const loss=(path:string,value:unknown,reason:string,outcome:'unknown'|'not-expressible'='not-expressible')=>result.residuals.push({path,value:copyJson(value),reason,outcome,recovery});
 // The receipt is the explicit residual for context outside this Key-only lowering.
 loss('/',source,'Only selected Record column carriers and key tuple declarations are emitted; all other metadata, native extensions, relationships and unknown content remain in this source residual');
 const namespace=identifier(request.namespace),tableName=identifier(request.tableName);
 const nativeNames=new Map<string,string>(),indexNames=new Set<string>([request.tableName]);
 for(const entry of request.keyNames){identifier(entry.name);if(nativeNames.has(entry.keyId)||indexNames.has(entry.name)||!declared.some(k=>k.id===entry.keyId))throw new UmfError('KEY_POSTGRESQL_NAMES','Bind every stable key ID once to distinct native index names, separate from the table name');nativeNames.set(entry.keyId,entry.name);indexNames.add(entry.name);}
 if(nativeNames.size!==declared.length)throw new UmfError('KEY_POSTGRESQL_NAMES','Missing native key name');
 const definitions:string[]=[];let impossible=false;
 if(request.columns.length>1600){impossible=true;loss('/request/columns',request.columns,'Pinned PostgreSQL allows at most 1600 table columns; tuple-size limits still apply below that bound');}
 for(const column of request.columns){
  if(['tableoid','xmin','cmin','xmax','cmax','ctid'].includes(column.name))throw new UmfError('KEY_POSTGRESQL_COLUMN_NAME','Native system column names cannot name user Fields');
  const field=locate(source,column.field),e=field.element,name=identifier(column.name),[nativeType,family]=carriers[column.nativeType];
  const numericInteger=column.nativeType==='numeric'&&e.scalarType==='integer';
  if((e.scalarType!==family&&!numericInteger)||e.kind!=='field'||e.cardinality!=='one'||e.itemType!==undefined||e.references?.some(r=>r.role==='record-type')){impossible=true;loss(field.path,e,'Selected scalar carrier conflicts with Field family or shape');continue;}
  const checks:string[]=[],f=e.facets as {length?:{max:number;unit:string};integerWidth?:{bits:number;signed:boolean};precision?:number;scale?:number}|undefined;
  let type='pg_catalog.'+nativeType;if(column.nativeType==='text')type+=' COLLATE pg_catalog."C"';
  if(numericInteger)checks.push(`${name} NOT IN ('NaN'::pg_catalog.numeric, 'Infinity'::pg_catalog.numeric, '-Infinity'::pg_catalog.numeric)`,`${name} OPERATOR(pg_catalog.=) pg_catalog.trunc(${name}, 0)`);
  if(f?.integerWidth){
   const {bits,signed}=f.integerWidth,carrierBits=({smallint:16,integer:32,bigint:64} as Record<string,number>)[column.nativeType];
   if(bits>1024||!(numericInteger||carrierBits!==undefined&&bits<=(signed?carrierBits:carrierBits-1))){impossible=true;loss(field.path+'/facets/integerWidth',f.integerWidth,'Selected carrier cannot honor the stated integer domain within the qualified 1024-bit checked subset');}
   else {const min=signed?-(1n<<BigInt(bits-1)):0n,max=(1n<<BigInt(bits-(signed?1:0)))-1n;checks.push(`${name} OPERATOR(pg_catalog.>=) ${min}`,`${name} OPERATOR(pg_catalog.<=) ${max}`);}
  }
  if(f?.precision!==undefined){
   if(column.nativeType!=='numeric'||f.precision>1000){impossible=true;loss(field.path+'/facets',f,'Finite fixed-scale facets require checked numeric with precision at most 1000');}
   else {const scale=f.scale!,whole=f.precision-scale,max=(whole?'9'.repeat(whole):'0')+(scale?'.'+'9'.repeat(scale):'');checks.push(`${name} OPERATOR(pg_catalog.>=) '-${max}'::pg_catalog.numeric`,`${name} OPERATOR(pg_catalog.<=) '${max}'::pg_catalog.numeric`,`${name} OPERATOR(pg_catalog.=) pg_catalog.trunc(${name}, ${scale})`);}
  }
  if(f?.length){
   if(f.length.max<=10485760&&(column.nativeType==='text'&&f.length.unit==='unicode-scalar'||column.nativeType==='bytea'&&f.length.unit==='byte'))checks.push(`pg_catalog.${f.length.unit==='byte'?'octet_length':'char_length'}(${name}) OPERATOR(pg_catalog.<=) ${f.length.max}`);
   else {impossible=true;loss(field.path+'/facets/length',f.length,'Selected carrier does not honor the length unit/bound within the qualified subset');}
  }
  if(e.nullability!=='required')loss(field.path+'/nullability',e.nullability??null,'SQL NULL does not establish absent-member availability; this binding only guarantees required key components');
  definitions.push(`${name} ${type}${e.nullability==='required'?' NOT NULL':' NULL'}${checks.length?' CHECK ('+checks.join(' AND ')+')':''}`);
  loss(field.path,e,'Stored-value constraints do not establish exact conversion of arbitrary SQL expressions; native range/size limits, text NUL restriction and unknown metadata remain explicit residuals','unknown');
 }
 for(const key of declared){
  const current=lookupCoreKey(source,{...request.record,key:key.id}),columns=key.fields.map(ref=>mapped.get(identity(ref))!.name),primary=key.primary===true,constraintName=nativeNames.get(key.id)!;
  if(columns.length>32){impossible=true;loss(current.path,key,'Pinned PostgreSQL index keys support at most 32 columns');}
  const nativePath='/stmts/0/stmt/CreateStmt/tableElts/'+definitions.length+'/Constraint';
  definitions.push(`CONSTRAINT ${identifier(constraintName)} ${primary?'PRIMARY KEY':'UNIQUE'} (${columns.map(identifier).join(', ')}) NOT DEFERRABLE`);
  result.mappings.push({keyId:key.id,keyName:key.name,idealPath:current.path,nativePath,columns,primary,constraintName,origin:'authored',enforcement:primary?'primary-key-not-null':'unique-not-null',equality:'exact-on-representable-values',outcome:'not-expressible'});
  loss(current.path,key,'Native constraint names do not encode stable key IDs/names or author intent. Enforced uniqueness applies only to representable stored tuples in the created table; B-tree tuple limits may reject otherwise valid column values; descendants, later DDL and arbitrary input conversion are outside this guarantee');
 }
 if(impossible||request.mode==='strict')result.status='blocked';
 else {result.nativeSql=`CREATE TABLE ${namespace}.${tableName} (\n  ${definitions.join(',\n  ')}\n);\n`;result.target=await importPostgresqlSql(result.nativeSql,backend,{id:request.id});}
 result.diagnostics=result.residuals.map(r=>({code:'KEY_POSTGRESQL_LOSS',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const copied=copyJson(result);if(!check(copied))throw new UmfError('KEY_POSTGRESQL_RESULT',JSON.stringify(check.errors));return copied as unknown as KeyPostgresqlProjection;
}
/** Recompute projection and match current native representation; not source authentication. */
export async function verifyKeysPostgresqlProjection(input:KeyPostgresqlProjection,current:Document,backend:PostgresqlBackend):Promise<KeyPostgresqlProjection> {
 const receipt=copyJson(input) as unknown as KeyPostgresqlProjection;
 if(!check(receipt)||receipt.status!=='projected')throw new UmfError('KEY_POSTGRESQL_RECEIPT','Expected complete successful projection receipt');
 const expected=await projectKeysToPostgresql(receipt.source,receipt.authors,receipt.request,backend);
 if(!same(receipt,expected))throw new UmfError('KEY_POSTGRESQL_RECEIPT','Receipt differs from retained author/source/request');
 if(!same(current,receipt.target)||getPostgresqlSource(current)!==receipt.nativeSql)throw new UmfError('KEY_POSTGRESQL_STALE','Native representation changed since projection');return receipt;
}
export async function recoverKeysPostgresqlIdeal(input:KeyPostgresqlProjection,current:Document,backend:PostgresqlBackend):Promise<Document>{return copyJson((await verifyKeysPostgresqlProjection(input,current,backend)).source) as unknown as Document;}
