// SPDX-License-Identifier: MIT OR Apache-2.0
import {scanJsonFrame} from '../../model/internal/scan-json-frame';
import {boundedJsonBytes} from '../../model/internal/json-byte-budget';
import {copyJson} from '../../model/json';
import {readJsonValue,assertExactJsonNumber} from '../../model/serialization';
import {UmfError,type Json} from '../../model/types';
import {canonicalSchemaJson} from '../../model/schema-literals';
import type {ActionPlanArtifact} from './plan-types';
export const PLAN_BYTES=1048576;
export const planError=(code:string,message:string,path=''):never=>{throw new UmfError(code,message,path);};
export function validUnicode(text:string):void {
 for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);if(c>=0xd800&&c<=0xdbff){const n=text.charCodeAt(++i);if(!(n>=0xdc00&&n<=0xdfff))planError('PAP_INVALID','Unpaired Unicode surrogate');}else if(c>=0xdc00&&c<=0xdfff)planError('PAP_INVALID','Unpaired Unicode surrogate');}
}
export function validatePlanStrings(value:unknown,depth=0):void {
 if(typeof value==='string')validUnicode(value);else if(value&&typeof value==='object')for(const [key,child] of Object.entries(value)){validUnicode(key);validatePlanStrings(child,depth+1);}
}
export function utf8Size(text:string,maximum=PLAN_BYTES):number {
 let bytes=0;for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);if(c>=0xd800&&c<=0xdbff){const n=text.charCodeAt(++i);if(!(n>=0xdc00&&n<=0xdfff))planError('PAP_INVALID','Unpaired Unicode surrogate');bytes+=4;}else if(c>=0xdc00&&c<=0xdfff)planError('PAP_INVALID','Unpaired Unicode surrogate');else bytes+=c<128?1:c<2048?2:3;if(bytes>maximum)planError('PAP_LIMIT','Artifact byte bound exceeded');}return bytes;
}
const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
/** Synchronous portable SHA-256 over original UTF-8; native crypto is test-only. */
export function sha256Text(text:string,maximum=PLAN_BYTES):string {
 utf8Size(text,maximum);const input=new TextEncoder().encode(text),data=new Uint8Array(Math.ceil((input.length+9)/64)*64);data.set(input);data[input.length]=128;new DataView(data.buffer).setUint32(data.length-4,input.length*8);
 const h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],w=new Uint32Array(64),dv=new DataView(data.buffer),r=(x:number,n:number)=>(x>>>n)|(x<<(32-n));
 for(let offset=0;offset<data.length;offset+=64){for(let i=0;i<16;i++)w[i]=dv.getUint32(offset+i*4);for(let i=16;i<64;i++){const a=w[i-15]!,b=w[i-2]!;w[i]=((r(a,7)^r(a,18)^(a>>>3))+w[i-16]!+(r(b,17)^r(b,19)^(b>>>10))+w[i-7]!)>>>0;}
  let [a,b,c,d,e,f,g,j]=h as [number,number,number,number,number,number,number,number];for(let i=0;i<64;i++){const t=(j+(r(e,6)^r(e,11)^r(e,25))+((e&f)^(~e&g))+K[i]!+w[i]!)>>>0,u=((r(a,2)^r(a,13)^r(a,22))+((a&b)^(a&c)^(b&c)))>>>0;j=g;g=f;f=e;e=(d+t)>>>0;d=c;c=b;b=a;a=(t+u)>>>0;}
  const v=[a,b,c,d,e,f,g,j];for(let i=0;i<8;i++)h[i]=(h[i]!+v[i]!)>>>0;
 }return h.map(n=>n.toString(16).padStart(8,'0')).join('');
}
/** Bound depth/nodes, decode keys for duplicates and validate Unicode BEFORE full parsing/copy. */
export function scanPlanJson(text:string,maximum=PLAN_BYTES,maxNodes=100000,maxDepth=64):void {
 utf8Size(text,maximum);
 try {scanJsonFrame(text,maxNodes,maxDepth,validUnicode);}
 catch(error){if(error instanceof UmfError)planError(error.code==='LIMIT'?'PAP_LIMIT':'PAP_INVALID',error.message);throw error;}
}
export function parsePlanJson(text:string,maximum=PLAN_BYTES):Json {
 scanPlanJson(text,maximum);try{return readJsonValue(text,'json');}catch(error){if(error instanceof UmfError&&error.code==='LIMIT')planError('PAP_LIMIT','Core JSON limit');return planError('PAP_INVALID','Noninteroperable JSON');}
}
export function readPlanArtifact(input:ActionPlanArtifact,maximum=PLAN_BYTES):ActionPlanArtifact {
 let a:ActionPlanArtifact;try{a=copyJson(input) as unknown as ActionPlanArtifact;}catch(error){return planError(error instanceof UmfError&&error.code==='LIMIT'?'PAP_LIMIT':'PAP_INVALID','Artifact JSON admission refused','/artifact');}
 const envelope=(value:unknown,depth=0):void=>{if(depth>64)planError('PAP_LIMIT','Artifact metadata nesting bound exceeded');if(typeof value==='string'){validUnicode(value);return;}if(value&&typeof value==='object'){for(const [key,child] of Object.entries(value)){validUnicode(key);envelope(child,depth+1);}}};
 envelope(a);try{boundedJsonBytes(a as unknown as Json,maximum===PLAN_BYTES?4194304:maximum*6+4194304);}catch{planError('PAP_LIMIT','Artifact envelope byte bound exceeded');}
if(!a||typeof a!=='object'||Array.isArray(a)||typeof a.mediaType!=='string'||!a.mediaType||a.mediaType.length>256||typeof a.utf8!=='string'||typeof a.sha256!=='string'||!/^[0-9a-f]{64}$/.test(a.sha256))planError('PAP_INVALID','Malformed original artifact');validUnicode(a.mediaType);utf8Size(a.utf8,maximum);return a;
}
export function verifyPlanArtifact(a:ActionPlanArtifact,maximum=PLAN_BYTES):void {if(sha256Text(a.utf8,maximum)!==a.sha256)planError('PAP_INTEGRITY','Original artifact digest mismatch');}
export const jsonEqual=(a:unknown,b:unknown)=>canonicalSchemaJson(a)===canonicalSchemaJson(b);
export function preparedArtifact(value:unknown):ActionPlanArtifact {const safe=copyJson(value);validatePlanStrings(safe);const utf8=canonicalSchemaJson(safe);utf8Size(utf8);return {mediaType:'application/json',utf8,sha256:sha256Text(utf8)};}
