import {copyJson} from '../model/json';
import {UmfError} from '../model/types';
import {parquetCarriers} from './parquet-carriers';
import {encodeParquetWire} from '../adapters/parquet/encode';
import type {ParquetWireValue} from '../adapters/parquet/footer';
export type ParquetFacetCarrier=
 |{kind:'primitive';nativeType:keyof typeof parquetCarriers}
 |{kind:'integer';bits:8|16|32|64;signed:boolean}
 |{kind:'fixed';bytes:number}
 |{kind:'decimal';carrier:'int32'|'int64'|'bytes'|'fixed';precision:number;scale:number;bytes?:number};
export interface ParquetFacetFileRequest {recordName:string;fieldName:string;nullable:boolean;fieldId?:number;carrier:ParquetFacetCarrier;metadata?:Record<string,string>;}
/** Empty file with explicit native declarations, not a row writer or ideal projection.
 * Metadata is transported verbatim and never becomes a validator. */
export function parquetFacetFile(input:ParquetFacetFileRequest):Uint8Array {
 const request=copyJson(input) as unknown as ParquetFacetFileRequest;
 const fail=(message:string):never=>{throw new UmfError('PARQUET_FACET_CARRIER',message);};
 const int=(n:number):ParquetWireValue=>({kind:'i32',value:String(n)});
 type Field={id:number;value:ParquetWireValue};
 const struct=(fields:Field[]):ParquetWireValue=>({kind:'struct',fields:fields.sort((a,b)=>a.id-b.id)});
 const text=(s:string):ParquetWireValue=>{
  if(typeof s!=='string'||/[\uD800-\uDFFF]/u.test(s))fail('Expected Unicode scalar text');
  return {kind:'binary',hex:Array.from(new TextEncoder().encode(s),b=>b.toString(16).padStart(2,'0')).join('')};
 };
 const name=(s:string)=>{if(typeof s!=='string'||!s||s.includes('\0'))fail('Nonempty name without NUL required');return text(s);};
 const bounded=(n:number,min:number,max:number)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
 if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).some(k=>!['recordName','fieldName','nullable','fieldId','carrier','metadata'].includes(k))||typeof request.nullable!=='boolean')fail('Invalid request or unknown request members');
 const c=request.carrier;
 if(!c||typeof c!=='object'||Array.isArray(c))fail('Explicit scalar carrier required');
 const keys:Record<string,string[]>={primitive:['kind','nativeType'],integer:['kind','bits','signed'],fixed:['kind','bytes'],decimal:['kind','carrier','precision','scale','bytes']};
 if(!Object.hasOwn(keys,c.kind)||Object.keys(c).some(k=>!keys[c.kind]!.includes(k)))fail('Unknown carrier members cannot be discarded');
 const leaf:Field[]=[{id:3,value:int(request.nullable?1:0)},{id:4,value:name(request.fieldName)}];
 if(request.fieldId!==undefined){if(!bounded(request.fieldId,-2147483648,2147483647))fail('Field ID must be int32');leaf.push({id:9,value:int(request.fieldId)});}
 if(c.kind==='primitive'){
  if(!Object.hasOwn(parquetCarriers,c.nativeType))fail('Unknown primitive carrier');
  const p=parquetCarriers[c.nativeType];leaf.push({id:1,value:int(p.type)});
  if('converted'in p)leaf.push({id:6,value:int(p.converted)});
 }else if(c.kind==='integer'){
  if(![8,16,32,64].includes(c.bits)||typeof c.signed!=='boolean')fail('Integer requires canonical width and signedness');
  leaf.push({id:1,value:int(c.bits===64?2:1)},{id:6,value:int((c.signed?15:11)+[8,16,32,64].indexOf(c.bits))},
   {id:10,value:struct([{id:10,value:struct([{id:1,value:{kind:'i8',value:String(c.bits)}},{id:2,value:{kind:'bool',value:c.signed}}])}])});
 }else if(c.kind==='fixed'){
  if(!bounded(c.bytes,1,4096))fail('Fixed bytes must be 1..4096 in this profile');
  leaf.push({id:1,value:int(7)},{id:2,value:int(c.bytes)});
 }else{
  if(!['int32','int64','bytes','fixed'].includes(c.carrier)||!bounded(c.precision,1,2147483647)||!bounded(c.scale,0,c.precision))fail('Invalid decimal carrier or exact precision/scale');
  if(c.carrier==='int32'&&c.precision>9||c.carrier==='int64'&&c.precision>18)fail('Decimal precision exceeds integer physical capacity');
  if(c.carrier==='fixed'){
   if(c.bytes===undefined||!bounded(c.bytes,1,4096))fail('Decimal fixed bytes must be 1..4096');
   const digits=((1n<<BigInt(8*c.bytes!-1))-1n).toString().length-1;
   if(c.precision>digits)fail('Decimal precision exceeds fixed-byte capacity');
   leaf.push({id:2,value:int(c.bytes!)});
  }else if(c.bytes!==undefined)fail('Byte count requires a fixed decimal carrier');
  leaf.push({id:1,value:int({int32:1,int64:2,bytes:6,fixed:7}[c.carrier])},{id:6,value:int(5)},
   {id:7,value:int(c.scale)},{id:8,value:int(c.precision)},
   {id:10,value:struct([{id:5,value:struct([{id:1,value:int(c.scale)},{id:2,value:int(c.precision)}])}])});
 }
 const schema=[struct([{id:4,value:name(request.recordName)},{id:5,value:int(1)}]),struct(leaf)];
 const footerFields:Field[]=[{id:1,value:int(1)},{id:2,value:{kind:'list',elementType:'struct',items:schema}},
  {id:3,value:{kind:'i64',value:'0'}},{id:4,value:{kind:'list',elementType:'struct',items:[]}}];
 if(request.metadata!==undefined){
  if(!request.metadata||typeof request.metadata!=='object'||Array.isArray(request.metadata))fail('Metadata must map string keys to strings');
  footerFields.push({id:5,value:{kind:'list',elementType:'struct',items:Object.entries(request.metadata).map(([k,v])=>struct([{id:1,value:text(k)},{id:2,value:text(v)}]))}});
 }
 const footer=encodeParquetWire(struct(footerFields));
 const bytes=new Uint8Array(footer.length+12);bytes.set([80,65,82,49]);bytes.set(footer,4);new DataView(bytes.buffer).setUint32(footer.length+4,footer.length,true);bytes.set([80,65,82,49],footer.length+8);return bytes;
}
