import {standaloneOpenapiObjectSchema as standalone} from './validation';
import schema31 from '../../../spec/extensions/openapi/upstream/3.1-schema.json';
import schema32 from '../../../spec/extensions/openapi/upstream/3.2-schema.json';
import {createValidator} from '../../validation/schema';
import {copyJson} from '../../model/json';
import {readJsonValue} from '../../model/serialization';
import {renderTree,type NativeJson} from '../../model/native-json';
import {UmfError,type Document} from '../../model/types';
import {inspectOpenapi,getOpenapiNode,lookupOpenapiResource,exportOpenapiBundle} from './index';
const kinds=['parameter','header','response','request-body','example','link','security-scheme'] as const;
export type OpenapiReferenceKind=typeof kinds[number];
export interface OpenapiReferenceRequest {pointer:string;kind:OpenapiReferenceKind;resourceUri?:string;}
export interface OpenapiReferenceResolution {
 kind:OpenapiReferenceKind;target:{uri:string;pointer:string;node:NativeJson};
 chain:{uri:string;pointer:string;reference:NativeJson}[];
 effectiveAnnotations:{summary?:string;description?:string};complete:false;limitations:string[];
}
const checkers=new Map<string,ReturnType<ReturnType<typeof createValidator>['compile']>>();
for(const [version,schema]of [['3.1',schema31],['3.2',schema32]] as const){
 const validator=createValidator(false);validator.addSchema(standalone(schema));
 for(const kind of [...kinds,'reference'])checkers.set(version+':'+kind,validator.compile({$ref:schema.$id+'#/$defs/'+kind}));
}
/** Resolve a caller-declared Reference Object role, without inferring Schema Object scope. */
export function resolveOpenapiObjectReference(document:Document,input:OpenapiReferenceRequest):OpenapiReferenceResolution {
 const options=copyJson(input) as unknown as OpenapiReferenceRequest;
 if(!kinds.includes(options.kind)||typeof options.pointer!=='string'||Object.keys(options).some(k=>!['pointer','kind','resourceUri'].includes(k)))throw new UmfError('OPENAPI_REFERENCE_KIND','A supported explicit Reference Object role and pointer are required');
 if(!inspectOpenapi(document).valid)throw new UmfError('OPENAPI_REFERENCE_SOURCE','Invalid owning description');
 const bundle=exportOpenapiBundle(document);if(!bundle.baseUri)throw new UmfError('OPENAPI_BASE_URI','Reference resolution requires the owning document base URI');
 const version=getOpenapiNode(document,'/openapi');if(version.kind!=='string'||!['3.1','3.2'].includes(version.value.slice(0,3)))throw new UmfError('OPENAPI_REFERENCE_VERSION','This Reference Object resolver requires OpenAPI 3.1 or 3.2');
 const minor=version.value.slice(0,3);
 // $self requires an identifier/resource index distinct from retrieval URI lookup.
 if(minor==='3.2'){
  const root=getOpenapiNode(document,'');if(root.kind==='object'&&root.members.$self)throw new UmfError('OPENAPI_REFERENCE_SCOPE','$self resource identity requires a schema-aware URI index');
 }
 let uri=options.resourceUri??bundle.baseUri;let path=options.pointer;
 let node=getOpenapiNode(document,path,uri);
 const result:OpenapiReferenceResolution={kind:options.kind,target:{uri,pointer:path,node},chain:[],effectiveAnnotations:{},complete:false,limitations:['The caller declares the Reference Object role; source position is not inferred','Nested references and embedded schema/dialect scopes are not resolved by this operation','Object syntax validation does not implement HTTP serialization, authorization or runtime behavior']};
 const seen=new Set<string>();
 for(let hops=0;hops<=128;hops++){
  const owner=getOpenapiNode(document,'',uri);
  if(owner.kind==='object'&&owner.members.$self&&owner.members.openapi?.kind==='string'&&owner.members.openapi.value.startsWith('3.2.'))throw new UmfError('OPENAPI_REFERENCE_SCOPE','Referenced document $self requires an identity-aware resource index');
  const identity=JSON.stringify([new URL(uri).href,path]);if(seen.has(identity))throw new UmfError('OPENAPI_REFERENCE_CYCLE','Reference Object chain has no concrete target');seen.add(identity);
  const value=readJsonValue(renderTree(node),'json') as any;
  if(!value||typeof value!=='object'||Array.isArray(value))throw new UmfError('OPENAPI_REFERENCE_TARGET','Reference Object target must be an object');
  if(Object.hasOwn(value,'$ref')){
   if(hops===128)throw new UmfError('OPENAPI_REFERENCE_LIMIT','Reference chain exceeds 128 hops');
   const check=checkers.get(minor+':reference')!;
   if(typeof value.$ref!=='string'||!check(value))throw new UmfError('OPENAPI_REFERENCE_OBJECT',JSON.stringify(check.errors));
   // Other keys are retained in the chain and are not merged into the target.
   result.chain.push({uri,pointer:path,reference:node});
   for(const key of ['summary','description'] as const)if(result.effectiveAnnotations[key]===undefined&&typeof value[key]==='string'&&(key==='description'||options.kind==='example'))result.effectiveAnnotations[key]=value[key];
   const next=lookupOpenapiResource(document,value.$ref,uri);uri=next.uri;path=next.pointer;node=next.node;continue;
  }
  if(!result.chain.length)throw new UmfError('OPENAPI_REFERENCE_OBJECT','The selected source node is not a Reference Object');
  const check=checkers.get(minor+':'+options.kind)!;if(!check(value))throw new UmfError('OPENAPI_REFERENCE_TARGET',JSON.stringify(check.errors));
  for(const key of ['summary','description'] as const)if(result.effectiveAnnotations[key]===undefined&&typeof value[key]==='string'&&(key==='description'||options.kind==='example'))result.effectiveAnnotations[key]=value[key];
  result.target={uri,pointer:path,node};return copyJson(result) as unknown as OpenapiReferenceResolution;
 }
 throw new UmfError('OPENAPI_REFERENCE_LIMIT','Reference chain exceeds 128 hops');
}
