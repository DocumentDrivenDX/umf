/** RFC 8785 over admitted JSON. Reject lone surrogates rather than replacing. */
export function validateUnicode(text:string):void {for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);if(c>=0xd800&&c<=0xdbff){const n=text.charCodeAt(++i);if(!(n>=0xdc00&&n<=0xdfff))throw new Error('INPUT');}else if(c>=0xdc00&&c<=0xdfff)throw new Error('INPUT');}}
export function canonical(value:unknown):string {
 if(typeof value==='string'){validateUnicode(value);return JSON.stringify(value);}
 if(value===null||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='number'){if(!Number.isFinite(value))throw new Error('INPUT');return JSON.stringify(value);}
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>canonical(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';
 throw new Error('INPUT');
}
const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
/** Incremental SHA-256 keeps source archives out of one aggregate byte buffer. */
class Sha256 {
 private readonly state=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
 private readonly tail=new Uint8Array(64);
 private used=0;
 private length=0;
 update(text:string):void {
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
export function sha256Text(text:string,maximum=33554432):string {validateUnicode(text);if(new TextEncoder().encode(text).length>maximum)throw new Error('LIMIT');const hash=new Sha256();hash.update(text);return hash.finish();}
/** Exact JCS identity, streamed across admitted source strings. No extra 64MiB cap. */
export function hashCanonical(value:unknown):string {
 const hash=new Sha256();
 const visit=(v:unknown):void=>{
  if(typeof v==='string'){validateUnicode(v);hash.update(JSON.stringify(v));return;}
  if(v===null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)){hash.update(JSON.stringify(v));return;}
  if(Array.isArray(v)){hash.update('[');v.forEach((item,i)=>{if(i)hash.update(',');visit(item);});hash.update(']');return;}
  if(v&&typeof v==='object'){hash.update('{');Object.keys(v).sort().forEach((key,i)=>{if(i)hash.update(',');visit(key);hash.update(':');visit((v as Record<string,unknown>)[key]);});hash.update('}');return;}
  throw new Error('INPUT');
 };visit(value);return hash.finish();
}
