export type ParquetPhysicalValue={type:'BOOLEAN';value:boolean}|{type:'INT32'|'INT64';value:string}|{type:'FLOAT'|'DOUBLE'|'INT96'|'BYTE_ARRAY'|'FIXED_LEN_BYTE_ARRAY';hex:string};
export function physicalValueBytes(v:ParquetPhysicalValue){return v.type==='BOOLEAN'?1:v.type==='INT32'?4:v.type==='INT64'?8:('hex' in v?v.hex.length/2+(v.type==='BYTE_ARRAY'?4:0):0);}
/** Exact physical carriers only; caller owns logical interpretation. */
export function decodeParquetPlain(input:Uint8Array,type:string,count:number,fixedLength?:number):ParquetPhysicalValue[]{
 if(!(input instanceof Uint8Array)||input.length>8388608||!Number.isInteger(count)||count<0||count>100000)throw Error('PLAIN decoder bound exceeded');
 if(!['BOOLEAN','INT32','INT64','INT96','FLOAT','DOUBLE','BYTE_ARRAY','FIXED_LEN_BYTE_ARRAY'].includes(type))throw Error('Unknown PLAIN physical type');
 if(type==='FIXED_LEN_BYTE_ARRAY'&&(!Number.isInteger(fixedLength)||fixedLength!<=0||fixedLength!>8388608))throw Error('Invalid fixed byte width');
 const view=new DataView(input.buffer,input.byteOffset,input.byteLength),values:ParquetPhysicalValue[]=[];let at=0;
 const take=(n:number)=>{if(n>input.length-at)throw Error('PLAIN value exceeds input');const start=at;at+=n;return start;};
 const hex=(start:number,n:number)=>{const chunks:string[]=[];for(let i=start;i<start+n;i+=4096)chunks.push(Array.from(input.subarray(i,Math.min(start+n,i+4096)),b=>b.toString(16).padStart(2,'0')).join(''));return chunks.join('');};
 if(type==='BOOLEAN'){if(input.length!==Math.ceil(count/8))throw Error('PLAIN boolean length mismatch');for(let i=0;i<count;i++)values.push({type,value:!!((input[Math.floor(i/8)]!>>>(i%8))&1)});return values;}
 for(let i=0;i<count;i++){
  if(type==='INT32')values.push({type,value:String(view.getInt32(take(4),true))});else if(type==='INT64')values.push({type,value:view.getBigInt64(take(8),true).toString()});
  else{let n=type==='FLOAT'?4:type==='DOUBLE'?8:type==='INT96'?12:type==='FIXED_LEN_BYTE_ARRAY'?fixedLength!:view.getUint32(take(4),true);const start=take(n);values.push({type:type as 'BYTE_ARRAY',hex:hex(start,n)});}
 }
 if(at!==input.length)throw Error('Trailing PLAIN bytes');return values;
}
