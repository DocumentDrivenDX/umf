import {fromBinary,toBinary,type DescMessage,ScalarType} from '@bufbuild/protobuf';
import {FileDescriptorSetSchema} from '@bufbuild/protobuf/wkt';
import {reflect,reflectList,type ReflectMessage} from '@bufbuild/protobuf/reflect';
import {copyJson,LIMITS} from '../../model/json';
import {UmfError,type Json} from '../../model/types';

export interface DescriptorNode {
 type:string;
 fields:Record<string,Json>;
 unknown:{number:number;wireType:number;data:string}[];
}
export const descriptorRoot:DescMessage=FileDescriptorSetSchema;
const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
function bytes(value:unknown):Uint8Array {
 if(typeof value!=='string'||! /^(?:[0-9a-f]{2})*$/.test(value))throw new UmfError('PROTOBUF_BYTES','Expected lowercase hexadecimal bytes');
 return Uint8Array.from(value.match(/../g)??[],b=>parseInt(b,16));
}
function scalar(value:unknown):Json {
 if(typeof value==='bigint')return String(value);
 if(value instanceof Uint8Array)return hex(value);
 if(typeof value==='number'&&(!Number.isFinite(value)||Object.is(value,-0)))return Object.is(value,-0)?'-0':String(value);
 return value as Json;
}
function encodeNode(message:ReflectMessage,depth=0):DescriptorNode {
 if(depth>LIMITS.maxDepth)throw new UmfError('LIMIT','Descriptor nesting exceeds limit');
 const fields:Record<string,Json>=Object.create(null);
 for(const field of message.fields){
  if(!message.isSet(field))continue;
  if(field.fieldKind==='message')fields[field.name]=encodeNode(message.get(field),depth+1) as unknown as Json;
  else if(field.fieldKind==='list')fields[field.name]=Array.from(message.get(field),value=>field.listKind==='message'?encodeNode(value as ReflectMessage,depth+1) as unknown as Json:scalar(value));
  else if(field.fieldKind==='map')throw new UmfError('PROTOBUF_DESCRIPTOR_PROFILE','Descriptor map fields require a newer profile');
  else fields[field.name]=scalar(message.get(field));
 }
 return {type:message.desc.typeName,fields,unknown:(message.getUnknown()??[]).map(f=>({number:f.no,wireType:f.wireType,data:hex(f.data)}))};
}
function decodeScalar(value:Json,type:ScalarType|undefined):unknown {
 if(type===ScalarType.BYTES)return bytes(value);
 if([ScalarType.INT64,ScalarType.UINT64,ScalarType.SINT64,ScalarType.FIXED64,ScalarType.SFIXED64].includes(type!)){
  if(typeof value!=='string'||! /^(?:0|-?[1-9][0-9]*)$/.test(value))throw new UmfError('PROTOBUF_INTEGER','Expected canonical decimal integer');
  return BigInt(value);
 }
 if((type===ScalarType.FLOAT||type===ScalarType.DOUBLE)&&typeof value==='string'){
  if(!['NaN','Infinity','-Infinity','-0'].includes(value))throw new UmfError('PROTOBUF_FLOAT','Invalid special floating value');
  return Number(value);
 }
 return value;
}
function keys(value:object,allowed:string[]):void {
 for(const key of Object.keys(value))if(!allowed.includes(key))throw new UmfError('PROTOBUF_REPRESENTATION','Unknown representation field cannot be discarded',key);
}
function decodeNode(node:DescriptorNode,desc:DescMessage):ReflectMessage {
 keys(node,['type','fields','unknown']);
 if(node.type!==desc.typeName)throw new UmfError('PROTOBUF_TYPE',`Expected ${desc.typeName}`);
 const result=reflect(desc);
 for(const[name,value]of Object.entries(node.fields)){
  const field=desc.fields.find(f=>f.name===name);
  if(!field)throw new UmfError('PROTOBUF_REPRESENTATION','Unknown named descriptor field: '+name);
  if(field.fieldKind==='message')result.set(field,decodeNode(value as unknown as DescriptorNode,field.message));
  else if(field.fieldKind==='list'){
   if(!Array.isArray(value))throw new UmfError('PROTOBUF_LIST','Expected descriptor list');
   const list=reflectList(field);
   for(const item of value)list.add(field.listKind==='message'?decodeNode(item as unknown as DescriptorNode,field.message):decodeScalar(item,field.listKind==='scalar'?field.scalar:undefined));
   result.set(field,list);
  }else if(field.fieldKind==='map')throw new UmfError('PROTOBUF_DESCRIPTOR_PROFILE','Descriptor map fields require a newer profile');
  else result.set(field,decodeScalar(value,field.fieldKind==='scalar'?field.scalar:undefined));
 }
 result.setUnknown(node.unknown.map(f=>{
  keys(f,['number','wireType','data']);
  if(!Number.isInteger(f.number)||f.number<1||f.number>536870911||![0,1,2,3,5].includes(f.wireType))throw new UmfError('PROTOBUF_UNKNOWN','Invalid unknown wire field');
  return {no:f.number,wireType:f.wireType,data:bytes(f.data)};
 }));
 return result;
}
export function readDescriptorSet(binary:Uint8Array):DescriptorNode {
 if(binary.length>LIMITS.maxTextLength)throw new UmfError('LIMIT','Descriptor input exceeds limit');
 try{return copyJson(encodeNode(reflect(descriptorRoot,fromBinary(descriptorRoot,binary)))) as unknown as DescriptorNode;}
 catch(error){if(error instanceof UmfError)throw error;throw new UmfError('PROTOBUF_BINARY',String(error));}
}
export function writeDescriptorSet(input:DescriptorNode):Uint8Array {
 const node=copyJson(input) as unknown as DescriptorNode;
 try{
  const output=toBinary(descriptorRoot,decodeNode(node,descriptorRoot).message);
  if(output.length>LIMITS.maxTextLength)throw new UmfError('LIMIT','Descriptor output exceeds limit');
  // Reject malformed unknown wire payloads before returning a native artifact.
  fromBinary(descriptorRoot,output);
  return output;
 }catch(error){if(error instanceof UmfError)throw error;throw new UmfError('PROTOBUF_DESCRIPTOR',String(error));}
}
