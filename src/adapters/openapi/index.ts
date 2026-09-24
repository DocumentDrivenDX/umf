import {standaloneOpenapiObjectSchema as standalone} from './validation';
import {inspectEmbeddedSchemas} from './schemas';
import AjvDraft04 from 'ajv-draft-04';
import schema30 from '../../../spec/extensions/openapi/upstream/3.0-schema.json';
import schema20 from '../../../spec/extensions/openapi/upstream/2.0-schema.json';
import manifest from '../../../spec/extensions/openapi/package.json';
import schema31 from '../../../spec/extensions/openapi/upstream/3.1-schema.json';
import schema32 from '../../../spec/extensions/openapi/upstream/3.2-schema.json';
import {createValidator,installJsonEquality} from '../../validation/schema';
import {Registry} from '../../registry/registry';
import {validateDocument} from '../../validation/document';
import {copyJson,LIMITS} from '../../model/json';
import {readJsonValue} from '../../model/serialization';
import {UmfError,pointer,type Document,type Json,type Diagnostic,type ExtensionPackage} from '../../model/types';
import {parseNativeJson,parseNativeYaml,renderTree,cloneTree,nativePointer,treeChild,type NativeJson} from '../../model/native-json';
export const OPENAPI_EXTENSION='umf.openapi';
export const openapiPackage=manifest as unknown as ExtensionPackage;
export interface OpenapiResource {uri:string;root:NativeJson;originalSource:string;originalFormat:'json'|'yaml';}
export interface OpenapiPayload {baseUri?:string;resources?:OpenapiResource[];profile:'openapi-json-yaml-0.1';root:NativeJson;originalSource:string;originalFormat:'json'|'yaml';}
const structure=createValidator().compile(manifest.schema);
function legacyValidator(schema:object){const validator=new AjvDraft04({allErrors:true,strict:false,ownProperties:true,validateFormats:false});installJsonEquality(validator);return validator.compile(schema);}
const nativeValidators={'2.0':legacyValidator(schema20),'3.0':legacyValidator(schema30),'3.1':createValidator(false).compile(standalone(schema31)),'3.2':createValidator(false).compile(standalone(schema32))};
const parse=(text:string,format:'json'|'yaml')=>format==='json'?parseNativeJson(text):parseNativeYaml(text);
function inspect(value:Json):Diagnostic[]{
 const p=value as unknown as OpenapiPayload;const out:Diagnostic[]=[];
 const warn=(code:string,path:string,message:string)=>out.push({code,path,message,severity:'warning'});
 for(const key of Object.keys(p))if(!['profile','root','originalSource','originalFormat','baseUri','resources'].includes(key))warn('OPENAPI_REPRESENTATION','/'+pointer(key),'Unknown representation field cannot be emitted natively');
 function walk(node:NativeJson,path:string){
  const keys=node.kind==='object'?['kind','members']:node.kind==='array'?['kind','items']:node.kind==='null'?['kind']:['kind','value'];
  for(const key of Object.keys(node))if(!keys.includes(key))warn('OPENAPI_REPRESENTATION',path+'/'+pointer(key),'Unknown tree encoding field cannot be emitted natively');
  if(node.kind==='object')for(const [key,item]of Object.entries(node.members))walk(item,path+'/members/'+pointer(key));
  if(node.kind==='array')node.items.forEach((item,i)=>walk(item,path+'/items/'+i));
 }
 walk(p.root,'/root');
 const uris=new Set<string>();
 try{if(p.baseUri)uris.add(documentUri(p.baseUri));}catch(error){out.push({code:'OPENAPI_RESOURCE_URI',path:'/baseUri',severity:'error',message:String(error)});}
 for(const [index,resource] of (p.resources??[]).entries()){
  const path='/resources/'+index;
  for(const key of Object.keys(resource))if(!['uri','root','originalSource','originalFormat'].includes(key))warn('OPENAPI_REPRESENTATION',path+'/'+pointer(key),'Unknown resource field cannot be emitted natively');
  walk(resource.root,path+'/root');
  try{const uri=documentUri(resource.uri);if(uris.has(uri))throw new Error('Duplicate document URI');uris.add(uri);parse(resource.originalSource,resource.originalFormat);}catch(error){out.push({code:'OPENAPI_RESOURCE',path,severity:'error',message:String(error)});}
 }
 if(p.resources?.length)warn('OPENAPI_RESOURCE_CONTEXT','/resources','Explicit resources are retained; URI/pointer lookup does not validate their contextual types, nested schema IDs, anchors, dynamic scope or reference closure');
 try{parse(p.originalSource,p.originalFormat);}catch(error){out.push({code:'OPENAPI_ARCHIVE',path:'/originalSource',severity:'error',message:String(error)});}
 if(p.root.kind!=='object'){out.push({code:'OPENAPI_ROOT',path:'/root',severity:'error',message:'OpenAPI description must be an object'});return out;}
 const version=p.root.members.openapi??p.root.members.swagger;
 if(version?.kind!=='string'){out.push({code:'OPENAPI_VERSION',path:'/root',severity:'error',message:'Native openapi or swagger version must be a string'});return out;}
 const prefix=version.value.slice(0,3);const validator=nativeValidators[prefix as keyof typeof nativeValidators];
 if(!validator){warn('OPENAPI_VERSION_UNSUPPORTED','/root','Native version retained without interpretation: '+version.value);return out;}
 let native:Json;
 try{native=readJsonValue(renderTree(p.root),'json');}catch(error){warn('OPENAPI_NUMERIC','/root','Exact numeric tokens retained; host interpretation unavailable: '+String(error));return out;}
 if(!validator(native))for(const error of validator.errors??[])out.push({code:'OPENAPI_OBJECT_SCHEMA',path:'/root'+error.instancePath,severity:'error',message:error.message??'Invalid OpenAPI object'});
 out.push(...inspectEmbeddedSchemas(native));
 warn('OPENAPI_VALIDATION_LIMIT','/root','Pinned official-schema checks do not prove reference resolution, URI formats, security execution, parameter serialization or all normative prose rules; known 3.1/3.2 embedded dialect keyword syntax is checked, while instances, unknown dialects and referenced resource contexts remain incomplete; legacy schemas check their declared Schema Object subset; extension content remains source-owned');
 return out;
}
export function openapiRegistry(){return new Registry().register(openapiPackage,inspect);}
export function inspectOpenapi(document:Document){return validateDocument(document,openapiRegistry());}
function payload(document:Document):OpenapiPayload {
 const result=inspectOpenapi(document);if(!result.valid)throw new UmfError('OPENAPI_DOCUMENT',JSON.stringify(result.diagnostics));
 const value=document.modules.find(m=>m.id==='schema')?.elements.find(e=>e.id==='schema')?.extensions[OPENAPI_EXTENSION];
 if(document.vocabularies[OPENAPI_EXTENSION]?.version!=='0.1.0'||!structure(value))throw new UmfError('OPENAPI_PAYLOAD','Missing or invalid OpenAPI payload');
 return copyJson(value) as unknown as OpenapiPayload;
}
export function importOpenapiDocument(text:string,options:{id:string;format:'json'|'yaml';baseUri?:string;resources?:{uri:string;text:string;format:'json'|'yaml'}[]}):Document {
 if(!['json','yaml'].includes(options.format))throw new UmfError('OPENAPI_FORMAT','Explicit JSON or YAML format is required');
 const value:OpenapiPayload={profile:'openapi-json-yaml-0.1',root:parse(text,options.format),originalSource:text,originalFormat:options.format,...(options.baseUri?{baseUri:documentUri(options.baseUri)}:{}),...(options.resources?{resources:options.resources.map(r=>({uri:documentUri(r.uri),root:parse(r.text,r.format),originalSource:r.text,originalFormat:r.format}))}:{})};
 const doc:Document={umf:'0.1.0',id:options.id,vocabularies:{[OPENAPI_EXTENSION]:{version:'0.1.0'}},modules:[{id:'schema',namespace:'',elements:[{id:'schema',extensions:{[OPENAPI_EXTENSION]:value as unknown as Json}}]}]};payload(doc);return doc;
}
function documentUri(uri:string):string {try{const url=new URL(uri);if(url.hash||uri.includes('#'))throw new Error('Document URI cannot contain a fragment');return url.href;}catch(error){throw new UmfError('OPENAPI_RESOURCE_URI',String(error));}}
function emit(p:Pick<OpenapiResource,'root'|'originalSource'|'originalFormat'>,format?:'json'|'yaml'):string {
 if(format!==undefined&&!['json','yaml'].includes(format))throw new UmfError('OPENAPI_FORMAT','Unsupported native format');
 const target=format??p.originalFormat;
 if(target===p.originalFormat&&renderTree(parse(p.originalSource,p.originalFormat))===renderTree(p.root))return p.originalSource;
 // JSON is a YAML 1.2 subset, and retains exact numeric tokens without host conversion.
 const text=renderTree(p.root)+'\n';if(text.length>LIMITS.maxTextLength)throw new UmfError('LIMIT','Native OpenAPI output exceeds text limit');return text;
}
function ensureExportable(document:Document){if(inspectOpenapi(document).diagnostics.some(d=>d.code==='OPENAPI_REPRESENTATION'))throw new UmfError('OPENAPI_REPRESENTATION','Native export would discard encoding content');}
export function exportOpenapiDocument(document:Document,format?:'json'|'yaml'):string {
 const p=payload(document);ensureExportable(document);if(p.resources?.length)throw new UmfError('OPENAPI_BUNDLE_REQUIRED','Export the full bundle to retain referenced resources');return emit(p,format);
}
function select(p:OpenapiPayload,uri?:string):OpenapiPayload|OpenapiResource {
 if(uri===undefined||p.baseUri!==undefined&&documentUri(uri)===documentUri(p.baseUri))return p;
 const resource=p.resources?.find(r=>documentUri(r.uri)===documentUri(uri));if(!resource)throw new UmfError('OPENAPI_RESOURCE_MISSING','Resource was not supplied: '+uri);return resource;
}
export function getOpenapiNode(document:Document,path:string,resourceUri?:string):NativeJson{let node=select(payload(document),resourceUri).root;for(const key of nativePointer(path))node=treeChild(node,key);return cloneTree(node);}
/** Literal URI + JSON Pointer lookup only; not an OpenAPI/JSON Schema scope resolver. */
export function lookupOpenapiResource(document:Document,reference:string,fromUri?:string){
 const p=payload(document);const base=fromUri??p.baseUri;if(!base)throw new UmfError('OPENAPI_BASE_URI','Explicit document base URI is required');
 select(p,base);let url:URL;let path:string;
 try{url=new URL(reference,base);path=decodeURIComponent(url.hash.slice(1));url.hash='';}catch(error){throw new UmfError('OPENAPI_REFERENCE',String(error));}
 if(path!==''&&!path.startsWith('/'))throw new UmfError('OPENAPI_REFERENCE_SCOPE','Named anchors require schema-aware resolution');
 return {uri:url.href,pointer:path,node:getOpenapiNode(document,path,url.href),interpretation:'literal-document-pointer-only' as const};
}
export function proposeOpenapiEdit(document:Document,path:string,json:string,resourceUri?:string){
 payload(document);const candidate=copyJson(document) as unknown as Document;
 const p=candidate.modules.find(m=>m.id==='schema')!.elements.find(e=>e.id==='schema')!.extensions[OPENAPI_EXTENSION] as unknown as OpenapiPayload;
 const selected=select(p,resourceUri);
 const replacement=parseNativeJson(json);const keys=nativePointer(path);
 if(!keys.length)selected.root=replacement;
 else{let node=selected.root;for(const key of keys.slice(0,-1))node=treeChild(node,key);const key=keys.at(-1)!;treeChild(node,key);if(node.kind==='object')node.members[key]=replacement;else if(node.kind==='array')node.items[Number(key)]=replacement;}
 const validation=inspectOpenapi(candidate);if(!validation.valid)throw new UmfError('OPENAPI_EDIT',JSON.stringify(validation.diagnostics));
 return {document:candidate,validation};
}
export function exportOpenapiBundle(document:Document){
 const p=payload(document);const changed=[p,...(p.resources??[])].some(r=>renderTree(parse(r.originalSource,r.originalFormat))!==renderTree(r.root));ensureExportable(document);
 return {schema:emit(p),format:p.originalFormat,...(p.baseUri?{baseUri:p.baseUri}:{}),resources:(p.resources??[]).map(r=>({uri:r.uri,text:emit(r),format:r.originalFormat})),source:copyJson(document) as unknown as Document,diagnostics:[...inspectOpenapi(document).diagnostics,...(changed?[{code:'OPENAPI_SOURCE_LAYOUT',path:'',severity:'warning' as const,message:'Edited native output uses JSON syntax; original layout and comments remain in source archive'}]:[]),{code:'SOURCE_ARTIFACT_REQUIRED',path:'',severity:'warning' as const,message:'Retain source UMF for unrelated metadata and archived native layout'}]};
}
