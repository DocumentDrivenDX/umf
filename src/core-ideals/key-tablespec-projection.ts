import {copyJson} from '../model/json';
import {UmfError,type Document,type Json,type Diagnostic} from '../model/types';
import {lookupCoreKey,verifyCoreKeyOperation,type CoreKeyDeclaration,type CoreRecordIdentity} from '../model/keys';
import type {CoreKeyDefinition,CoreKeyFieldReference} from '../validation/keys';
import {validateDocument} from '../validation/document';
import {importTableSpec} from '../adapters/tablespec';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import nullability from '../../spec/core/nullability-document.schema.json';import cardinality from '../../spec/core/cardinality-document.schema.json';import facets from '../../spec/core/facet-document.schema.json';import keys from '../../spec/core/key-document.schema.json';import keyOperation from '../../spec/core/key-operation.schema.json';
import schema from '../../spec/core/key-tablespec-projection.schema.json';
export {default as keyTableSpecProjectionSchema} from '../../spec/core/key-tablespec-projection.schema.json';
export interface KeyTableSpecRequest {
 id:string;record:CoreRecordIdentity;tableName:string;mode:'strict'|'report';
 columns:{field:CoreRecordIdentity;name:string;nativeType:'BOOLEAN'|'INTEGER'|'DECIMAL'|'TEXT'|'VARCHAR'|'CHAR'|'FLOAT'|'DATE'|'DATETIME'|'TIMESTAMP'}[];
}
const binding=schema.properties.binding.const;
const recovery='Recover authored source from retained receipt; native import alone does not recover authored identity' as const;
export interface KeyTableSpecProjection {
 operation:'project-keys-tablespec';version:'1.0.0';status:'projected'|'blocked';source:Document;authors:CoreKeyDeclaration[];request:KeyTableSpecRequest;binding:typeof binding;target?:Document;
 mappings:{keyId:string;keyName:string;idealPath:string;nativePath:string;columns:string[];primary:boolean;outcome:'not-expressible'}[];
 residuals:{path:string;value:Json;reason:string;outcome:'unknown'|'not-expressible';recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
const validator=createValidator(false);for(const s of [legacy,fields,nullability,cardinality,facets,keys,keyOperation])validator.addSchema(s);
const check=validator.compile(schema),requestCheck=validator.compile(schema.properties.request);
const canonical=(v:Json):string=>Array.isArray(v)?'a'+JSON.stringify(v.map(canonical)):v!==null&&typeof v==='object'?'o'+JSON.stringify(Object.keys(v).sort().map(k=>[k,canonical(v[k]!)])):JSON.stringify(v);
const same=(a:unknown,b:unknown)=>canonical(copyJson(a))===canonical(copyJson(b));
const identity=(r:CoreRecordIdentity)=>JSON.stringify([r.module,r.element]);
function locate(source:Document,ref:CoreRecordIdentity){const mi=source.modules.findIndex(m=>m.id===ref.module),ei=source.modules[mi]?.elements.findIndex(e=>e.id===ref.element)??-1;if(mi<0||ei<0)throw new UmfError('KEY_TABLESPEC_REFERENCE','Unresolved element identity');return {element:source.modules[mi]!.elements[ei]!,path:`/modules/${mi}/elements/${ei}`};}
/** Consume verified declarations by stable ID. Native names never supply authored identity. */
export function projectKeysToTableSpec(input:Document,authorInput:CoreKeyDeclaration[],options:KeyTableSpecRequest):KeyTableSpecProjection {
 const source=copyJson(input) as unknown as Document,authors=copyJson(authorInput) as unknown as CoreKeyDeclaration[],request=copyJson(options) as unknown as KeyTableSpecRequest;
 if(!requestCheck(request))throw new UmfError('KEY_TABLESPEC_REQUEST',JSON.stringify(requestCheck.errors));
 if(source.umf!=='0.6.0'||!validateDocument(source).valid)throw new UmfError('KEY_TABLESPEC_SOURCE','Valid explicit core 0.6.0 required');
 const record=locate(source,request.record),declared=record.element.keys as CoreKeyDefinition[]|undefined,members=record.element.members as CoreKeyFieldReference[]|undefined;
 if(record.element.kind!=='record'||!declared?.length||!members?.length)throw new UmfError('KEY_TABLESPEC_RECORD','Selected Record must have authored keys and explicit membership');
 if(!Array.isArray(authors)||authors.length!==declared.length)throw new UmfError('KEY_TABLESPEC_AUTHORS','Exactly one verified declaration for every current key is required');
 const seen=new Set<string>();
 for(const author of authors){
  if(author.operation!=='declare-core-key')throw new UmfError('KEY_TABLESPEC_AUTHORS','Expected key declarations');
  verifyCoreKeyOperation(author,author.target);
  if(author.target.id!==source.id||identity(author.identity)!==identity(request.record)||seen.has(author.request.id))throw new UmfError('KEY_TABLESPEC_AUTHORS','Duplicate or mismatched author identity');seen.add(author.request.id);
  const current=lookupCoreKey(source,{...request.record,key:author.request.id}),prior=lookupCoreKey(author.target,{...request.record,key:author.request.id});
  if(!same(current.key,prior.key))throw new UmfError('KEY_TABLESPEC_STALE','Key meaning changed since declaration');
  // Unrelated later key declarations/list ordering may differ; component meaning may not.
  for(const ref of current.key.fields)if(!same(locate(source,ref).element,locate(author.target,ref).element))throw new UmfError('KEY_TABLESPEC_STALE','Key component changed since declaration');
  const priorMembers=locate(author.target,request.record).element.members as CoreKeyFieldReference[];
  for(const ref of current.key.fields){const now=members.find(m=>identity(m)===identity(ref)),then=priorMembers.find(m=>identity(m)===identity(ref));if(!same(now,then))throw new UmfError('KEY_TABLESPEC_STALE','Key ownership qualifier changed since declaration');}
 }
 const mapped=new Map<string,KeyTableSpecRequest['columns'][number]>(),names=new Set<string>();
 for(const column of request.columns){const id=identity(column.field);if(mapped.has(id)||names.has(column.name)||!members.some(m=>identity(m)===id))throw new UmfError('KEY_TABLESPEC_COLUMNS','Column identities and names must be unique and owned by the selected Record');mapped.set(id,column);names.add(column.name);}
 if(mapped.size!==members.length)throw new UmfError('KEY_TABLESPEC_COLUMNS','Map every owned Field explicitly');
 const result:KeyTableSpecProjection={operation:'project-keys-tablespec',version:'1.0.0',status:'projected',source,authors,request,binding,mappings:[],residuals:[],diagnostics:[]};
 const loss=(path:string,value:unknown,reason:string,outcome:'unknown'|'not-expressible'='not-expressible')=>result.residuals.push({path,value:copyJson(value),reason,outcome,recovery});
 // The receipt is the explicit residual for context outside this Key-only lowering.
 loss('/',source,'Only selected Record column carriers and key tuple declarations are emitted; all other metadata, native extensions, relationships and unknown content remain in this source residual');
 const native:Record<string,Json>={version:'1.0',table_name:request.tableName,columns:[]};let impossible=false;
 const nativeName=(name:string)=>name.length<=128&&/^[A-Za-z][A-Za-z0-9_]*(?![\s\S])/.test(name);
 if(!nativeName(request.tableName)){impossible=true;loss('/request/tableName',request.tableName,'Pinned TableSpec requires an ASCII letter followed by ASCII letters, digits or underscores, at most 128 characters; no name normalization is permitted');}
 const families:Record<string,string>={BOOLEAN:'boolean',INTEGER:'integer',DECIMAL:'decimal',TEXT:'string',VARCHAR:'string',CHAR:'string',FLOAT:'float',DATE:'date',DATETIME:'timestamp',TIMESTAMP:'timestamp'};
 for(const [columnIndex,column] of request.columns.entries()){
  if(!nativeName(column.name)){impossible=true;loss('/request/columns/'+columnIndex+'/name',column.name,'Native column name violates pinned TableSpec identifier syntax or 128-character bound; report cannot emit an invalid declaration');}
  const field=locate(source,column.field),e=field.element;
  if(e.scalarType!==families[column.nativeType]||e.kind!=='field'||e.cardinality!=='one'||e.itemType!==undefined||e.references?.some(r=>r.role==='record-type')){impossible=true;loss(field.path,e,'Selected native scalar carrier conflicts with Field shape or scalar family');continue;}
  const n:Record<string,Json>={name:column.name,data_type:column.nativeType};
  if(e.nullability==='required')n.nullable={default:false};
  else loss(field.path+'/nullability',e.nullability??null,'Unspecified or absent-allowed availability has no automatic contextual-nullability binding');
  const f=e.facets as Record<string,Json>|undefined;
  if(f&&column.nativeType==='DECIMAL'&&f.precision!==undefined&&f.scale!==undefined){n.precision=f.precision;n.scale=f.scale;}
  (native.columns as Json[]).push(n);
  loss(field.path,e,'Native type/nullability/facet declarations are carriers only; runtime domains, exact input, unknown qualifiers and core requiredness need independently qualified bindings','unknown');
 }
 const alternates:Json[]=[];
 for(const key of declared){
  const current=lookupCoreKey(source,{...request.record,key:key.id}),columns=key.fields.map(ref=>mapped.get(identity(ref))!.name),primary=key.primary===true;
  const nativePath=primary?'/primary_key':'/unique_constraints/'+alternates.length;
  if(primary)native.primary_key=columns;else alternates.push(columns);
  result.mappings.push({keyId:key.id,keyName:key.name,idealPath:current.path,nativePath,columns,primary,outcome:'not-expressible'});
  loss(current.path,key,'Tuple declaration does not carry stable key ID/name, exact comparator, requiredness or enforced identity; alternate and primary intent recover only with this per-key residual');
 }
 if(alternates.length)native.unique_constraints=alternates;
 if(impossible||request.mode==='strict')result.status='blocked';
 else result.target=importTableSpec(JSON.stringify(native),{id:request.id,format:'json'});
 result.diagnostics=result.residuals.map(r=>({code:'KEY_TABLESPEC_LOSS',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const copied=copyJson(result);if(!check(copied))throw new UmfError('KEY_TABLESPEC_RESULT',JSON.stringify(check.errors));return copied as unknown as KeyTableSpecProjection;
}
/** Recompute projection and match current native representation; not source authentication. */
export function verifyKeysTableSpecProjection(input:KeyTableSpecProjection,current:Document):KeyTableSpecProjection {
 const receipt=copyJson(input) as unknown as KeyTableSpecProjection;
 if(!check(receipt)||receipt.status!=='projected')throw new UmfError('KEY_TABLESPEC_RECEIPT','Expected complete successful projection receipt');
 const expected=projectKeysToTableSpec(receipt.source,receipt.authors,receipt.request);
 if(!same(receipt,expected))throw new UmfError('KEY_TABLESPEC_RECEIPT','Receipt differs from retained author/source/request');
 if(!same(current,receipt.target))throw new UmfError('KEY_TABLESPEC_STALE','Native representation changed since projection');return receipt;
}
export function recoverKeysTableSpecIdeal(input:KeyTableSpecProjection,current:Document):Document{return copyJson(verifyKeysTableSpecProjection(input,current).source) as unknown as Document;}
