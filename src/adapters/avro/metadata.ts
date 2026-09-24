import {copyJson} from '../../model/json';
import {readJsonValue} from '../../model/serialization';
import {type Element,type ScalarType} from '../../model/types';
import {type NativeJson} from '../../model/native-json';
import type {AvroPayload} from './index';
export interface AvroFieldMetadata {
 dependencyId?:string;path:string;record:string;element:Element;nativeField:NativeJson;
}
const string=(n:NativeJson|undefined)=>n?.kind==='string'?n.value:undefined;
const integer=(n:NativeJson|undefined)=>{if(n?.kind!=='number')return undefined;try{const v=readJsonValue(n.value,'json');return typeof v==='number'&&Number.isSafeInteger(v)?v:undefined;}catch{return undefined;}};
const primitives:Record<string,ScalarType>={boolean:'boolean',int:'integer',long:'integer',float:'float',double:'float',bytes:'binary',string:'string',fixed:'binary',enum:'string'};
/** Derives field metadata only; source retention and semantic validation are separate. */
export function deriveAvroFields(payload:AvroPayload):AvroFieldMetadata[]{
 const names=new Map<string,{node:NativeJson;namespace:string}|null>(),fields:{node:NativeJson;path:string;record:string;namespace:string;dependencyId?:string}[]=[];
 function visit(node:NativeJson,path:string,namespace:string,dependencyId?:string){
  if(node.kind==='array'){node.items.forEach((n,i)=>visit(n,path+'/'+i,namespace,dependencyId));return;}
  if(node.kind!=='object')return;const m=node.members,type=string(m.type);
  let full='',ns=namespace;
  if(type&&['record','error','enum','fixed'].includes(type)){
   const name=string(m.name);if(!name)return;
   const declared=string(m.namespace)??namespace;full=name.includes('.')?name:declared?declared+'.'+name:name;
   ns=full.includes('.')?full.slice(0,full.lastIndexOf('.')):'';
   names.set(full,names.has(full)?null:{node,namespace:ns});
  }
  if((type==='record'||type==='error')&&m.fields?.kind==='array')m.fields.items.forEach((field,i)=>{
   if(field.kind!=='object'||!string(field.members.name)||!field.members.type)return;
   const fp=path+'/fields/'+i;fields.push({node:field,path:fp,record:full,namespace:ns,...(dependencyId!==undefined?{dependencyId}:{})});
   visit(field.members.type,fp+'/type',ns,dependencyId);
  });
  if(type==='array'&&m.items)visit(m.items,path+'/items',ns,dependencyId);
  if(type==='map'&&m.values)visit(m.values,path+'/values',ns,dependencyId);
  if(m.type&&m.type.kind!=='string')visit(m.type,path+'/type',ns,dependencyId);
 }
 for(const d of payload.dependencies??[])visit(d.root,'','',d.id);visit(payload.root,'','');
 function family(node:NativeJson,namespace:string,seen=new Set<string>()):ScalarType|undefined{
  if(node.kind==='array'){
   const branches=node.items.filter(n=>!(n.kind==='string'&&n.value==='null')&&!(n.kind==='object'&&string(n.members.type)==='null'));
   const values=branches.map(n=>family(n,namespace,new Set(seen)));
   return values.length&&values[0]&&values.every(v=>v===values[0])?values[0]:undefined;
  }
  const type=node.kind==='string'?node.value:node.kind==='object'?string(node.members.type):undefined;
  if(!type)return undefined;
  if(node.kind==='object'&&Object.hasOwn(node.members,'logicalType')){
   const m=node.members,logical=string(m.logicalType);
   if(logical==='date'&&type==='int')return 'date';
   if((logical==='time-millis'&&type==='int')||(logical==='time-micros'&&type==='long'))return 'time';
   if(logical&&/^(local-)?timestamp-(millis|micros|nanos)(?![\s\S])/.test(logical)&&type==='long')return 'timestamp';
   if(logical==='big-decimal'&&type==='bytes')return 'decimal';
   if(logical==='decimal'&&(type==='bytes'||type==='fixed')){
    const precision=integer(m.precision),scale=m.scale===undefined?0:integer(m.scale);
    if(precision===undefined||precision<=0||scale===undefined||scale<0||scale>precision)return undefined;
    if(type==='fixed'){
     const size=integer(m.size);if(size===undefined||size<1||size>4096)return undefined;
     const capacity=((1n<<BigInt(8*size-1))-1n).toString().length-1;
     if(precision>capacity)return undefined;
    }
    return 'decimal';
   }
   return undefined; // Unknown/invalid logical meanings are never guessed from carriers.
  }
  if(Object.hasOwn(primitives,type))return primitives[type];
  const full=type.includes('.')?type:namespace?namespace+'.'+type:type;
  if(seen.has(full))return undefined;seen.add(full);const named=names.get(full);
  return named?family(named.node,named.namespace,seen):undefined;
 }
 return fields.map(f=>{
  const nativeField=copyJson(f.node) as NativeJson,m=(f.node as Extract<NativeJson,{kind:'object'}>).members;
  const scalarType=family(m.type!,f.namespace),description=string(m.doc);
  return {path:f.path,record:f.record,...(f.dependencyId!==undefined?{dependencyId:f.dependencyId}:{}),nativeField,element:{id:JSON.stringify([f.dependencyId??null,f.path]),name:string(m.name)!,...(description!==undefined?{description}:{}),...(scalarType?{scalarType}:{}),extensions:{}}};
 });
}
