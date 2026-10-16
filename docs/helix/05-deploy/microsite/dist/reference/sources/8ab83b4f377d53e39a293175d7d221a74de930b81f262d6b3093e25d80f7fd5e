import manifest from '../../../spec/extensions/postgresql-catalog/package.json';
import {derivePostgresqlColumns} from './column-metadata';
export type {PostgresqlColumnMetadata} from './column-metadata';
import schema from '../../../spec/extensions/postgresql-catalog/capture.schema.json';
import {Registry} from '../../registry/registry';
import {validateDocument} from '../../validation/document';
import {createValidator} from '../../validation/schema';
import {copyJson} from '../../model/json';
import {catalogIntegerErrors} from '../../validation/catalog-integers';
import {parseNativeJson,renderTree,nativePointer,treeChild,type NativeJson} from '../../model/native-json';
import {UmfError,type Document,type Json,type Diagnostic,type ExtensionPackage} from '../../model/types';
export const POSTGRESQL_CATALOG_EXTENSION='umf.postgresql.catalog';
export const postgresqlCatalogPackage=manifest as unknown as ExtensionPackage;
type Payload={profile:'postgresql-catalog-capture';state:'captured'|'modified';root:NativeJson};
let check:ReturnType<ReturnType<typeof createValidator>['compile']>|undefined;
function inspect(value:Json):Diagnostic[]{
 const p=value as unknown as Payload;const diagnostics:Diagnostic[]=[{code:'POSTGRESQL_CATALOG_SCOPE',path:'',severity:'warning',message:'Observed metadata is limited to the declared query/profile; server state and reconstruction correspondence are not verified'}];
 const warn=(code:string,path:string,message:string)=>diagnostics.push({code,path,severity:'warning',message});
 if(Object.keys(p).some(k=>!['profile','state','root'].includes(k)))warn('POSTGRESQL_CATALOG_REPRESENTATION','','Unknown representation fields must stay in UMF');
 function tagged(n:NativeJson,path:string){
  const keys=n.kind==='null'?['kind']:n.kind==='object'?['kind','members']:n.kind==='array'?['kind','items']:['kind','value'];
  if(Object.keys(n).some(k=>!keys.includes(k)))warn('POSTGRESQL_CATALOG_REPRESENTATION',path,'Unknown tagged representation fields must stay in UMF');
  if(n.kind==='object')for(const [k,v] of Object.entries(n.members))tagged(v,path+'/'+k);
  if(n.kind==='array')n.items.forEach((v,i)=>tagged(v,path+'/'+i));
 }
 tagged(p.root,'/root');
 for(const path of catalogIntegerErrors(p.root,schema))diagnostics.push({code:'POSTGRESQL_CATALOG_INTEGER',path,severity:'error',message:'Declared catalog integers must be exact interoperable integers; numeric rounding is not permitted'});
 if(diagnostics.some(d=>d.severity==='error'))return diagnostics;
 // This host view is validation-only. The exact tagged tree remains authoritative.
 const view=JSON.parse(renderTree(p.root));if(view?.state!==p.state)diagnostics.push({code:'POSTGRESQL_CATALOG_STATE',path:'/root',severity:'error',message:'Capture and representation state must agree'});check??=createValidator(false).compile(schema);
 if(!check(view))for(const e of check.errors??[])diagnostics.push({code:'POSTGRESQL_CATALOG_STRUCTURE',path:e.instancePath,severity:'error',message:e.message??'Invalid captured metadata'});
 function unknown(v:any,s:any,path:string){
  if(s.$ref)s=(schema.$defs as any)[s.$ref.slice('#/$defs/'.length)];
  if(s.anyOf){const branch=s.anyOf.find((b:any)=>b.$ref&&v!==null);if(branch)unknown(v,branch,path);return;}
  if(Array.isArray(v)&&s.items){v.forEach((x,i)=>unknown(x,s.items,path+'/'+i));return;}
  if(v&&typeof v==='object'&&s.properties)for(const k of Object.keys(v)){if(!Object.hasOwn(s.properties,k))warn('POSTGRESQL_CATALOG_UNKNOWN',path+'/'+k,'Unknown native capture field retained without interpretation');else unknown(v[k],s.properties[k],path+'/'+k);}
 }
 unknown(view,schema,'');
 if(view?.serverVersion!==170004)warn('POSTGRESQL_CATALOG_VERSION','/serverVersion','Capture version retained; executed evidence currently covers PostgreSQL 17.4 only');
 if(p.state==='modified')warn('POSTGRESQL_CATALOG_MODIFIED','','Capture has candidate edits; its reconstruction archive is not synchronized');
 return diagnostics;
}
export function postgresqlCatalogRegistry(){return new Registry().register(postgresqlCatalogPackage,inspect);}
export function inspectPostgresqlCatalog(document:Document){return validateDocument(document,postgresqlCatalogRegistry());}
function payload(document:Document):Payload{
 const validation=inspectPostgresqlCatalog(document);if(!validation.valid)throw new UmfError('POSTGRESQL_CATALOG_DOCUMENT',JSON.stringify(validation.diagnostics));
 const p=document.modules.find(m=>m.id==='catalog')?.elements.find(e=>e.id==='capture')?.extensions[POSTGRESQL_CATALOG_EXTENSION];
 if(!p||document.vocabularies[POSTGRESQL_CATALOG_EXTENSION]?.version!=='0.1.0')throw new UmfError('POSTGRESQL_CATALOG_PAYLOAD','Expected catalog capture');return copyJson(p) as unknown as Payload;
}
export function importPostgresqlCatalogCapture(text:string,options:{id:string}):Document{
 const root=parseNativeJson(text);const state=root.kind==='object'&&root.members.state?.kind==='string'?root.members.state.value:'captured';
 const document:Document={umf:'0.1.0',id:options.id,vocabularies:{[POSTGRESQL_CATALOG_EXTENSION]:{version:'0.1.0'}},modules:[{id:'catalog',namespace:'',elements:[{id:'capture',extensions:{[POSTGRESQL_CATALOG_EXTENSION]:{profile:'postgresql-catalog-capture',state,root} as unknown as Json}}]}]};payload(document);document.modules.push({id:'postgresql.columns',namespace:'',elements:derivePostgresqlColumns(root).map(c=>c.element)});return document;
}
export function getPostgresqlColumnMetadata(document:Document){return derivePostgresqlColumns(payload(document).root);}
function checkColumnMetadata(document:Document){
 const module=document.modules.find(m=>m.id==='postgresql.columns');if(!module)return;
 const expected=getPostgresqlColumnMetadata(document).map(c=>c.element);
 if(module.namespace!==''||module.elements.length!==expected.length||expected.some((e,i)=>['id','name','description','scalarType'].some(k=>module.elements[i]?.[k]!==e[k])))throw new UmfError('POSTGRESQL_COLUMN_METADATA','Native columns and core metadata disagree');
}
/** Export the entire native capture, preserving unknown fields and exact numbers. */
export function exportPostgresqlCatalogCapture(document:Document){
 checkColumnMetadata(document);
 const p=payload(document);if(inspectPostgresqlCatalog(document).diagnostics.some(d=>d.code==='POSTGRESQL_CATALOG_REPRESENTATION'))throw new UmfError('POSTGRESQL_CATALOG_EXPORT','Unknown representation fields cannot be discarded');
 return {state:p.state,json:renderTree(p.root),complete:false as const};
}
export function getPostgresqlCatalogNode(document:Document,path:string){let n=payload(document).root;for(const part of nativePointer(path))n=treeChild(n,part);return copyJson(n) as unknown as NativeJson;}
/** Returns native observations, including unknown fields; no entity/table equivalence. */
export function findPostgresqlCatalogRelation(document:Document,qualified:{schema:string;name:string}){
 const relations=getPostgresqlCatalogNode(document,'/snapshot/relations');if(relations.kind==='null')return undefined;
 if(relations.kind!=='array')throw new UmfError('POSTGRESQL_CATALOG_RELATIONS','Expected relation observations');
 const matches=relations.items.filter(n=>n.kind==='object'&&n.members.schema?.kind==='string'&&n.members.schema.value===qualified.schema&&n.members.name?.kind==='string'&&n.members.name.value===qualified.name);
 if(matches.length>1)throw new UmfError('POSTGRESQL_CATALOG_AMBIGUOUS','Duplicate qualified relation observations');return matches[0];
}
export function proposePostgresqlCatalogEdit(document:Document,path:string,text:string){
 exportPostgresqlCatalogCapture(document);
 const p=payload(document);const replacement=parseNativeJson(text),parts=nativePointer(path);p.state='modified';
 if(!parts.length)p.root=replacement;else{let n=p.root;for(const key of parts.slice(0,-1))n=treeChild(n,key);const key=parts.at(-1)!;treeChild(n,key);if(n.kind==='object')n.members[key]=replacement;else if(n.kind==='array')n.items[Number(key)]=replacement;else throw new UmfError('POSTGRESQL_CATALOG_EDIT','Expected existing node');}
 if(p.root.kind!=='object')throw new UmfError('POSTGRESQL_CATALOG_EDIT','Capture root must remain an object');p.root.members.state={kind:'string',value:'modified'};
 const next=copyJson(document) as unknown as Document;next.modules.find(m=>m.id==='catalog')!.elements.find(e=>e.id==='capture')!.extensions[POSTGRESQL_CATALOG_EXTENSION]=p as unknown as Json;payload(next);
 const module=next.modules.find(m=>m.id==='postgresql.columns');if(module){
  const before=getPostgresqlColumnMetadata(document),after=getPostgresqlColumnMetadata(next),previous=new Map(module.elements.map(e=>[e.id,e]));
  const attached=(e:typeof module.elements[number])=>Object.keys(e.extensions).length||Object.keys(e).some(k=>!['id','name','description','scalarType','extensions'].includes(k));
  for(const old of before){const e=previous.get(old.element.id)!;const current=after.find(c=>c.element.id===e.id);if(attached(e)&&(!current||current.element.name!==old.element.name||JSON.stringify(current.relation)!==JSON.stringify(old.relation)))throw new UmfError('POSTGRESQL_COLUMN_METADATA','Column identity changed with attached metadata; explicit reassociation required');}
  module.elements=after.map(c=>{const e=c.element,old=previous.get(e.id);if(!old)return e;delete old.description;delete old.scalarType;return {...old,...e,extensions:old.extensions};});
 }
 return {document:next,validation:inspectPostgresqlCatalog(next)};
}
/** Original archive only; the caller must still verify correspondence and server prerequisites. */
export function getPostgresqlCatalogReconstruction(document:Document){
 const p=payload(document);if(p.state!=='captured')throw new UmfError('POSTGRESQL_CATALOG_STALE','Edited catalog metadata does not synchronize reconstruction SQL');
 const n=getPostgresqlCatalogNode(document,'/reconstruction/sql');if(n.kind!=='string')throw new UmfError('POSTGRESQL_CATALOG_SQL','Expected SQL archive');
 return {sql:n.value,complete:false as const,provenance:'original-capture-archive' as const};
}
export interface PostgresqlCatalogObjectIdentity {catalog:string;type:string;identity:string;}
/** Observed pg_depend edges only. Missing coverage is distinct from no matches.
 * Native dependency kinds and multiplicity are retained; this is not a DDL plan. */
