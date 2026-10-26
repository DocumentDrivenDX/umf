// SPDX-License-Identifier: MIT OR Apache-2.0
/** RFC 8785 over admitted JSON. Reject lone surrogates rather than replacing. */
import type {AccountingContext} from '../../model/internal/accounting-context';
export function validateUnicode(text:string):void {for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);if(c>=0xd800&&c<=0xdbff){const n=text.charCodeAt(++i);if(!(n>=0xdc00&&n<=0xdfff))throw new Error('INPUT');}else if(c>=0xdc00&&c<=0xdfff)throw new Error('INPUT');}}
/** Exact UTF-8 size of JSON.stringify on valid Unicode, without token allocation. */
function jsonStringTokenUtf8Bytes(value:string):number{
 let bytes=2;
 for(let i=0;i<value.length;i++){
  const code=value.charCodeAt(i);
  if(code===0x22||code===0x5c||code===0x08||code===0x09||code===0x0a||code===0x0c||code===0x0d){bytes+=2;continue;}
  if(code<0x20){bytes+=6;continue;}
  if(code>=0xd800&&code<=0xdbff){bytes+=4;i++;continue;}
  bytes+=code<0x80?1:code<0x800?2:3;
 }
 return bytes;
}
export function canonical(value:unknown):string{return canonicalImpl(value);}
/** Private metered kernel; public callers retain canonical(value). */
export function canonicalCharged(value:unknown,accounting:AccountingContext,path='/'):string{return canonicalImpl(value,accounting,path);}
export type CanonicalHistoryMemberSpan={readonly kind:'plans'|'executions';readonly index:number;readonly value:object;readonly start:number;readonly end:number;readonly byteStart:number;readonly byteEnd:number};
export type CanonicalHistoryDocument={readonly text:string;readonly byteLength:number;readonly members:readonly CanonicalHistoryMemberSpan[]};
export type CanonicalText={readonly text:string;readonly byteLength:number};
type CanonicalCollector={path:string;byteLength:number;members?:CanonicalHistoryMemberSpan[]};
/** Private metered canonical writer retaining the exact emitted UTF-8 extent. */
export function canonicalChargedMeasured(value:unknown,accounting:AccountingContext,path='/'):CanonicalText{
 const collector:CanonicalCollector={path,byteLength:0};
 const text=canonicalImpl(value,accounting,path,collector);
 accounting.visit('canonical-measured-result-retention',path);
 return Object.freeze({text,byteLength:collector.byteLength});
}
/** Private fixed-shape history writer used only by the R2 source owner. */
export function canonicalChargedHistory(value:unknown,accounting:AccountingContext,path='/history'):CanonicalHistoryDocument{
 const members:CanonicalHistoryMemberSpan[]=[],collector:CanonicalCollector={path,members,byteLength:0};
 const text=canonicalImpl(value,accounting,path,collector);
 accounting.visit('canonical-history-document-retention',path);
 return Object.freeze({text,byteLength:collector.byteLength,members:Object.freeze(members)});
}
function ownSortedKeys(value:object,accounting:AccountingContext,path:string,kind:'canonical'|'hash'):string[]{
 let count=0;
 for(const key in value)if(Object.hasOwn(value,key)){accounting.visit(`${kind}-object-key-enumeration`,path);count++;}
 // Reserve the variable-length key-reference carrier before Object.keys
 // materializes it. Sorting then charges each comparison as actual work.
 accounting.visit(`${kind}-key-array-retention`,path,count);
 const keys=Object.keys(value);
 keys.sort((left,right)=>{accounting.visit(`${kind}-key-order-comparison`,path);return left<right?-1:left>right?1:0;});
 return keys;
}
function canonicalImpl(value:unknown,accounting?:AccountingContext,path='/',historyCollector?:CanonicalCollector):string {
 if(!accounting){
  if(typeof value==='string'){validateUnicode(value);return JSON.stringify(value);}
  if(value===null||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number'){if(!Number.isFinite(value))throw new Error('INPUT');return JSON.stringify(value);}
  if(Array.isArray(value))return '['+value.map(item=>canonical(item)).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>canonical(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';
  throw new Error('INPUT');
 }
 let output='',byteOffset=0;const append=(text:string,at:string)=>{byteOffset+=accounting.appendCanonicalChunk(text,at);output+=text;};
 const visit=(item:unknown,at:string):void=>{
  accounting.visit('canonical-node',at);
  if(typeof item==='string'){validateUnicode(item);const size=jsonStringTokenUtf8Bytes(item);accounting.retainBytes('canonical-token',size,at);const token=JSON.stringify(item);output+=token;byteOffset+=size;return;}
  if(item===null||typeof item==='boolean'){append(JSON.stringify(item),at);return;}
  if(typeof item==='number'){if(!Number.isFinite(item))throw new Error('INPUT');append(JSON.stringify(item),at);return;}
  if(Array.isArray(item)){append('[',at);for(let i=0;i<item.length;i++){if(i)append(',',at);accounting.visit('canonical-array-slot',`${at}/${i}`);visit(item[i],`${at}/${i}`);}append(']',at);return;}
  if(item&&typeof item==='object'){append('{',at);const keys=ownSortedKeys(item,accounting,at,'canonical');for(let i=0;i<keys.length;i++){const key=keys[i]!;if(i)append(',',at);accounting.visit('canonical-object-key',`${at}/${key}`);const keyPath=`${at}/${key}`;validateUnicode(key);const size=jsonStringTokenUtf8Bytes(key);accounting.retainBytes('canonical-token',size,keyPath);const token=JSON.stringify(key);output+=token;byteOffset+=size;append(':',at);const child=(item as Record<string,unknown>)[key],kind=historyCollector?.members&&at===historyCollector.path&&Array.isArray(child)&&(key==='plans'||key==='executions')?key:undefined;if(kind){accounting.visit('canonical-node',`${at}/${key}`);append('[',`${at}/${key}`);const values=child as unknown[];for(let index=0;index<values.length;index++){if(index)append(',',`${at}/${key}`);accounting.visit('canonical-array-slot',`${at}/${key}/${index}`);const start=output.length,byteStart=byteOffset,member=values[index];visit(member,`${at}/${key}/${index}`);if(member!==null&&typeof member==='object'&&historyCollector!.members!.length<256){accounting.visit('canonical-history-span-retention',`${at}/${key}/${index}`);historyCollector!.members!.push(Object.freeze({kind,index,value:member,start,end:output.length,byteStart,byteEnd:byteOffset}));}}append(']',`${at}/${key}`);}else visit(child,`${at}/${key}`);}append('}',at);return;}
  throw new Error('INPUT');
 };visit(value,path);if(historyCollector)historyCollector.byteLength=byteOffset;return output;
}
const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
/** Incremental SHA-256 keeps source archives out of one aggregate byte buffer. */
class Sha256 {
 private readonly state=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
 private readonly tail=new Uint8Array(64);
 private used=0;
 private length=0;
 update(text:string,accounting?:AccountingContext,path='/',precharged=false):void {
  if(!precharged)accounting?.appendCanonicalChunk(text,path);
  const bytes=new TextEncoder().encode(text);this.length+=bytes.length;let offset=0;
  if(this.used){const count=Math.min(64-this.used,bytes.length);this.tail.set(bytes.subarray(0,count),this.used);this.used+=count;offset+=count;if(this.used===64){this.block(this.tail);this.used=0;}}
  while(offset+64<=bytes.length){this.block(bytes.subarray(offset,offset+64));offset+=64;}
  if(offset<bytes.length){this.tail.set(bytes.subarray(offset),0);this.used=bytes.length-offset;}
 }
 private block(bytes:Uint8Array):void {
  const w=new Uint32Array(64),view=new DataView(bytes.buffer,bytes.byteOffset,64),rotate=(x:number,n:number)=>(x>>>n)|(x<<(32-n));
  for(let i=0;i<16;i++)w[i]=view.getUint32(i*4);
  for(let i=16;i<64;i++){const a=w[i-15]!,b=w[i-2]!;w[i]=((rotate(a,7)^rotate(a,18)^(a>>>3))+w[i-16]!+(rotate(b,17)^rotate(b,19)^(b>>>10))+w[i-7]!)>>>0;}
  let [a,b,c,d,e,f,g,h]=this.state as [number,number,number,number,number,number,number,number];
  for(let i=0;i<64;i++){const t=(h+(rotate(e,6)^rotate(e,11)^rotate(e,25))+((e&f)^(~e&g))+K[i]!+w[i]!)>>>0,u=((rotate(a,2)^rotate(a,13)^rotate(a,22))+((a&b)^(a&c)^(b&c)))>>>0;h=g;g=f;f=e;e=(d+t)>>>0;d=c;c=b;b=a;a=(t+u)>>>0;}
  const next=[a,b,c,d,e,f,g,h];for(let i=0;i<8;i++)this.state[i]=(this.state[i]!+next[i]!)>>>0;
 }
 finish():string {
  const end=new Uint8Array(this.used<56?64:128);end.set(this.tail.subarray(0,this.used));end[this.used]=128;const view=new DataView(end.buffer);view.setUint32(end.length-8,Math.floor(this.length/536870912));view.setUint32(end.length-4,(this.length*8)>>>0);for(let i=0;i<end.length;i+=64)this.block(end.subarray(i,i+64));return this.state.map(n=>n.toString(16).padStart(8,'0')).join('');
 }
}
export function sha256Text(text:string,maximum=33554432):string{return sha256TextImpl(text,maximum);}
/** Private metered kernel; public callers retain sha256Text(text, maximum). */
export function sha256TextCharged(text:string,maximum:number,accounting:AccountingContext,path='/'):string{return sha256TextImpl(text,maximum,accounting,path);}
/** Internal streaming text-hash leaf for fixed canonical writers; never a public precharged switch. */
export function sha256TextChunksCharged(write:(append:(text:string,path?:string)=>void)=>void,accounting:AccountingContext,path='/'):string{
 const hash=new Sha256();write((text,chunkPath=path)=>{validateUnicode(text);hash.update(text,accounting,chunkPath);});return hash.finish();
}
function utf8ByteLength(text:string):number{let bytes=0;for(let index=0;index<text.length;index++){const code=text.charCodeAt(index);if(code<0x80)bytes++;else if(code<0x800)bytes+=2;else if(code>=0xd800&&code<=0xdbff){bytes+=4;index++;}else bytes+=3;}return bytes;}
function sha256TextImpl(text:string,maximum:number,accounting?:AccountingContext,path='/'):string {validateUnicode(text);const byteLength=accounting?accounting.scanUtf8(text,path):utf8ByteLength(text);if(byteLength>maximum)throw new Error('LIMIT');const hash=new Sha256();hash.update(text);return hash.finish();}
/** Exact JCS identity, streamed across admitted source strings. No extra 64MiB cap. */
export function hashCanonical(value:unknown):string{return hashCanonicalImpl(value);}
/** Private metered kernel; public callers retain hashCanonical(value). */
export function hashCanonicalCharged(value:unknown,accounting:AccountingContext,path='/'):string{return hashCanonicalImpl(value,accounting,path);}
function hashCanonicalImpl(value:unknown,accounting?:AccountingContext,path='/'):string {
 const hash=new Sha256();
 const append=(text:string,at:string,precharged=false)=>hash.update(text,accounting,at,precharged);
 const appendString=(value:string,at:string)=>{validateUnicode(value);accounting?.retainBytes('canonical-token',jsonStringTokenUtf8Bytes(value),at);append(JSON.stringify(value),at,!!accounting);};
 const visit=(v:unknown,at:string):void=>{
  accounting?.visit('hash-node',at);
  if(typeof v==='string'){appendString(v,at);return;}
  if(v===null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)){append(JSON.stringify(v),at);return;}
  if(Array.isArray(v)){append('[',at);v.forEach((item,i)=>{if(i)append(',',at);accounting?.visit('hash-array-slot',`${at}/${i}`);visit(item,`${at}/${i}`);});append(']',at);return;}
  if(v&&typeof v==='object'){append('{',at);const keys=accounting?ownSortedKeys(v,accounting,at,'hash'):Object.keys(v).sort();keys.forEach((key,i)=>{if(i)append(',',at);accounting?.visit('hash-object-key',`${at}/${key}`);const keyPath=`${at}/${key}`;if(accounting)accounting.retainBytes('canonical-token',jsonStringTokenUtf8Bytes(key),keyPath);append(JSON.stringify(key),keyPath,!!accounting);append(':',at);visit((v as Record<string,unknown>)[key],`${at}/${key}`);});append('}',at);return;}
  throw new Error('INPUT');
 };visit(value,path);return hash.finish();
}
