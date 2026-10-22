import {assembleParquetRows,type ParquetRowValue} from './rows';
import {inspectParquetContainers} from './containers';
import type {ParquetPhysicalValue} from './physical';
import {checkParquetJsonText} from './json-text';
import type {Document,Diagnostic,Json} from '../../model/types';
export type ParquetTypedValue=null|{kind:'struct';fields:{index:number;name:string;value:ParquetTypedValue}[]}|{kind:'list';items:ParquetTypedValue[]}|{kind:'map';entries:{key:ParquetTypedValue;value:ParquetTypedValue}[];duplicateKeys:'last-value'}|{kind:'opaque';annotation:string;parameters:Json;physical:ParquetRowValue}|{kind:'bool';value:boolean;physical:ParquetPhysicalValue}|{kind:'int'|'uint'|'float';bits:number;value:string;physical:ParquetPhysicalValue}|{kind:'decimal'|'string'|'enum'|'json'|'bytes'|'uuid'|'int96'|'date';value:string;physical:ParquetPhysicalValue}|{kind:'time'|'timestamp';unit:'MILLIS'|'MICROS'|'NANOS';isAdjustedToUTC:boolean;value:string;physical:ParquetPhysicalValue};
export interface ParquetValues {source:Document;status:'projected'|'blocked';complete:false;diagnostics:Diagnostic[];rows?:ParquetTypedValue[]}
/** Logical views retain physical scalars and authoritative source; unsupported meanings stay opaque. */
export function decodeParquetValues(source:Document):ParquetValues {
 const view=inspectParquetContainers(source),r:ParquetValues={source:view.source,status:'blocked',complete:false,diagnostics:[...view.diagnostics]};if(view.status!=='checked')return r;
 const assembled=assembleParquetRows(source);r.diagnostics.push(...assembled.diagnostics);if(assembled.status!=='assembled')return r;
 const schema=(view.metadata as any).schema,annotations=new Map(view.annotations?.map(a=>[a.index,a])),containers=new Map(view.containers?.map(c=>[c.index,c]));let textUnits=0;const opaqueReported=new Set<number>();
 const text=(v:string)=>{textUnits+=v.length;if(textUnits>67108864)throw Error('Logical text exceeds 64 Mi UTF-16 unit budget');return v;};
 const field=(v:ParquetRowValue,index:number)=>{if(v?.kind!=='record')throw Error('Expected physical record');const f=v.fields.find(f=>f.index===index);if(!f)throw Error('Physical field missing');return f.value;};
 const rawBytes=(p:ParquetPhysicalValue)=>{if(!('hex' in p))throw Error('Expected physical bytes');const bytes=new Uint8Array(p.hex.length/2);for(let i=0;i<bytes.length;i++)bytes[i]=parseInt(p.hex.slice(2*i,2*i+2),16);return bytes;};
 const integer=(p:ParquetPhysicalValue)=>{if(p.type!=='INT32'&&p.type!=='INT64')throw Error('Expected integer carrier');return BigInt(p.value);};
 function project(index:number,raw:ParquetRowValue,inRepeated=false):ParquetTypedValue{
  if(raw===null)return null;const a=annotations.get(index),c=containers.get(index),p=a?.parameters as any;
  if(raw.kind==='repeated'&&!inRepeated)return {kind:'list',items:raw.items.map(v=>project(index,v,true))};
  if(c){const repeated=field(raw,c.repeatedIndex);if(repeated?.kind!=='repeated')throw Error('Expected repeated container');if(c.kind==='list')return {kind:'list',items:repeated.items.map(v=>project(c.elementIndex,c.layout==='two-level'?v:field(v,c.elementIndex),true))};return {kind:'map',duplicateKeys:'last-value',entries:repeated.items.map(v=>({key:project(c.keyIndex,field(v,c.keyIndex)),value:c.valueIndex===undefined?null:project(c.valueIndex,field(v,c.valueIndex))}))};}
  const opaque=():ParquetTypedValue=>{if(!opaqueReported.has(index)){opaqueReported.add(index);r.diagnostics.push({code:'PARQUET_VALUE_OPAQUE',path:'/schema/'+index,severity:'warning',message:'Logical annotation '+a!.name+' retains its physical representation without interpretation'});}return {kind:'opaque',annotation:a!.name,parameters:a!.parameters,physical:raw};};
  if(raw.kind==='record'){if(a)return opaque();return {kind:'struct',fields:raw.fields.map(f=>({index:f.index,name:f.name,value:project(f.index,f.value)}))};}
  if(raw.kind!=='physical')throw Error('Unexpected physical structure');const physical={...raw.value};
  if(a?.name==='UNKNOWN')throw Error('Non-null value contradicts UNKNOWN annotation');
  if(a?.name==='DECIMAL'){
   const precision=Number(p.precision),scale=Number(p.scale);if(precision>10000||scale>10000)throw Error('Decimal digit/scale budget exceeded');let n:bigint;
   if(physical.type==='INT32'||physical.type==='INT64')n=integer(physical);else{if(!('hex' in physical)||!physical.hex.length||physical.hex.length>8192)throw Error('Decimal byte budget exceeded');const bytes=rawBytes(physical);n=0n;for(const b of bytes)n=n*256n+BigInt(b);if(bytes[0]!&128)n-=1n<<BigInt(bytes.length*8);}
   const negative=n<0n,digits=(negative?-n:n).toString();if(digits.length>precision)throw Error('Decimal value exceeds declared precision');const padded=digits.padStart(scale+1,'0');return {kind:'decimal',value:text((negative?'-':'')+(scale?padded.slice(0,-scale)+'.'+padded.slice(-scale):padded)),physical};
  }
  if(a?.name==='INTEGER'){let n=integer(physical),bits=Number(p.bitWidth);if(!p.isSigned&&n<0n&&bits===(physical.type==='INT32'?32:64))n+=1n<<BigInt(bits);const low=p.isSigned?-(1n<<BigInt(bits-1)):0n,high=(1n<<BigInt(bits-(p.isSigned?1:0)))-1n;if(n<low||n>high)throw Error('Integer value exceeds logical width');return {kind:p.isSigned?'int':'uint',bits,value:text(n.toString()),physical};}
  if(a?.name==='STRING'||a?.name==='ENUM'||a?.name==='JSON'){let value:string;try{value=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(rawBytes(physical));}catch{throw Error('Invalid UTF-8 logical text');}if(a.name==='JSON')checkParquetJsonText(value);return {kind:a.name.toLowerCase() as 'string'|'enum'|'json',value:text(value),physical};}
  if(a?.name==='DATE')return {kind:'date',value:text(integer(physical).toString()),physical};
  if(a?.name==='TIME'||a?.name==='TIMESTAMP'){const unit=Object.keys(p.unit).find(k=>k!=='$unknown') as 'MILLIS'|'MICROS'|'NANOS';if(!['MILLIS','MICROS','NANOS'].includes(unit))return opaque();const n=integer(physical);if(a.name==='TIME'&&(n<0n||n>=86400n*{MILLIS:1000n,MICROS:1000000n,NANOS:1000000000n}[unit]))throw Error('Time value is outside a day');return {kind:a.name==='TIME'?'time':'timestamp',unit,isAdjustedToUTC:p.isAdjustedToUTC,value:text(n.toString()),physical};}
  if(a?.name==='UUID'){const h=(physical as {hex:string}).hex;return {kind:'uuid',value:text([h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-')),physical};}
  if(a?.name==='FLOAT16'||!a&&(physical.type==='FLOAT'||physical.type==='DOUBLE')){const bytes=rawBytes(physical),d=new DataView(bytes.buffer);let n:number,bits:number;
   if(a){const h=d.getUint16(0,true),sign=h&32768?-1:1,exp=(h>>>10)&31,f=h&1023;n=exp===31?(f?NaN:sign*Infinity):sign*(exp?2**(exp-15)*(1+f/1024):2**-14*f/1024);bits=16;}else{bits=physical.type==='FLOAT'?32:64;n=bits===32?d.getFloat32(0,true):d.getFloat64(0,true);}
   return {kind:'float',bits,value:text(Object.is(n,-0)?'-0':String(n)),physical};
  }
  if(a)return opaque();
  if(physical.type==='BOOLEAN')return {kind:'bool',value:physical.value,physical};if(physical.type==='INT32'||physical.type==='INT64')return {kind:'int',bits:physical.type==='INT32'?32:64,value:text(physical.value),physical};
  return {kind:physical.type==='INT96'?'int96':'bytes',value:text((physical as {hex:string}).hex),physical};
 }
 try{r.rows=assembled.rows!.map(v=>project(0,v));r.status='projected';r.diagnostics.push({code:'PARQUET_VALUE_SCOPE',path:'',severity:'warning',message:'Implemented logical views projected with physical scalars retained; unsupported meanings are opaque, other codecs/encodings remain unsupported and cross-system lowering is separate'});}catch(e){r.diagnostics.push({code:'PARQUET_VALUE_PROJECTION',path:'',severity:'error',message:(e as Error).message});}return r;
}
