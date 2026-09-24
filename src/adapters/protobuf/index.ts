import {fromBinary,createFileRegistry} from '@bufbuild/protobuf';
import {FileDescriptorSetSchema} from '@bufbuild/protobuf/wkt';
import Ajv2020 from 'ajv/dist/2020';
import manifest from '../../../spec/extensions/protobuf/package.json';
import {Registry} from '../../registry/registry';
import {copyJson} from '../../model/json';
import {validateDocument} from '../../validation/document';
import {UmfError,type Document,type Json,type Diagnostic,type ExtensionPackage} from '../../model/types';
import {readDescriptorSet,writeDescriptorSet,type DescriptorNode} from './descriptor';
export {readDescriptorSet,writeDescriptorSet,type DescriptorNode} from './descriptor';
export const PROTOBUF_EXTENSION='umf.protobuf';
export const protobufPackage=manifest as unknown as ExtensionPackage;
export interface ProtobufPayload {descriptorProfile:'protobuf-es-2.15.0';descriptorSet:DescriptorNode;sourceArchive?:{role:'original';compiler:string;files:Record<string,string>;roots:string[]};}
const structure=new Ajv2020({strict:false,allErrors:true}).compile(manifest.schema);
function inspect(payload:Json):Diagnostic[]{
 const value=payload as unknown as ProtobufPayload;
 const diagnostics:Diagnostic[]=[];
 const warning=(code:string,path:string,message:string)=>diagnostics.push({code,path,message,severity:'warning'});
 for(const key of Object.keys(value))if(!['descriptorProfile','descriptorSet','sourceArchive'].includes(key))warning('PROTOBUF_REPRESENTATION','/'+key,'Unknown representation field retained; native export blocked');
 if(value.sourceArchive)for(const key of Object.keys(value.sourceArchive))if(!['role','compiler','files','roots'].includes(key))warning('PROTOBUF_REPRESENTATION','/sourceArchive/'+key,'Unknown source archive field retained; native export blocked');
 function walk(node:DescriptorNode,path:string):void {
  if(node.unknown.length)warning('PROTOBUF_UNKNOWN',path+'/unknown','Unknown native wire fields/options retained without semantic interpretation');
  for(const[name,item]of Object.entries(node.fields)){
   for(const child of Array.isArray(item)?item:[item])if(child&&typeof child==='object'&&!Array.isArray(child)&&'fields'in child&&'type'in child)walk(child as unknown as DescriptorNode,path+'/fields/'+name);
  }
 }
 walk(value.descriptorSet,'/descriptorSet');
 try{
  const bytes=writeDescriptorSet(value.descriptorSet);
  const set=fromBinary(FileDescriptorSetSchema,bytes);
  const names=new Set<string>();
  for(const file of set.file){if(!file.name||names.has(file.name))throw new Error('Missing or duplicate file name');names.add(file.name);}
  createFileRegistry(set);
 }catch(error){warning('PROTOBUF_INTERPRETATION','/descriptorSet',String(error));}
 warning('PROTOBUF_COMPILER_REQUIRED','/descriptorSet','Browser descriptor checks do not certify native compiler validity; validate emitted artifacts with the pinned native compiler');
 return diagnostics;
}
export function protobufRegistry():Registry{return new Registry().register(protobufPackage,inspect);}
export function inspectProtobuf(document:Document){return validateDocument(document,protobufRegistry());}
function payload(document:Document):ProtobufPayload {
 const result=inspectProtobuf(document);if(!result.valid)throw new UmfError('PROTOBUF_DOCUMENT',JSON.stringify(result.diagnostics));
 const value=document.modules.find(m=>m.id==='schema')?.elements.find(e=>e.id==='schema')?.extensions[PROTOBUF_EXTENSION];
 if(document.vocabularies[PROTOBUF_EXTENSION]?.version!=='0.1.0'||!structure(value))throw new UmfError('PROTOBUF_PAYLOAD','Missing or malformed Protobuf payload');
 return copyJson(value) as unknown as ProtobufPayload;
}
export function importProtobufDescriptorSet(binary:Uint8Array,options:{id:string}):Document {
 const doc:Document={umf:'0.1.0',id:options.id,vocabularies:{[PROTOBUF_EXTENSION]:{version:'0.1.0'}},modules:[{id:'schema',namespace:'',elements:[{id:'schema',extensions:{[PROTOBUF_EXTENSION]:{descriptorProfile:'protobuf-es-2.15.0',descriptorSet:readDescriptorSet(binary)} as unknown as Json}}]}]};
 payload(doc);return doc;
}
export function exportProtobufDescriptorSet(document:Document):Uint8Array {
 const value=payload(document);
 if(Object.keys(value).some(k=>!['descriptorProfile','descriptorSet','sourceArchive'].includes(k)))throw new UmfError('PROTOBUF_REPRESENTATION','Unknown representation field cannot be discarded');
 if(value.sourceArchive&&Object.keys(value.sourceArchive).some(k=>!['role','compiler','files','roots'].includes(k)))throw new UmfError('PROTOBUF_REPRESENTATION','Unknown source archive field cannot be discarded');
 return writeDescriptorSet(value.descriptorSet);
}
export function getProtobufDescriptorSet(document:Document):DescriptorNode{return payload(document).descriptorSet;}
/** Produces an explicit validation candidate; never claims a compiler-validated edit. */
export function proposeProtobufDescriptorEdit(document:Document,edit:(node:DescriptorNode)=>void):{document:Document;diagnostics:Diagnostic[]} {
 const candidate=copyJson(document) as unknown as Document;
 const value=payload(candidate);edit(value.descriptorSet);
 // Round-trip checks runtime scalar validity and representability before installing.
 writeDescriptorSet(value.descriptorSet);
 candidate.modules.find(m=>m.id==='schema')!.elements.find(e=>e.id==='schema')!.extensions[PROTOBUF_EXTENSION]=value as unknown as Json;
 const result=inspectProtobuf(candidate);if(!result.valid)throw new UmfError('PROTOBUF_EDIT',JSON.stringify(result.diagnostics));
 return {document:candidate,diagnostics:result.diagnostics};
}
export function exportProtobufBundle(document:Document){return {descriptorSet:exportProtobufDescriptorSet(document),source:copyJson(document) as unknown as Document,diagnostics:[...inspectProtobuf(document).diagnostics,{code:'SOURCE_ARTIFACT_REQUIRED',path:'',severity:'warning' as const,message:'Retain source UMF to recover unrelated vocabularies and representation context'}]};}

export * from './source';