export function queryPostgresqlCatalogDependencies(document:Document,filter?:{side:'dependent'|'referenced';object:PostgresqlCatalogObjectIdentity}){
 const p=payload(document);const snapshot=treeChild(p.root,'snapshot');
 if(snapshot.kind!=='object')throw new UmfError('POSTGRESQL_CATALOG_DEPENDENCIES','Expected snapshot');
 if(filter&&( !['dependent','referenced'].includes(filter.side)||!filter.object||['catalog','type','identity'].some(k=>typeof (filter.object as any)[k]!=='string')))throw new UmfError('POSTGRESQL_CATALOG_DEPENDENCIES','Expected native catalog/type/identity and dependency side');
 const dependencies=snapshot.members.dependencies;
 if(!dependencies)return {available:false,complete:false as const,state:p.state,edges:[] as NativeJson[]};
 if(dependencies.kind!=='array')throw new UmfError('POSTGRESQL_CATALOG_DEPENDENCIES','Expected captured edge array');
 const edges=dependencies.items.filter(edge=>{
  if(!filter)return true;if(edge.kind!=='object')return false;const endpoint=edge.members[filter.side];if(endpoint?.kind!=='object')return false;
  return (['catalog','type','identity'] as const).every(k=>{const node=endpoint.members[k];return node?.kind==='string'&&node.value===filter.object[k];});
 });
 return {available:true,complete:false as const,state:p.state,edges};
}
