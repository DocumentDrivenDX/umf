import {copyJson} from '../../model/json';
import {renderTree,type NativeJson} from '../../model/native-json';
import {UmfError,pointer,type Document,type Json} from '../../model/types';
import {inspectOpenapi,getOpenapiNode,exportOpenapiBundle} from './index';
import {openapiSchemaPositions} from './schemas';
export interface OpenapiSchemaLocation {retrievalUri:string;pointer:string;baseUri:string;dialect:string;}
export interface OpenapiSchemaIndex {locations:OpenapiSchemaLocation[];identifiers:Record<string,{retrievalUri:string;pointer:string}>;complete:false;limitations:string[];}
const dialects=new Set(['https://json-schema.org/draft/2020-12/schema','https://spec.openapis.org/oas/3.1/dialect/base','https://spec.openapis.org/oas/3.1/dialect/2024-11-10','https://spec.openapis.org/oas/3.2/dialect/2026-02-26']);
const single=['not','if','then','else','items','contains','additionalProperties','unevaluatedProperties','unevaluatedItems','propertyNames','contentSchema'];
const arrays=['allOf','anyOf','oneOf','prefixItems'];
const maps=['$defs','definitions','properties','patternProperties','dependentSchemas'];
/** Index supplied descriptions and explicitly declared standalone schema documents. */
export function indexOpenapiSchemas(document:Document,input:{schemaResources?:string[]}={}):OpenapiSchemaIndex {
 const options=copyJson(input) as unknown as {schemaResources?:string[]};
 if(Object.keys(options).some(k=>k!=='schemaResources')||options.schemaResources!==undefined&&(!Array.isArray(options.schemaResources)||options.schemaResources.some(x=>typeof x!=='string')))throw new UmfError('OPENAPI_SCOPE_OPTIONS','schemaResources must list explicitly supplied schema document URIs');
 if(!inspectOpenapi(document).valid)throw new UmfError('OPENAPI_SCOPE_SOURCE','Invalid owning description');
 const bundle=exportOpenapiBundle(document);if(!bundle.baseUri)throw new UmfError('OPENAPI_SCOPE_BASE','Schema indexing requires a retrieval URI');
 const supplied=[bundle.baseUri,...bundle.resources.map(r=>r.uri)];
 const standalone=new Set((options.schemaResources??[]).map(uri=>new URL(uri).href));
 for(const uri of standalone)if(!supplied.includes(uri)||uri===bundle.baseUri)throw new UmfError('OPENAPI_SCOPE_RESOURCE','Standalone schema must be an explicitly supplied resource');
 const result:OpenapiSchemaIndex={locations:[],identifiers:Object.create(null),complete:false,limitations:['Static schema scope only; dynamic references require evaluation-time scope','Unclassified resource fragments are retained but not indexed','Known dialect schema positions only; HTTP and instance evaluation are not implemented']};
 const identify=(id:string,retrievalUri:string,path:string)=>{
  const previous=result.identifiers[id];if(previous&&(previous.retrievalUri!==retrievalUri||previous.pointer!==path))throw new UmfError('OPENAPI_SCOPE_COLLISION','Ambiguous schema identity: '+id);
  result.identifiers[id]={retrievalUri,pointer:path};
 };
 function walk(node:NativeJson,uri:string,path:string,base:string,inherited:string){
  if(node.kind!=='object'&&node.kind!=='boolean')throw new UmfError('OPENAPI_SCOPE_SCHEMA','Invalid schema at '+path);
  const m=node.kind==='object'?node.members:{};
  const string=(key:string)=>{const n=m[key];if(n&&n.kind!=='string')throw new UmfError('OPENAPI_SCOPE_KEYWORD','Expected string '+key);return n?.kind==='string'?n.value:undefined;};
  const dialect=string('$schema')??inherited;if(!dialects.has(dialect))throw new UmfError('OPENAPI_SCOPE_DIALECT','Cannot infer schema positions for dialect '+dialect);
  const id=string('$id');if(id!==undefined){const resolved=new URL(id,base);if(resolved.hash)throw new UmfError('OPENAPI_SCOPE_ID','Schema ID cannot contain a nonempty fragment');base=resolved.href.replace(/#$/,'');identify(base,uri,path);}
  result.locations.push({retrievalUri:uri,pointer:path,baseUri:base,dialect});
  for(const key of ['$anchor','$dynamicAnchor']){const name=string(key);if(name!==undefined){if(!/^[A-Za-z_][-A-Za-z0-9._]*$/.test(name))throw new UmfError('OPENAPI_SCOPE_ANCHOR','Invalid schema anchor');identify(base+'#'+name,uri,path);}}
  const child=(n:NativeJson,p:string)=>walk(n,uri,p,base,dialect);
  for(const key of single)if(m[key])child(m[key]!,path+'/'+key);
  for(const key of arrays)if(m[key]?.kind==='array')m[key].items.forEach((n,i)=>child(n,path+'/'+key+'/'+i));
  for(const key of maps)if(m[key]?.kind==='object')for(const [k,n]of Object.entries(m[key].members))child(n,path+'/'+key+'/'+pointer(k));
  if(m.dependencies?.kind==='object')for(const [k,n]of Object.entries(m.dependencies.members))if(n.kind!=='array')child(n,path+'/dependencies/'+pointer(k));
 }
 for(const uri of supplied){
  const root=getOpenapiNode(document,'',uri);const m=root.kind==='object'?root.members:{};
  if(standalone.has(uri)){
   if(m.$schema?.kind!=='string')throw new UmfError('OPENAPI_SCOPE_DIALECT','Standalone schema requires explicit $schema');
   identify(uri,uri,'');walk(root,uri,'',uri,m.$schema.value);continue;
  }
  const version=m.openapi;if(version?.kind!=='string'||!/^3\.[12]\./.test(version.value)){if(uri===bundle.baseUri)throw new UmfError('OPENAPI_SCOPE_VERSION','Schema indexing requires OpenAPI 3.1/3.2');continue;}
  let base=uri;
  if(version.value.startsWith('3.2.')&&m.$self){if(m.$self.kind!=='string')throw new UmfError('OPENAPI_SCOPE_SELF','Invalid $self');const id=new URL(m.$self.value,uri);if(id.hash)throw new UmfError('OPENAPI_SCOPE_SELF','$self cannot contain a fragment');base=id.href.replace(/#$/,'');}
  identify(uri,uri,'');identify(base,uri,'');
  const dialect=m.jsonSchemaDialect?.kind==='string'?m.jsonSchemaDialect.value:version.value.startsWith('3.1.')?'https://spec.openapis.org/oas/3.1/dialect/base':'https://spec.openapis.org/oas/3.2/dialect/2026-02-26';
  for(const entry of openapiSchemaPositions(JSON.parse(renderTree(root)) as Json))walk(getOpenapiNode(document,entry.pointer,uri),uri,entry.pointer,base,dialect);
 }
 return result;
}
export function resolveOpenapiSchemaReference(document:Document,input:{pointer:string;reference:string;resourceUri?:string;schemaResources?:string[]}){
 const options=copyJson(input) as unknown as typeof input;
 if(typeof options.pointer!=='string'||typeof options.reference!=='string'||Object.keys(options).some(k=>!['pointer','reference','resourceUri','schemaResources'].includes(k)))throw new UmfError('OPENAPI_SCOPE_OPTIONS','A source schema pointer and static reference are required');
 const index=indexOpenapiSchemas(document,options.schemaResources?{schemaResources:options.schemaResources}:{});
 const uri=options.resourceUri===undefined?exportOpenapiBundle(document).baseUri!:new URL(options.resourceUri).href;
 const source=index.locations.find(p=>p.retrievalUri===uri&&p.pointer===options.pointer);if(!source)throw new UmfError('OPENAPI_SCOPE_POSITION','Source must be an indexed schema position');
 const url=new URL(options.reference,source.baseUri);const fragment=decodeURIComponent(url.hash.slice(1));url.hash='';
 const identity=url.href+(fragment&&!fragment.startsWith('/')?'#'+fragment:'');
 let root=index.identifiers[identity];
 if(!root&&fragment&&!fragment.startsWith('/')){
  const resource=index.identifiers[url.href];
  if(resource)for(const [alias,location]of Object.entries(index.identifiers))if(!alias.includes('#')&&location.retrievalUri===resource.retrievalUri&&location.pointer===resource.pointer&&index.identifiers[alias+'#'+fragment])root=index.identifiers[alias+'#'+fragment];
 }
 if(!root)throw new UmfError('OPENAPI_SCOPE_MISSING','Reference identity is not indexed: '+identity);
 const path=root.pointer+(fragment.startsWith('/')?fragment:'');
 const target=index.locations.find(p=>p.retrievalUri===root.retrievalUri&&p.pointer===path);if(!target)throw new UmfError('OPENAPI_SCOPE_POSITION','Target is not an indexed schema position');
 return {source,target,node:getOpenapiNode(document,path,target.retrievalUri),complete:false as const,limitations:index.limitations};
}
