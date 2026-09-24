import Ajv2020 from 'ajv/dist/2020';
import schema from '../../../spec/extensions/json-schema/schema.json';
import packageData from '../../../spec/extensions/json-schema/package.json';
import { createValidator } from '../../validation/schema';
import { Registry } from '../../registry/registry';
import { copyJson, LIMITS } from '../../model/json';
import { readJsonValue } from '../../model/serialization';
import { editExtension } from '../../model/document';
import { validateDocument } from '../../validation/document';
import { UmfError,pointer,type Json,type Document,type Diagnostic,type ExtensionPackage,type Validation } from '../../model/types';
import {parseNativeJson,renderTree,cloneTree,nativePointer,treeChild,type NativeJson} from './tree';
export {parseNativeJson,type NativeJson} from './tree';
export const JSON_SCHEMA_DIALECT='https://json-schema.org/draft/2020-12/schema';
export const JSON_SCHEMA_EXTENSION='umf.json-schema';
export const jsonSchemaPackage=packageData as unknown as ExtensionPackage;
export interface JsonSchemaPayload {dialect:typeof JSON_SCHEMA_DIALECT;baseUri:string;root:NativeJson;resources:Record<string,NativeJson>}
const checkPayload=createValidator().compile(schema);
const single=new Set(['items','additionalProperties','contains','not','if','then','else','unevaluatedItems','unevaluatedProperties','propertyNames','contentSchema']);
const maps=new Set(['properties','patternProperties','$defs','dependentSchemas','definitions']);
const lists=new Set(['allOf','anyOf','oneOf','prefixItems']);
const known=new Set(['$id','$schema','$ref','$anchor','$dynamicRef','$dynamicAnchor','$vocabulary','$comment','$defs','definitions','type','enum','const','multipleOf','maximum','exclusiveMaximum','minimum','exclusiveMinimum','maxLength','minLength','pattern','maxItems','minItems','uniqueItems','maxContains','minContains','maxProperties','minProperties','required','dependentRequired','title','description','default','deprecated','readOnly','writeOnly','examples','format','contentEncoding','contentMediaType',...single,...maps,...lists]);
const vocabularies=new Set(['core','applicator','unevaluated','validation','meta-data','format-annotation','content'].map(s=>'https://json-schema.org/draft/2020-12/vocab/'+s));
export interface SchemaPosition {pointer:string;node:NativeJson}
function positions(root:NativeJson,path=''):SchemaPosition[] {
 const result:SchemaPosition[]=[{pointer:path,node:root}];
 if(root.kind!=='object') return result;
 for(const [key,node] of Object.entries(root.members)) {
  const at=path+'/'+pointer(key);
  if(single.has(key))result.push(...positions(node,at));
  if(maps.has(key)&&node.kind==='object') for(const [name,value]of Object.entries(node.members))result.push(...positions(value,at+'/'+pointer(name)));
  if(lists.has(key)&&node.kind==='array')node.items.forEach((value,i)=>result.push(...positions(value,at+'/'+i)));
 }
 return result;
}
function ensureUri(uri:string):void {
 try {const url=new URL(uri);if(url.hash || uri.includes('#'))throw new Error();}
 catch{throw new UmfError('JSON_SCHEMA_URI','Retrieval URI must be absolute and fragment-free');}
}
function representationUnknown(payload:JsonSchemaPayload):string[] {
 const result:string[]=[];
 for(const key of Object.keys(payload))if(!['dialect','baseUri','root','resources'].includes(key))result.push('/'+pointer(key));
 function visit(node:NativeJson,path:string) {
  const expected=node.kind==='null'?['kind']:node.kind==='object'?['kind','members']:node.kind==='array'?['kind','items']:['kind','value'];
  for(const key of Object.keys(node))if(!expected.includes(key))result.push(path+'/'+pointer(key));
  if(node.kind==='object')for(const [key,value]of Object.entries(node.members))visit(value,path+'/members/'+pointer(key));
  if(node.kind==='array')node.items.forEach((value,i)=>visit(value,path+'/items/'+i));
 }
 visit(payload.root,'/root');for(const[uri,root]of Object.entries(payload.resources))visit(root,'/resources/'+pointer(uri));
 return result;
}
function inspectPayload(payload:JsonSchemaPayload,path:string):Diagnostic[] {
 const diagnostics:Diagnostic[]=[];
 const add=(code:string,at:string,message:string,severity:'error'|'warning'='warning')=>diagnostics.push({code,path:path+at,message,severity});
 try {ensureUri(payload.baseUri);for(const uri of Object.keys(payload.resources))ensureUri(uri);}
 catch(error){add('JSON_SCHEMA_URI','',String(error),'error');return diagnostics;}
 for(const at of representationUnknown(payload))add('JSON_SCHEMA_REPRESENTATION',at,'Unknown representation field cannot be emitted natively');
 let interpretationUnknown=false;
 let dialectUnknown=false;
 for(const [uri,root]of [[payload.baseUri,payload.root],...Object.entries(payload.resources)] as [string,NativeJson][]) {
  if(root.kind!=='object' && root.kind!=='boolean'){add('JSON_SCHEMA_ROOT','',`Resource ${uri} must be object or boolean`,'error');continue;}
  for(const entry of positions(root)) {
   if(entry.node.kind!=='object')continue;
   for(const [keyword,value]of Object.entries(entry.node.members)) {
    if(!known.has(keyword)){interpretationUnknown=true;add('JSON_SCHEMA_KEYWORD',entry.pointer+'/'+pointer(keyword),`Uninterpreted keyword in ${uri}`);}
    if(['$dynamicRef','unevaluatedItems','unevaluatedProperties'].includes(keyword))add('JSON_SCHEMA_VALIDATOR_LIMIT',entry.pointer+'/'+pointer(keyword),'Pinned JavaScript oracle has known failures for this construct; native meaning retained, full semantic evaluation not certified');
    if(keyword==='properties' && value.kind==='object' && Object.hasOwn(value.members,'__proto__'))add('JSON_SCHEMA_VALIDATOR_LIMIT',entry.pointer+'/properties/__proto__','Pinned JavaScript oracle does not reliably assert this property');
    if(keyword==='$schema' && value.kind==='string' && value.value!==JSON_SCHEMA_DIALECT){interpretationUnknown=true;dialectUnknown=true;add('JSON_SCHEMA_DIALECT',entry.pointer,`Uninterpreted dialect ${value.value}`);}
    if(keyword==='$vocabulary' && value.kind==='object')for(const name of Object.keys(value.members))if(!vocabularies.has(name)){interpretationUnknown=true;add('JSON_SCHEMA_VOCABULARY',entry.pointer,`Uninterpreted vocabulary ${name}`);}
   }
  }
 }
 if(diagnostics.some(d=>d.severity==='error'))return diagnostics;
 const native=new Map<string,Json>();
 for(const [uri,root]of [[payload.baseUri,payload.root],...Object.entries(payload.resources)] as [string,NativeJson][]) {
  try {native.set(uri,readJsonValue(renderTree(root),'json'));}
  catch(error){add('JSON_SCHEMA_NUMERIC','',`Resource ${uri}: native values retained but JavaScript validation unavailable: ${String(error)}`);}
 }
 if(native.size!==Object.keys(payload.resources).length+1){
  if(Object.hasOwn(payload.resources,payload.baseUri))add('JSON_SCHEMA_RESOURCE_COLLISION','', 'Root retrieval URI also appears in resources','error');
  return diagnostics;
 }
 // Unknown dialects/vocabularies may alter validation rules. Never compile them as known.
 if(dialectUnknown)return diagnostics;
 const ajv=new Ajv2020({strict:false,allErrors:true,validateFormats:false,ownProperties:true,addUsedSchema:false});
 try {
  for(const[uri,value]of native)if(!ajv.validateSchema(value as object|boolean)){add('JSON_SCHEMA_META','',`Resource ${uri}: ${JSON.stringify(ajv.errors)}`,'error');}
  if(diagnostics.some(d=>d.severity==='error') || interpretationUnknown)return diagnostics;
  for(const[uri,value]of native)ajv.addSchema(value as object|boolean,uri);
  const validate=ajv.getSchema(payload.baseUri);
  if(!validate)throw new Error('Root resource not compiled');
 }catch(error){add('JSON_SCHEMA_COMPILE','',`Native compiler could not establish validity: ${String(error)}`);}
 return diagnostics;
}
export function jsonSchemaRegistry():Registry {
 return new Registry().register(jsonSchemaPackage,(payload,context)=>inspectPayload(payload as unknown as JsonSchemaPayload,context.path));
}
function payloadOf(document:Document):JsonSchemaPayload {
 const checked=validateDocument(document);
 if(!checked.valid)throw new UmfError('INVALID_DOCUMENT',JSON.stringify(checked.diagnostics));
 const element=document.modules.find(m=>m.id==='schema')?.elements.find(e=>e.id==='schema');
 const payload=copyJson(element?.extensions[JSON_SCHEMA_EXTENSION]);
 if(!checkPayload(payload))throw new UmfError('JSON_SCHEMA_PAYLOAD',JSON.stringify(checkPayload.errors));
 if(document.vocabularies[JSON_SCHEMA_EXTENSION]?.version!=='0.1.0')throw new UmfError('JSON_SCHEMA_VERSION','Unsupported native extension version');
 return payload as unknown as JsonSchemaPayload;
}
export function inspectJsonSchema(document:Document):Validation {return validateDocument(document,jsonSchemaRegistry());}
export function importJsonSchema(text:string,options:{id:string;baseUri:string;resources?:Record<string,string>}):Document {
 ensureUri(options.baseUri);
 const resources:Record<string,NativeJson>=Object.create(null);
 for(const[uri,source]of Object.entries(options.resources||{})){ensureUri(uri);resources[uri]=parseNativeJson(source);}
 const payload:JsonSchemaPayload={dialect:JSON_SCHEMA_DIALECT,baseUri:options.baseUri,root:parseNativeJson(text),resources};
 const doc:Document={umf:'0.1.0',id:options.id,vocabularies:{[JSON_SCHEMA_EXTENSION]:{version:'0.1.0'}},modules:[{id:'schema',namespace:options.baseUri,elements:[{id:'schema',extensions:{[JSON_SCHEMA_EXTENSION]:payload as unknown as Json}}]}]};
 const checked=inspectJsonSchema(doc);
 if(!checked.valid)throw new UmfError('JSON_SCHEMA_INVALID',JSON.stringify(checked.diagnostics));
 return doc;
}
function exportable(document:Document):JsonSchemaPayload {
 const payload=payloadOf(document);
 const diagnostics=inspectPayload(payload,'');
 if(diagnostics.some(d=>d.severity==='error'||d.code==='JSON_SCHEMA_REPRESENTATION'))throw new UmfError('JSON_SCHEMA_EXPORT',JSON.stringify(diagnostics));
 return payload;
}
function emitted(node:NativeJson):string {
 const output=renderTree(node)+'\n';
 if(output.length>LIMITS.maxTextLength)throw new UmfError('LIMIT','Native output exceeds text limit');
 return output;
}
export function exportJsonSchema(document:Document):string {return emitted(exportable(document).root);}
export function exportJsonSchemaResources(document:Document):Record<string,string> {
 const result:Record<string,string>=Object.create(null);
 for(const [uri,root]of Object.entries(exportable(document).resources))result[uri]=emitted(root);
 return result;
}
export function getJsonSchemaNode(document:Document,path:string):NativeJson {
 let node=payloadOf(document).root;
 for(const key of nativePointer(path))node=treeChild(node,key);
 return cloneTree(node);
}
export function walkJsonSchema(document:Document):SchemaPosition[] {return positions(payloadOf(document).root).map(p=>({...p,node:cloneTree(p.node)}));}
export function editJsonSchemaNode(document:Document,path:string,replacement:string):Document {
 const keys=nativePointer(path); const node=parseNativeJson(replacement);
 return editExtension(document,jsonSchemaRegistry(),'schema','schema',JSON_SCHEMA_EXTENSION,value=>{
  const payload=value as unknown as JsonSchemaPayload;
  if(!keys.length)payload.root=node;
  else {
   let parent=payload.root;for(const key of keys.slice(0,-1))parent=treeChild(parent,key);
   const key=keys.at(-1)!;treeChild(parent,key);
   if(parent.kind==='object')parent.members[key]=node;
   else if(parent.kind==='array')parent.items[Number(key)]=node;
  }
  return payload as unknown as Json;
 });
}

/** Complete export bundle: source metadata and interpretation limits accompany native output. */
export function exportJsonSchemaBundle(document:Document): {schema:string;resources:Record<string,string>;source:Document;diagnostics:Diagnostic[]} {
 const payload=exportable(document);
 const resources:Record<string,string>=Object.create(null);
 for(const[uri,root]of Object.entries(payload.resources))resources[uri]=emitted(root);
 return {schema:emitted(payload.root),resources,source:copyJson(document) as unknown as Document,
  diagnostics:[...inspectJsonSchema(document).diagnostics,{code:'SOURCE_ARTIFACT_REQUIRED',path:'',severity:'warning',message:'Standalone native root does not carry UMF metadata or supplied resource files; retain this bundle for full source recovery.'}]};
}
