/** Spark 4.0.1 legacy Murmur3 UTF8 hashing, including signed individual tail bytes. */
export function sparkStringHash(value:string|null,seed=42):number {
 if(value===null)return seed|0;const b=new TextEncoder().encode(value);if(new TextDecoder('utf-8',{ignoreBOM:true}).decode(b)!==value)throw Error('Hash key must round trip UTF-8');const d=new DataView(b.buffer),rotate=(v:number,n:number)=>(v<<n)|(v>>>(32-n));
 const mix=(v:number)=>Math.imul(rotate(Math.imul(v,0xcc9e2d51),15),0x1b873593);let h=seed|0,i=0;
 const step=(v:number)=>{h=(Math.imul(rotate(h^mix(v),13),5)+0xe6546b64)|0;};
 for(;i+4<=b.length;i+=4)step(d.getInt32(i,true));for(;i<b.length;i++)step((b[i]!<<24)>>24);
 h^=b.length;h^=h>>>16;h=Math.imul(h,0x85ebca6b);h^=h>>>13;h=Math.imul(h,0xc2b2ae35);return (h^(h>>>16))|0;
}
