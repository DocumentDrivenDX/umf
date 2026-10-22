import type {ParquetWireKind,ParquetWireValue} from './footer';
import {UmfError} from '../../model/types';
const fields:Record<string,string[]>={bool:['kind','value'],i8:['kind','value'],i16:['kind','value'],i32:['kind','value'],i64:['kind','value'],double:['kind','bits'],binary:['kind','hex'],uuid:['kind','hex'],list:['kind','elementType','items'],set:['kind','elementType','items'],map:['kind','keyType','valueType','entries'],struct:['kind','fields']};
const types:Record<ParquetWireKind,number>={bool:1,i8:3,i16:4,i32:5,i64:6,double:7,binary:8,list:9,set:10,map:11,struct:12,uuid:13};
/** Canonical Compact Protocol encoding; preserves wire values/order, not original varint spelling. */
export function encodeParquetWire(value:ParquetWireValue):Uint8Array {
 const out:number[]=[];let nodes=0;
 const fail=(message:string):never=>{throw new UmfError('PARQUET_WIRE_ENCODE',message);};
 const byte=(n:number)=>{if(out.length>=1_000_000)fail('Encoded value exceeds 1000000 bytes');out.push(n);};
 const unsigned=(n:bigint)=>{do{const b=Number(n&127n);n>>=7n;byte(b|(n?128:0));}while(n);};
 const integer=(s:string,bits:number)=>{if(typeof s!=='string'||! /^(?:0|-[1-9][0-9]*|[1-9][0-9]*)$/.test(s)||s.length>21)fail('Expected canonical signed decimal integer');const n=BigInt(s),limit=1n<<BigInt(bits-1);if(n< -limit||n>=limit)fail('Integer exceeds declared width');return n;};
 const signed=(n:bigint)=>unsigned(n>=0n?n<<1n:((-n)<<1n)-1n);
 const kind=(k:ParquetWireKind)=>{if(!Object.hasOwn(types,k))fail('Unknown wire kind');return types[k];};
 const hex=(s:string,length?:number)=>{if(typeof s!=='string'||s.length>2_000_000||! /^(?:[0-9a-f]{2})*$/.test(s)||length!==undefined&&s.length!==2*length)fail('Invalid exact byte encoding');for(let i=0;i<s.length;i+=2)byte(Number.parseInt(s.slice(i,i+2),16));};
 function write(v:ParquetWireValue,depth:number,field=false){
  if(!v||typeof v!=='object'||depth>64||++nodes>50000)fail('Wire value structural limit exceeded');kind(v.kind);if(Object.keys(v).some(k=>!fields[v.kind]!.includes(k)))fail('Unknown wire representation fields cannot be discarded');
  if(v.kind==='bool'){if(typeof v.value!=='boolean')fail('Expected boolean');if(!field)byte(v.value?1:2);}
  else if(v.kind==='i8')byte(Number(integer(v.value,8))&255);
  else if(v.kind==='i16'||v.kind==='i32'||v.kind==='i64')signed(integer(v.value,Number(v.kind.slice(1))));
  else if(v.kind==='double')hex(v.bits,8);
  else if(v.kind==='uuid')hex(v.hex,16);
  else if(v.kind==='binary'){if(typeof v.hex!=='string'||v.hex.length>2_000_000||! /^(?:[0-9a-f]{2})*$/.test(v.hex))fail('Binary length exceeds limit');unsigned(BigInt(v.hex.length/2));hex(v.hex);}
  else if(v.kind==='list'||v.kind==='set'){
   const type=kind(v.elementType);if(!Array.isArray(v.items)||v.items.length>50000-nodes)fail('Collection exceeds value limit');const n=v.items.length;byte((Math.min(n,15)<<4)|type);if(n>=15)unsigned(BigInt(n));for(const item of v.items){if(item.kind!==v.elementType)fail('Collection element kind differs');write(item,depth+1);}
  }else if(v.kind==='map'){
   if(!Array.isArray(v.entries)||v.entries.length*2>50000-nodes)fail('Map exceeds value limit');unsigned(BigInt(v.entries.length));if(v.entries.length){byte(kind(v.keyType!)<<4|kind(v.valueType!));for(const e of v.entries){if(Object.keys(e).some(k=>k!=='key'&&k!=='value'))fail('Unknown map entry fields');if(e.key.kind!==v.keyType||e.value.kind!==v.valueType)fail('Map entry kind differs');write(e.key,depth+1);write(e.value,depth+1);}}
   else if(v.keyType!==undefined||v.valueType!==undefined)fail('Empty Compact Protocol maps cannot encode type information');
  }else if(v.kind==='struct'){
   if(!Array.isArray(v.fields)||v.fields.length>50000-nodes)fail('Struct exceeds value limit');let previous=0;
   for(const f of v.fields){if(Object.keys(f).some(k=>k!=='id'&&k!=='value'))fail('Unknown struct field properties');if(!Number.isInteger(f.id)||f.id< -32768||f.id>32767)fail('Field ID exceeds int16');const delta=f.id-previous,type=f.value.kind==='bool'?(f.value.value?1:2):kind(f.value.kind);if(delta>0&&delta<=15)byte(delta<<4|type);else{byte(type);signed(BigInt(f.id));}previous=f.id;write(f.value,depth+1,true);}byte(0);
  }
 }
 write(value,0);return Uint8Array.from(out);
}
