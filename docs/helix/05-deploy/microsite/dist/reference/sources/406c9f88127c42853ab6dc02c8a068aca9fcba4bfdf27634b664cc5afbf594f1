import {readJsonValue} from '../../model/serialization';
import {UmfError,type Document,type Json} from '../../model/types';
import {copyJson} from '../../model/json';
import {encodeBit128CarrierValue,decodeBit128CarrierValue} from './bit128';
import {encodeModelScalar,decodeModelScalar} from './model-scalar';
import type {ModelShape} from './model-shape';
import type {CoreLiteral} from '../../model/schema-literals';
export type ModelLiteral=CoreLiteral|{group:{field:{module:string;element:string};value:ModelLiteral}[]}|{array:ModelLiteral[]}|{map:{[key:string]:ModelLiteral}};
const key=(v:{module:string;element:string})=>JSON.stringify([v.module,v.element]);
function fail():never{throw new UmfError('MODEL_SHAPE_VALUE','Malformed or incomplete composite value');}
function checkShape(node:ModelShape,value:ModelLiteral){
 if(value===null){if(node.field.nullability!=='absent-allowed')fail();return;}
 if(typeof value!=='object'||Array.isArray(value))fail();
 const size=(node.field.facets as {collectionSize?:{min?:number;max?:number}}|undefined)?.collectionSize;
 if(size){const n=node.kind==='array'&&'array'in value?value.array.length:node.kind==='map'&&'map'in value?Object.keys(value.map).length:-1;if(n<0||size.min!==undefined&&n<size.min||size.max!==undefined&&n>size.max)fail();}
}
/** Native nested JSON-safe tokens; pair children remain together, no host integers. */
export function encodeShape(binding:Document,source:Document,node:ModelShape,input:ModelLiteral):Json{
 const value=copyJson(input) as unknown as ModelLiteral;checkShape(node,value);if(value===null)return null;
 if(node.kind==='leaf'){
  if(node.carrier.kind==='scalar')return encodeModelScalar(source,node.identity,node.field,value as CoreLiteral);
  const slots=encodeBit128CarrierValue(binding,source,node.identity,value as CoreLiteral);
  return node.carrier.kind==='words64'?slots:slots[node.carrier.column]!;
 }
 if(Object.keys(value).length!==1)fail();
 if(node.kind==='array'){if(!('array'in value)||!Array.isArray(value.array))fail();return value.array.map(v=>encodeShape(binding,source,node.item,v));}
 if(node.kind==='map'){if(!('map'in value)||!value.map||typeof value.map!=='object'||Array.isArray(value.map))fail();return Object.fromEntries(Object.entries(value.map).map(([k,v])=>[k,encodeShape(binding,source,node.item,v)]));}
 if(!('group'in value)||!Array.isArray(value.group)||value.group.length!==node.members.length)fail();
 const ids=new Set<string>();for(const item of value.group){if(!item||Object.keys(item).sort().join(',')!=='field,value'||!item.field||Object.keys(item.field).sort().join(',')!=='element,module'||ids.has(key(item.field)))fail();ids.add(key(item.field));}
 return Object.fromEntries(node.members.map((member,i)=>{const entry=value.group.find(r=>key(r.field)===key(member.identity));if(!entry)fail();return ['m'+i,encodeShape(binding,source,member,entry.value)];}));
}
export function decodeShape(binding:Document,source:Document,node:ModelShape,input:Json):ModelLiteral{
 let value:ModelLiteral;
 if(input===null)value=null;
 else if(node.kind==='leaf'){
  if(node.carrier.kind==='scalar'){if(typeof input!=='string')fail();value=decodeModelScalar(source,node.identity,node.field,input);}
  else{const c=node.carrier;if(c.kind==='words64'){if(!input||typeof input!=='object'||Array.isArray(input))fail();value=decodeBit128CarrierValue(binding,source,node.identity,input as Record<string,string|null>);}else{if(typeof input!=='string')fail();value=decodeBit128CarrierValue(binding,source,node.identity,{[c.column]:input});}}
 }else if(node.kind==='array'){if(!Array.isArray(input))fail();value={array:input.map(v=>decodeShape(binding,source,node.item,v))};}
 else if(node.kind==='map'){if(typeof input!=='object'||Array.isArray(input))fail();value={map:Object.fromEntries(Object.entries(input).map(([k,v])=>[k,decodeShape(binding,source,node.item,v)]))};}
 else{if(typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==node.members.length||node.members.some((_,i)=>!Object.hasOwn(input,'m'+i)))fail();value={group:node.members.map((member,i)=>({field:member.identity,value:decodeShape(binding,source,member,input['m'+i]!)}))};}
 encodeShape(binding,source,node,value);return value;
}

export function decodeStoredShape(binding:Document,source:Document,node:ModelShape,token:string|null):ModelLiteral {
 const value=token===null?null:readJsonValue(token,'json');
 if(token!==null&&value===null)throw new UmfError('MODEL_SHAPE_VALUE','Native JSON null is not SQL/CSV absence');
 return decodeShape(binding,source,node,value);
}
