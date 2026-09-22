import {copyJson} from '../model/json';
import {UmfError} from '../model/types';
import {parquetCarriers} from './parquet-carriers';
import {encodeParquetWire} from '../adapters/parquet/encode';
import type {ParquetWireValue} from '../adapters/parquet/footer';

type Availability={nullable:boolean;fieldId?:number};
export type ParquetCardinalityCarrier=Availability&(
 {kind:'scalar';nativeType:keyof typeof parquetCarriers}|
 {kind:'array';item:ParquetCardinalityCarrier}|
 {kind:'map';keyType:keyof typeof parquetCarriers;value:ParquetCardinalityCarrier}|
 {kind:'record';fields:{name:string;type:ParquetCardinalityCarrier}[]}
);
/** Empty native schema file. Explicit carrier choice, never an implicit ideal or row conversion. */
export function parquetCardinalityFile(recordName:string,fieldName:string,input:ParquetCardinalityCarrier):Uint8Array {
 const carrier=copyJson(input) as unknown as ParquetCardinalityCarrier;
 const fail=(message:string):never=>{throw new UmfError('PARQUET_CARDINALITY_CARRIER',message);};
 const text=(value:string):ParquetWireValue=>{
  if(typeof value!=='string'||!value||/[\u0000\uD800-\uDFFF]/u.test(value))fail('Nonempty Unicode scalar name without NUL required');
  return {kind:'binary',hex:Array.from(new TextEncoder().encode(value),b=>b.toString(16).padStart(2,'0')).join('')};
 };
 const int=(n:number):ParquetWireValue=>({kind:'i32',value:String(n)});
 type Field={id:number;value:ParquetWireValue};
 const struct=(fields:Field[]):ParquetWireValue=>({kind:'struct',fields});
 const schema:ParquetWireValue[]=[struct([{id:4,value:text(recordName)},{id:5,value:int(1)}])];
 function emit(name:string,node:ParquetCardinalityCarrier,depth:number){
  if(depth>24||schema.length>1000)fail('Native type exceeds depth 24 or 1000 schema nodes');
  if(!node||typeof node!=='object'||Array.isArray(node)||typeof node.nullable!=='boolean')fail('Every native value needs an explicit nullable boolean');
  const allowed:Record<string,string[]>={scalar:['nativeType'],array:['item'],map:['keyType','value'],record:['fields']};
  if(!Object.hasOwn(allowed,node.kind)||Object.keys(node).some(k=>!['kind','nullable','fieldId',...allowed[node.kind]!].includes(k)))fail('Unknown native type content cannot be discarded');
  const fields:Field[]=[{id:3,value:int(node.nullable?1:0)},{id:4,value:text(name)}];
  if(node.fieldId!==undefined){if(!Number.isInteger(node.fieldId)||node.fieldId< -2147483648||node.fieldId>2147483647)fail('Field ID must be an exact int32');fields.push({id:9,value:int(node.fieldId)});}
  const add=(extra:Field[])=>schema.push(struct([...fields,...extra].sort((a,b)=>a.id-b.id)));
  if(node.kind==='scalar'){
   if(!Object.hasOwn(parquetCarriers,node.nativeType))fail('Unknown native scalar carrier');
   const primitive=parquetCarriers[node.nativeType];
   add([{id:1,value:int(primitive.type)},...('converted'in primitive?[{id:6,value:int(primitive.converted)}]:[])]);
  }else if(node.kind==='array'){
   add([{id:5,value:int(1)},{id:6,value:int(3)},{id:10,value:struct([{id:3,value:struct([])}])}]);
   schema.push(struct([{id:3,value:int(2)},{id:4,value:text('list')},{id:5,value:int(1)}]));
   emit('element',node.item,depth+1);
  }else if(node.kind==='map'){
   if(!Object.hasOwn(parquetCarriers,node.keyType))fail('Unknown native key carrier');
   add([{id:5,value:int(1)},{id:6,value:int(1)},{id:10,value:struct([{id:2,value:struct([])}])}]);
   schema.push(struct([{id:3,value:int(2)},{id:4,value:text('key_value')},{id:5,value:int(2)}]));
   emit('key',{kind:'scalar',nativeType:node.keyType,nullable:false},depth+1);
   emit('value',node.value,depth+1);
  }else{
   if(!Array.isArray(node.fields)||node.fields.length===0)fail('A native record requires at least one field');
   const names=new Set<string>();
   for(const field of node.fields){
    if(!field||typeof field!=='object'||Array.isArray(field)||Object.keys(field).some(k=>!['name','type'].includes(k)))fail('Invalid record member');
    text(field.name);if(names.has(field.name))fail('Duplicate native record member name');names.add(field.name);
   }
   add([{id:5,value:int(node.fields.length)}]);
   for(const field of node.fields)emit(field.name,field.type,depth+1);
  }
 }
 emit(fieldName,carrier,0);
 if(schema.length>1000)fail('Native type exceeds 1000 schema nodes');
 const footer=encodeParquetWire(struct([{id:1,value:int(1)},{id:2,value:{kind:'list',elementType:'struct',items:schema}},{id:3,value:{kind:'i64',value:'0'}},{id:4,value:{kind:'list',elementType:'struct',items:[]}}]));
 const bytes=new Uint8Array(footer.length+12);bytes.set([80,65,82,49]);bytes.set(footer,4);new DataView(bytes.buffer).setUint32(footer.length+4,footer.length,true);bytes.set([80,65,82,49],footer.length+8);return bytes;
}
