import type {ParquetWireKind,ParquetWireValue} from './footer';
/** Reads one bounded Compact struct prefix; caller controls its byte region. */
export function decodeCompactStruct(bytes:Uint8Array){
 let at=0,nodes=0;
 const byte=()=>{if(at>=bytes.length)throw Error('Truncated Compact Protocol value');return bytes[at++]!;};
 function take(length:number){if(length>bytes.length-at)throw Error('Binary value exceeds footer region');const value=bytes.subarray(at,at+length);at+=length;return Array.from(value,b=>b.toString(16).padStart(2,'0')).join('');}
 function unsigned(bits:number):bigint{let n=0n;for(let i=0;i<Math.ceil(bits/7);i++){const b=byte();n|=BigInt(b&127)<<BigInt(i*7);if(!(b&128)){if(n>=(1n<<BigInt(bits)))throw Error('Varint exceeds declared width');return n;}}throw Error('Varint exceeds declared width');}
 const signed=(bits:number)=>{const n=unsigned(bits);return (n>>1n)^-(n&1n);};
 const size=()=>{const n=unsigned(32);if(n>2147483647n)throw Error('Length exceeds signed int32');return Number(n);};
 const kind=(type:number):ParquetWireKind=>{const k=([undefined,'bool','bool','i8','i16','i32','i64','double','binary','list','set','map','struct','uuid'] as const)[type];if(!k)throw Error('Unknown Compact Protocol wire type '+type);return k;};
 function value(type:number,depth:number,field=false):ParquetWireValue{
  if(depth>64||++nodes>50000)throw Error('Compact Protocol structural limit exceeded');const k=kind(type);
  if(k==='bool'){const b=field?type:byte();if(b!==1&&b!==2)throw Error('Invalid boolean encoding');return {kind:k,value:b===1};}
  if(k==='i8'){const b=byte();return {kind:k,value:String(b<128?b:b-256)};}
  if(k==='i16'||k==='i32'||k==='i64')return {kind:k,value:signed(Number(k.slice(1))).toString()};
  if(k==='double')return {kind:k,bits:take(8)};if(k==='uuid')return {kind:k,hex:take(16)};if(k==='binary')return {kind:k,hex:take(size())};
  if(k==='list'||k==='set'){const header=byte(),element=header&15,count=header>>4===15?size():header>>4,elementType=kind(element);if(count>50000-nodes)throw Error('Collection exceeds value limit');const items:ParquetWireValue[]=[];for(let i=0;i<count;i++)items.push(value(element,depth+1));return {kind:k,elementType,items};}
  if(k==='map'){const count=size(),entries:{key:ParquetWireValue;value:ParquetWireValue}[]=[];if(!count)return {kind:k,entries};if(count*2>50000-nodes)throw Error('Map exceeds value limit');const header=byte(),kt=header>>4,vt=header&15,keyType=kind(kt),valueType=kind(vt);for(let i=0;i<count;i++)entries.push({key:value(kt,depth+1),value:value(vt,depth+1)});return {kind:k,keyType,valueType,entries};}
  const fields:{id:number;value:ParquetWireValue}[]=[];let previous=0;
  while(true){const header=byte();if(header===0)break;const type=header&15,delta=header>>4,id=delta?previous+delta:Number(signed(16));if(id< -32768||id>32767)throw Error('Field ID exceeds signed int16');previous=id;fields.push({id,value:value(type,depth+1,true)});}
  return {kind:'struct',fields};
 }
 return {value:value(12,0),consumedBytes:at};
}
