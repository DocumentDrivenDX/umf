import {Type} from 'avsc/etc/browser/avsc-types';
import {deriveAvroFields} from './metadata';
export type {AvroFieldMetadata} from './metadata';
import manifest from '../../../spec/extensions/avro/package.json';
export {default as avroNativeSchema} from '../../../spec/extensions/avro/native-schema.schema.json';
import {createValidator} from '../../validation/schema';
import {Registry} from '../../registry/registry';
import {validateDocument} from '../../validation/document';
import {copyJson,LIMITS} from '../../model/json';
import {readJsonValue} from '../../model/serialization';
import {editExtension} from '../../model/document';
import {UmfError,pointer,type Document,type Json,type Diagnostic,type ExtensionPackage,type Validation} from '../../model/types';
import {parseNativeJson,renderTree,treeChild,nativePointer,cloneTree,type NativeJson} from '../json-schema/tree';
export const AVRO_EXTENSION='umf.avro';
export const avroPackage=manifest as unknown as ExtensionPackage;
export interface AvroPayload {version:'1.12.0';root:NativeJson;dependencies?:{id:string;root:NativeJson}[];}
const structure=createValidator().compile(manifest.schema);
function representation(node:NativeJson,path:string,out:Diagnostic[]){
 const keys=node.kind==='object'?['kind','members']:node.kind==='array'?['kind','items']:node.kind==='null'?['kind']:['kind','value'];
 for(const key of Object.keys(node))if(!keys.includes(key))out.push({code:'AVRO_REPRESENTATION',path:path+'/'+pointer(key),severity:'warning',message:'Unknown representation field has no native destination'});
 if(node.kind==='object')for(const[key,value]of Object.entries(node.members))representation(value,path+'/members/'+pointer(key),out);
 if(node.kind==='array')node.items.forEach((value,index)=>representation(value,path+'/items/'+index,out));
}
function inspect(payload:Json):Diagnostic[]{
 const p=payload as unknown as AvroPayload;const out:Diagnostic[]=[];
 const warn=(code:string,path:string,message:string)=>out.push({code,path,message,severity:'warning'});
 for(const key of Object.keys(p))if(!['version','root','dependencies'].includes(key))warn('AVRO_REPRESENTATION','/'+pointer(key),'Unknown payload field has no native destination');
 const roots=[...(p.dependencies??[]).map((d,i)=>({node:d.root,path:'/dependencies/'+i+'/root'})),{node:p.root,path:'/root'}];
 const ids=new Set<string>();
 (p.dependencies??[]).forEach((dep,i)=>{
  if(ids.has(dep.id))out.push({code:'AVRO_DEPENDENCY_ID',path:'/dependencies/'+i+'/id',severity:'error',message:'Dependency IDs must be unique'});
  ids.add(dep.id);
  for(const key of Object.keys(dep))if(!['id','root'].includes(key))warn('AVRO_REPRESENTATION','/dependencies/'+i+'/'+pointer(key),'Unknown dependency representation field has no native destination');
 });
 for(const {node,path} of roots)representation(node,path,out);
 if(!['string','object','array'].includes(p.root.kind))return [...out,{code:'AVRO_ROOT',path:'/root',severity:'error',message:'Avro schemas must be strings, objects or union arrays'}];
 function walk(node:NativeJson,path:string){
  if(node.kind==='array'){node.items.forEach((item,index)=>walk(item,path+'/'+index));return;}
  if(node.kind!=='object')return;
  const m=node.members;const type=m.type?.kind==='string'?m.type.value:undefined;
  const known=['type','name','namespace','aliases','doc','logicalType',...(type==='record'||type==='error'?['fields']:type==='enum'?['symbols','default']:type==='fixed'?['size','precision','scale']:type==='array'?['items']:type==='map'?['values']:['precision','scale'])];
  for(const key of Object.keys(m))if(!known.includes(key))warn('AVRO_METADATA',path+'/'+pointer(key),'Uninterpreted native metadata retained');
  if(m.logicalType)warn('AVRO_LOGICAL_TYPE',path+'/logicalType','Logical type retained; this browser profile validates its underlying carrier only');
  if(m.fields?.kind==='array')m.fields.items.forEach((field,index)=>{
   if(field.kind!=='object')return;const f=field.members;
   for(const key of Object.keys(f))if(!['name','type','default','order','aliases','doc'].includes(key))warn('AVRO_METADATA',path+'/fields/'+index+'/'+pointer(key),'Uninterpreted field metadata retained');
   if(f.type)walk(f.type,path+'/fields/'+index+'/type');
  });
  for(const key of ['items','values'])if(m[key])walk(m[key]!,path+'/'+key);
  if(m.type&&m.type.kind!=='string')walk(m.type,path+'/type');
 }
 const registry=Object.create(null);
 for(const {node,path} of roots){
  walk(node,path);
  let native:unknown;
  try{native=readJsonValue(renderTree(node),'json');}
  catch(error){warn('AVRO_NUMERIC',path,'Exact native tokens retained; host interpretation is unavailable: '+String(error));continue;}
  try{Type.forSchema(native as any,{wrapUnions:true,registry});}
  catch(error){warn('AVRO_VALIDATOR_LIMIT',path,'Native schema could not be interpreted by avsc 5.7.9: '+String(error));}
 }
 return out;
}
export function avroRegistry(){return new Registry().register(avroPackage,inspect);}
export function inspectAvro(document:Document){return validateDocument(document,avroRegistry());}
function payload(document:Document):AvroPayload{
 const result=inspectAvro(document);if(!result.valid)throw new UmfError('AVRO_DOCUMENT',JSON.stringify(result.diagnostics));
 const value=document.modules.find(m=>m.id==='schema')?.elements.find(e=>e.id==='schema')?.extensions[AVRO_EXTENSION];
 if(document.vocabularies[AVRO_EXTENSION]?.version!=='0.1.0'||!structure(value))throw new UmfError('AVRO_PAYLOAD','Missing or malformed Avro payload');
 return copyJson(value) as unknown as AvroPayload;
}
export function importAvroSchema(text:string,options:{id:string;dependencies?:{id:string;schema:string}[]}):Document{
 const doc:Document={umf:'0.1.0',id:options.id,vocabularies:{[AVRO_EXTENSION]:{version:'0.1.0'}},modules:[{id:'schema',namespace:'',elements:[{id:'schema',extensions:{[AVRO_EXTENSION]:{version:'1.12.0',root:parseNativeJson(text),...(options.dependencies?{dependencies:options.dependencies.map(d=>({id:d.id,root:parseNativeJson(d.schema)}))}:{})} as unknown as Json}}]}]};const p=payload(doc);doc.modules.push({id:'avro.fields',namespace:'',elements:deriveAvroFields(p).map(f=>f.element)});return doc;
}
export function getAvroFieldMetadata(document:Document){return deriveAvroFields(payload(document));}
function checkFieldMetadata(document:Document){
 const module=document.modules.find(m=>m.id==='avro.fields');if(!module)return; // Earlier documents have no materialized view.
 const expected=getAvroFieldMetadata(document).map(f=>f.element);
 if(module.namespace!==''||module.elements.length!==expected.length||expected.some((e,i)=>['id','name','description','scalarType'].some(k=>module.elements[i]?.[k]!==e[k])))throw new UmfError('AVRO_FIELD_METADATA','Native fields and core metadata disagree');
}
function nativeRoot(document:Document):string{
 checkFieldMetadata(document);
 const value=payload(document);const diagnostics=inspectAvro(document).diagnostics;
 if(diagnostics.some(d=>d.code==='AVRO_REPRESENTATION'))throw new UmfError('AVRO_REPRESENTATION','Unknown representation content cannot be discarded');
 const text=renderTree(value.root)+'\n';if(text.length>LIMITS.maxTextLength)throw new UmfError('LIMIT','Native output exceeds limit');return text;
}
export function exportAvroSchema(document:Document):string{
 if(payload(document).dependencies?.length)throw new UmfError('AVRO_DEPENDENCIES_REQUIRED','Export the Avro bundle to retain named-schema dependencies');
 return nativeRoot(document);
}
function selectRoot(p:AvroPayload,dependencyId?:string):NativeJson{
 if(dependencyId===undefined)return p.root;
 const dep=p.dependencies?.find(d=>d.id===dependencyId);
 if(!dep)throw new UmfError('AVRO_DEPENDENCY_ID','Unknown dependency '+dependencyId);
 return dep.root;
}
export function getAvroNode(document:Document,path:string,dependencyId?:string):NativeJson{let node=selectRoot(payload(document),dependencyId);for(const key of nativePointer(path))node=treeChild(node,key);return cloneTree(node);}
function replaceNode(p:AvroPayload,keys:string[],replacement:NativeJson,dependencyId?:string){
 const root=selectRoot(p,dependencyId);if(!keys.length){if(dependencyId===undefined)p.root=replacement;else p.dependencies!.find(d=>d.id===dependencyId)!.root=replacement;}
  else{let node=root;for(const key of keys.slice(0,-1))node=treeChild(node,key);const key=keys.at(-1)!;treeChild(node,key);if(node.kind==='object')node.members[key]=replacement;else if(node.kind==='array')node.items[Number(key)]=replacement;}
 return p;
}
function synchronizeFields(edited:Document):Document{
 const module=edited.modules.find(m=>m.id==='avro.fields');
 if(module){
  const previous=new Map(module.elements.map(e=>[e.id,e]));
  const next=getAvroFieldMetadata(edited).map(f=>f.element);
  if(next.some(e=>{const old=previous.get(e.id);return old&&old.name!==e.name&&(Object.keys(old.extensions).length||Object.keys(old).some(k=>!['id','name','description','scalarType','extensions'].includes(k)));}))throw new UmfError('AVRO_FIELD_METADATA','Field identity changed with attached metadata; explicit reassociation required');
  if(module.elements.some(e=>!next.some(n=>n.id===e.id)&&(Object.keys(e.extensions).length||Object.keys(e).some(k=>!['id','name','description','scalarType','extensions'].includes(k)))))throw new UmfError('AVRO_FIELD_METADATA','Removing a field would discard attached core metadata');
  module.elements=next.map(e=>{const old=previous.get(e.id);if(!old)return e;delete old.description;delete old.scalarType;return {...old,...e,extensions:old.extensions};});
 }
 return edited;
}
export function editAvroNode(document:Document,path:string,text:string,dependencyId?:string):Document{
 checkFieldMetadata(document);
 const keys=nativePointer(path),replacement=parseNativeJson(text);
 return synchronizeFields(editExtension(document,avroRegistry(),'schema','schema',AVRO_EXTENSION,value=>replaceNode(value as unknown as AvroPayload,keys,replacement,dependencyId) as unknown as Json));
}
export interface AvroNodeEditProposal {
 status:'candidate';source:Document;document:Document;validation:Validation;
 edit:{path:string;dependencyId?:string;replacement:NativeJson};
}
/** Explicit authoring proposal, not a semantic-validity or compatibility certificate. */
export function proposeAvroNodeEdit(input:Document,path:string,text:string,dependencyId?:string):AvroNodeEditProposal{
 const source=copyJson(input) as Document;checkFieldMetadata(source);
 const p=payload(source),before=inspectAvro(source);
 if(before.diagnostics.some(d=>d.code==='AVRO_REPRESENTATION'))throw new UmfError('AVRO_REPRESENTATION','Unknown representation content prevents native node replacement');
 const keys=nativePointer(path),replacement=parseNativeJson(text),document=copyJson(source) as Document;
 document.modules.find(m=>m.id==='schema')!.elements.find(e=>e.id==='schema')!.extensions[AVRO_EXTENSION]=replaceNode(p,keys,cloneTree(replacement),dependencyId) as unknown as Json;
 payload(document);synchronizeFields(document);
 const validation=inspectAvro(document);
 // Validate the whole report against the common structural limits and isolate copies.
 return copyJson({status:'candidate',source,document,validation,edit:{path,...(dependencyId!==undefined?{dependencyId}:{}),replacement}}) as unknown as AvroNodeEditProposal;
}
export function exportAvroBundle(document:Document){return {schema:nativeRoot(document),dependencies:(payload(document).dependencies??[]).map(d=>({id:d.id,schema:renderTree(d.root)+'\n'})),source:copyJson(document) as unknown as Document,diagnostics:[...inspectAvro(document).diagnostics,{code:'SOURCE_ARTIFACT_REQUIRED',path:'',severity:'warning' as const,message:'Retain source UMF for unrelated metadata and uninterpreted content'}]};}
