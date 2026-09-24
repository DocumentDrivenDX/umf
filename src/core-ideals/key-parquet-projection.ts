import {copyJson} from '../model/json';
import {UmfError,type Document,type Json,type Diagnostic} from '../model/types';
import {lookupCoreKey,verifyCoreKeyOperation,type CoreKeyDeclaration,type CoreRecordIdentity} from '../model/keys';
import type {CoreKeyDefinition,CoreKeyFieldReference} from '../validation/keys';
import {validateDocument} from '../validation/document';
import {importParquetSchema,getParquetFieldMetadata} from '../adapters/parquet/field-metadata';
import {parquetKeyFile} from './parquet-key-carrier';
import type {ParquetFacetCarrier} from './parquet-facet-carrier';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import nullability from '../../spec/core/nullability-document.schema.json';import cardinality from '../../spec/core/cardinality-document.schema.json';import facets from '../../spec/core/facet-document.schema.json';import keys from '../../spec/core/key-document.schema.json';import keyOperation from '../../spec/core/key-operation.schema.json';
import schema from '../../spec/core/key-parquet-projection.schema.json';
export {default as keyParquetProjectionSchema} from '../../spec/core/key-parquet-projection.schema.json';
export interface KeyParquetRequest {
 id:string;record:CoreRecordIdentity;recordName:string;mode:'strict'|'report';
 columns:{field:CoreRecordIdentity;name:string;carrier:ParquetFacetCarrier;fieldId?:number}[];
}
const binding=schema.properties.binding.const;
const recovery='Recover authored source from retained receipt; native import alone does not recover authored identity' as const;
export interface KeyParquetProjection {
 operation:'project-keys-parquet';version:'1.0.0';status:'projected'|'blocked';source:Document;authors:CoreKeyDeclaration[];request:KeyParquetRequest;binding:typeof binding;target?:Document;
 mappings:{keyId:string;keyName:string;idealPath:string;nativePaths:string[];columns:string[];primary:boolean;origin:'authored';enforcement:'not-expressible';outcome:'not-expressible'}[];
 residuals:{path:string;value:Json;reason:string;outcome:'unknown'|'not-expressible';recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
const validator=createValidator(false);for(const s of [legacy,fields,nullability,cardinality,facets,keys,keyOperation])validator.addSchema(s);
const check=validator.compile(schema),requestCheck=validator.compile(schema.properties.request);
const canonical=(v:Json):string=>Array.isArray(v)?'a['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'o{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k]!)).join(',')+'}':JSON.stringify(v);
const same=(a:unknown,b:unknown)=>canonical(copyJson(a))===canonical(copyJson(b));
const identity=(r:CoreRecordIdentity)=>JSON.stringify([r.module,r.element]);
function locate(source:Document,ref:CoreRecordIdentity){const mi=source.modules.findIndex(m=>m.id===ref.module),ei=source.modules[mi]?.elements.findIndex(e=>e.id===ref.element)??-1;if(mi<0||ei<0)throw new UmfError('KEY_PARQUET_REFERENCE','Unresolved element identity');return {element:source.modules[mi]!.elements[ei]!,path:`/modules/${mi}/elements/${ei}`};}
/** Consume verified declarations by stable ID. Native names never supply authored identity. */
export function projectKeysToParquet(input:Document,authorInput:CoreKeyDeclaration[],options:KeyParquetRequest):KeyParquetProjection {
 const source=copyJson(input) as unknown as Document,authors=copyJson(authorInput) as unknown as CoreKeyDeclaration[],request=copyJson(options) as unknown as KeyParquetRequest;
 if(!requestCheck(request))throw new UmfError('KEY_PARQUET_REQUEST',JSON.stringify(requestCheck.errors));
 if(source.umf!=='0.6.0'||!validateDocument(source).valid)throw new UmfError('KEY_PARQUET_SOURCE','Valid explicit core 0.6.0 required');
 const record=locate(source,request.record),declared=record.element.keys as CoreKeyDefinition[]|undefined,members=record.element.members as CoreKeyFieldReference[]|undefined;
 if(record.element.kind!=='record'||!declared?.length||!members?.length)throw new UmfError('KEY_PARQUET_RECORD','Selected Record must have authored keys and explicit membership');
 if(!Array.isArray(authors)||authors.length!==declared.length)throw new UmfError('KEY_PARQUET_AUTHORS','Exactly one verified declaration for every current key is required');
 const seen=new Set<string>();
 for(const author of authors){
  if(author.operation!=='declare-core-key')throw new UmfError('KEY_PARQUET_AUTHORS','Expected key declarations');
  verifyCoreKeyOperation(author,author.target);
  if(author.target.id!==source.id||identity(author.identity)!==identity(request.record)||seen.has(author.request.id))throw new UmfError('KEY_PARQUET_AUTHORS','Duplicate or mismatched author identity');seen.add(author.request.id);
  const current=lookupCoreKey(source,{...request.record,key:author.request.id}),prior=lookupCoreKey(author.target,{...request.record,key:author.request.id});
  if(!same(current.key,prior.key))throw new UmfError('KEY_PARQUET_STALE','Key meaning changed since declaration');
  // Unrelated later key declarations/list ordering may differ; component meaning may not.
  for(const ref of current.key.fields)if(!same(locate(source,ref).element,locate(author.target,ref).element))throw new UmfError('KEY_PARQUET_STALE','Key component changed since declaration');
  const priorMembers=locate(author.target,request.record).element.members as CoreKeyFieldReference[];
  for(const ref of current.key.fields){const now=members.find(m=>identity(m)===identity(ref)),then=priorMembers.find(m=>identity(m)===identity(ref));if(!same(now,then))throw new UmfError('KEY_PARQUET_STALE','Key ownership qualifier changed since declaration');}
 }
 const mapped=new Map<string,KeyParquetRequest['columns'][number]>(),names=new Set<string>();
 for(const column of request.columns){const id=identity(column.field);if(mapped.has(id)||names.has(column.name)||!members.some(m=>identity(m)===id))throw new UmfError('KEY_PARQUET_COLUMNS','Column identities and names must be unique and owned by the selected Record');mapped.set(id,column);names.add(column.name);}
 if(mapped.size!==members.length)throw new UmfError('KEY_PARQUET_COLUMNS','Map every owned Field explicitly');
 const result:KeyParquetProjection={operation:'project-keys-parquet',version:'1.0.0',status:'projected',source,authors,request,binding,mappings:[],residuals:[],diagnostics:[]};
 const loss=(path:string,value:unknown,reason:string,outcome:'unknown'|'not-expressible'='not-expressible')=>result.residuals.push({path,value:copyJson(value),reason,outcome,recovery});
 // The receipt is the explicit residual for context outside this Key-only lowering.
 loss('/',source,'Only selected Record scalar column carriers are emitted; all other metadata, native extensions, relationships and unknown content remain in this source residual');
 let impossible=false;let candidate:Document|undefined;
 try{candidate=importParquetSchema(parquetKeyFile(request.recordName,request.columns),{id:request.id});}
 catch(error){if(!(error instanceof UmfError))throw error;impossible=true;loss('/request',request,'Native carrier cannot be emitted: '+error.message);}
 const nativeFields=candidate?getParquetFieldMetadata(candidate).fields:[];
 for(const [index,column] of request.columns.entries()){
  const field=locate(source,column.field),e=field.element;
  if(e.kind!=='field'||e.cardinality!=='one'||e.itemType!==undefined||e.references?.some(r=>r.role==='record-type')||e.nullability!=='required'||candidate&&e.scalarType!==nativeFields[index]?.element.scalarType){impossible=true;loss(field.path,e,'This carrier binding requires a required singular scalar Field with matching native family; other shapes need explicit separate bindings');continue;}
  loss(field.path,e,'Native bounds, length/width facets, fixed-byte lower bounds, decimal annotations and unknown qualifiers do not replace the authored domain. The empty file is a schema carrier, not a row validator or exact input converter','unknown');
  if(e.scalarType==='integer')loss(field.path,e,'PyArrow 21 safe integer construction can truncate fractional input; native requiredness and integer storage do not establish exact writer input','unknown');
 }
 for(const key of declared){
  const current=lookupCoreKey(source,{...request.record,key:key.id}),columns=key.fields.map(ref=>mapped.get(identity(ref))!.name),primary=key.primary===true;
  const nativePaths=key.fields.map(ref=>'/schema/'+(1+request.columns.findIndex(c=>identity(c.field)===identity(ref))));
  result.mappings.push({keyId:key.id,keyName:key.name,idealPath:current.path,nativePaths,columns,primary,origin:'authored',enforcement:'not-expressible',outcome:'not-expressible'});
  loss(current.path,key,'Parquet has no native collection uniqueness or primary/alternate key declaration. Stable key IDs, names, ordered tuple and primary intent remain in this per-key residual; field order and metadata are not key enforcement');
 }
 if(impossible||request.mode==='strict')result.status='blocked';
 else result.target=candidate!;
 result.diagnostics=result.residuals.map(r=>({code:'KEY_PARQUET_LOSS',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const copied=copyJson(result);if(!check(copied))throw new UmfError('KEY_PARQUET_RESULT',JSON.stringify(check.errors));return copied as unknown as KeyParquetProjection;
}
/** Recompute projection and match current native representation; not source authentication. */
export function verifyKeysParquetProjection(input:KeyParquetProjection,current:Document):KeyParquetProjection {
 const receipt=copyJson(input) as unknown as KeyParquetProjection;
 if(!check(receipt)||receipt.status!=='projected')throw new UmfError('KEY_PARQUET_RECEIPT','Expected complete successful projection receipt');
 const expected=projectKeysToParquet(receipt.source,receipt.authors,receipt.request);
 if(!same(receipt,expected))throw new UmfError('KEY_PARQUET_RECEIPT','Receipt differs from retained author/source/request');
 if(!same(current,receipt.target))throw new UmfError('KEY_PARQUET_STALE','Native representation changed since projection');return receipt;
}
export function recoverKeysParquetIdeal(input:KeyParquetProjection,current:Document):Document{return copyJson(verifyKeysParquetProjection(input,current).source) as unknown as Document;}
