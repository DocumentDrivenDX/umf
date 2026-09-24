import {copyJson,LIMITS} from './json';
import {UmfError,type Json,type Module,type Element} from './types';
import {validateKeyCandidate,type CoreKeyDefinition,type CoreKeyFieldReference} from '../validation/keys';
import {createValidator} from '../validation/schema';
import documentSchema from '../../spec/core/key-document.schema.json';
import schema from '../../spec/core/key-tuple-operation.schema.json';
export interface CoreKeyIdentity {module:string;element:string;key:string}
export type CoreKeyTupleValue={boolean:boolean}|{integerToken:string}|{decimalToken:string}|{string:string}|{binaryHex:string};
export interface CoreKeyTupleReceipt {operation:'encode-core-key-tuple';version:'1.0.0';profile:'umf-key-tuple-v1';source:Json;identity:CoreKeyIdentity;values:CoreKeyTupleValue[];keyPath:string;bytesHex:string}
const validator=createValidator();validator.addSchema(documentSchema);
const check=validator.compile(schema),checkIdentity=validator.compile(schema.$defs.identity);
const encoder=new TextEncoder(),limit=LIMITS.maxTextLength;
function fail(code:string,message:string,path:string):never{throw new UmfError(code,message,path);}
const id=(r:CoreKeyFieldReference)=>JSON.stringify([r.module,r.element]);
const canonical=(v:Json):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k]!)).join(',')+'}':JSON.stringify(v);
function leb(value:number):number[]{const bytes:number[]=[];do{const rest=value%128;value=Math.floor(value/128);bytes.push(rest+(value?128:0));}while(value);return bytes;}
function coefficient(token:string,scale:number,precision:number|undefined,path:string):string{
 const m=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(token);
 if(!m)fail('KEY_TUPLE_TOKEN','Expected exact JSON numeric token',path);
 let digits=(m[2]!+(m[3]??'')).replace(/^0+/,'');
 if(!digits)return '0';
 const exponent=(m[4]??'0').replace(/^([+-]?)0+/,'$1')||'0';
 if(exponent.replace(/^[+-]/,'').length>32)fail('LIMIT','Nonzero exponent exceeds bounded tuple domain',path);
 const shift=BigInt(exponent==='+'||exponent==='-'?'0':exponent)-BigInt((m[3]??'').length)+BigInt(scale);
 if(shift<0n){
  const cut=-shift;
  if(cut>BigInt(digits.length))fail('KEY_TUPLE_ROUNDING','Value is not exactly representable at declared scale',path);
  const split=digits.length-Number(cut);
  if(/[^0]/.test(digits.slice(split)))fail('KEY_TUPLE_ROUNDING','Value is not exactly representable at declared scale',path);
  digits=digits.slice(0,split)||'0';
 }else{
  const length=BigInt(digits.length)+shift;
  if(precision!==undefined&&length>BigInt(precision))fail('KEY_TUPLE_DOMAIN','Decimal coefficient exceeds precision',path);
  if(length+BigInt(m[1]!.length)>BigInt(limit))fail('LIMIT','Numeric expansion exceeds tuple limit',path);
  digits+='0'.repeat(Number(shift));
 }
 if(precision!==undefined&&digits.length>precision)fail('KEY_TUPLE_DOMAIN','Decimal coefficient exceeds precision',path);
 return (m[1]&&digits!=='0'?'-':'')+digits;
}
function scalarCount(text:string,path:string):number{
 let count=0,bytes=0;
 for(let i=0;i<text.length;i++,count++){
  const c=text.charCodeAt(i);
  if(c>=0xd800&&c<=0xdbff){const next=text.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))fail('KEY_TUPLE_UNICODE','Unpaired high surrogate',path);bytes+=4;}
  else if(c>=0xdc00&&c<=0xdfff)fail('KEY_TUPLE_UNICODE','Unpaired low surrogate',path);
  else bytes+=c<0x80?1:c<0x800?2:3;
  if(bytes>limit)fail('LIMIT','UTF-8 payload exceeds tuple limit',path);
 }
 return count;
}
function payload(field:Element,value:CoreKeyTupleValue,path:string):{tag:number;bytes:Uint8Array}{
 if(value===null||typeof value!=='object'||Array.isArray(value)||Object.hasOwn(value,'absent'))fail('KEY_TUPLE_ABSENT','Key component must be present and typed',path);
 const wrappers:Record<string,string>={boolean:'boolean',integer:'integerToken',decimal:'decimalToken',string:'string',binary:'binaryHex'};
 const keys=Object.keys(value),expected=wrappers[field.scalarType!];
 if(keys.length!==1||keys[0]!==expected)fail('KEY_TUPLE_VALUE','Value wrapper does not match key component',path);
 const v=(value as unknown as Record<string,unknown>)[expected!],facets=field.facets as {precision?:number;scale?:number;integerWidth?:{bits:number;signed:boolean};length?:{max:number;unit:string}}|undefined;
 if(expected==='boolean'){
  if(typeof v!=='boolean')fail('KEY_TUPLE_VALUE','Expected boolean',path);
  return {tag:1,bytes:new Uint8Array([v?1:0])};
 }
 if(typeof v!=='string')fail('KEY_TUPLE_VALUE','Numeric and binary values require exact lexical strings',path);
 if(expected==='integerToken'){
  const token=coefficient(v,0,undefined,path),width=facets?.integerWidth;
  if(width){
   const negative=token.startsWith('-'),magnitude=BigInt(negative?token.slice(1):token),bits=magnitude===0n?0:magnitude.toString(2).length;
   const fits=width.signed?(negative?(bits<width.bits||(bits===width.bits&&(magnitude&(magnitude-1n))===0n)):bits<width.bits):(!negative&&bits<=width.bits);
   if(!fits)fail('KEY_TUPLE_DOMAIN','Integer exceeds declared width/signedness',path);
  }
  return {tag:2,bytes:encoder.encode(token)};
 }
 if(expected==='decimalToken'){
  const token=coefficient(v,facets!.scale!,facets!.precision,path),scale=leb(facets!.scale!),bytes=encoder.encode(token);
  const result=new Uint8Array(scale.length+bytes.length);result.set(scale);result.set(bytes,scale.length);return {tag:3,bytes:result};
 }
 if(expected==='string'){
  const count=scalarCount(v,path);
  if(facets?.length&&count>facets.length.max)fail('KEY_TUPLE_DOMAIN','String exceeds Unicode scalar bound',path);
  return {tag:4,bytes:encoder.encode(v)};
 }
 if(v.length%2||!/^[0-9a-fA-F]*$/.test(v))fail('KEY_TUPLE_VALUE','Binary input must be whole hexadecimal bytes',path);
 if(facets?.length&&v.length/2>facets.length.max)fail('KEY_TUPLE_DOMAIN','Binary exceeds byte bound',path);
 const bytes=new Uint8Array(v.length/2);for(let i=0;i<bytes.length;i++)bytes[i]=parseInt(v.slice(i*2,i*2+2),16);
 return {tag:5,bytes};
}
/** Exact candidate encoding; no native uniqueness or author provenance is inferred. */
export function encodeCoreKeyTuple(input:unknown,identityInput:CoreKeyIdentity,valuesInput:CoreKeyTupleValue[]):CoreKeyTupleReceipt{
 const source=copyJson(input),identity=copyJson(identityInput) as unknown as CoreKeyIdentity,values=copyJson(valuesInput) as unknown as CoreKeyTupleValue[];
 if(!checkIdentity(identity))fail('KEY_TUPLE_IDENTITY','Explicit Record and stable Key identities are required','/identity');
 const validation=validateKeyCandidate(source);
 if(!validation.valid)fail(validation.diagnostics.some(d=>d.code==='KEY_EQUALITY')?'KEY_TUPLE_EQUALITY':'KEY_TUPLE_SOURCE',JSON.stringify(validation.diagnostics),'/source');
 const modules=(source as unknown as {modules:Module[]}).modules,mi=modules.findIndex(m=>m.id===identity.module),ei=modules[mi]?.elements.findIndex(e=>e.id===identity.element)??-1;
 const record=modules[mi]?.elements[ei],keys=record?.keys as CoreKeyDefinition[]|undefined,ki=keys?.findIndex(k=>k.id===identity.key)??-1;
 if(!record||record.kind!=='record'||ki<0)fail('KEY_TUPLE_MISSING','Explicit Record/Key identity does not resolve','/identity');
 const key=keys![ki]!,recordPath=`/modules/${mi}/elements/${ei}`,keyPath=recordPath+`/keys/${ki}`;
 if(!Array.isArray(values)||values.length!==key.fields.length)fail('KEY_TUPLE_ARITY','Expected one value per key component','/values');
 let text=0;
 for(const value of values)if(value&&typeof value==='object')for(const v of Object.values(value))if(typeof v==='string'){text+=v.length;if(text>limit)fail('LIMIT','Aggregate key value text exceeds limit','/values');}
 const fields=key.fields.map(ref=>{
  const mi=modules.findIndex(m=>m.id===ref.module),ei=modules[mi]!.elements.findIndex(e=>e.id===ref.element);
  const member=(record.members as CoreKeyFieldReference[]).findIndex(r=>id(r)===id(ref));
  return {field:modules[mi]!.elements[ei]!,path:`/modules/${mi}/elements/${ei}/facets`,member:recordPath+`/members/${member}`};
 });
 const relevant=[keyPath,...fields.flatMap(f=>[f.path,f.member])];
 for(const d of validation.diagnostics)if(d.severity==='warning'&&['UNKNOWN_KEY_QUALIFIER','UNKNOWN_FACET','UNKNOWN_FACET_UNIT'].includes(d.code)&&relevant.some(p=>d.path===p||d.path.startsWith(p+'/')))fail('KEY_TUPLE_UNKNOWN','Relevant qualifier has no defined encoding meaning',d.path);
 const parts:Uint8Array[]=[encoder.encode('UMFK1'),new Uint8Array(leb(values.length))];let length=parts.reduce((n,p)=>n+p.length,0);
 fields.forEach(({field},i)=>{
  const p=payload(field,values[i]!,`/values/${i}`),header=new Uint8Array([p.tag,...leb(p.bytes.length)]);
  length+=header.length+p.bytes.length;if(length>limit)fail('LIMIT','Encoded tuple exceeds limit','/values');parts.push(header,p.bytes);
 });
 const bytes=new Uint8Array(length);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
 // Chunking avoids quadratic concatenation and argument-count limits on large tuples.
 const chunks:string[]=[];for(let start=0;start<bytes.length;start+=4096)chunks.push(Array.from(bytes.subarray(start,start+4096),b=>b.toString(16).padStart(2,'0')).join(''));
 const receipt={operation:'encode-core-key-tuple',version:'1.0.0',profile:'umf-key-tuple-v1',source,identity,values,keyPath,bytesHex:chunks.join('')};
 if(!check(receipt))fail('KEY_TUPLE_RESULT',JSON.stringify(check.errors),'');
 return copyJson(receipt) as unknown as CoreKeyTupleReceipt;
}
export function verifyCoreKeyTuple(input:CoreKeyTupleReceipt,current:unknown):CoreKeyTupleReceipt{
 const receipt=copyJson(input) as unknown as CoreKeyTupleReceipt;
 if(!check(receipt))fail('KEY_TUPLE_RECEIPT','Malformed encoding receipt','');
 const expected=encodeCoreKeyTuple(receipt.source,receipt.identity,receipt.values);
 if(canonical(copyJson(expected))!==canonical(copyJson(receipt)))fail('KEY_TUPLE_RECEIPT','Receipt differs from exact recomputation','');
 if(canonical(copyJson(current))!==canonical(receipt.source))fail('KEY_TUPLE_STALE','Current document differs from retained context','/source');
 return receipt;
}
export function readCoreKeyTupleBytes(input:CoreKeyTupleReceipt,current:unknown):Uint8Array{
 const receipt=verifyCoreKeyTuple(input,current),bytes=new Uint8Array(receipt.bytesHex.length/2);
 for(let i=0;i<bytes.length;i++)bytes[i]=parseInt(receipt.bytesHex.slice(i*2,i*2+2),16);
 return bytes;
}
