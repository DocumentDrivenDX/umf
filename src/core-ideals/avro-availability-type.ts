import {Type} from 'avsc/etc/browser/avsc-types';
import {type NativeJson} from '../model/native-json';
import {readJsonValue} from '../model/serialization';
/** Project only structural type syntax for avsc name/union validation. Never coerce native metadata. */
function structural(node:NativeJson):unknown {
 if(node.kind==='string')return node.value;
 if(node.kind==='array')return node.items.map(structural);
 if(node.kind!=='object'||node.members.type?.kind!=='string')throw Error('Unresolved structural type');
 const m=node.members,type=node.members.type.value,r:Record<string,unknown>={type};
 const string=(key:string,required=false)=>{const v=m[key];if(v===undefined&&!required)return;if(v?.kind!=='string')throw Error('Expected '+key);r[key]=v.value;};
 if(['record','error','enum','fixed'].includes(type)){string('name',true);string('namespace');}
 if(type==='record'||type==='error'){
  if(m.fields?.kind!=='array')throw Error('Expected fields');
  r.fields=m.fields.items.map(f=>{if(f.kind!=='object'||f.members.name?.kind!=='string'||!f.members.type)throw Error('Malformed field');return {name:f.members.name.value,type:structural(f.members.type)};});
 }else if(type==='enum'){
  if(m.symbols?.kind!=='array'||!m.symbols.items.length||m.symbols.items.some(s=>s.kind!=='string'))throw Error('Expected enum symbols');
  r.symbols=m.symbols.items.map(s=>(s as Extract<NativeJson,{kind:'string'}>).value);
 }else if(type==='fixed'){
  if(m.size?.kind!=='number')throw Error('Expected fixed size');
  const size=readJsonValue(m.size.value,'json');if(typeof size!=='number'||!Number.isSafeInteger(size)||size<=0)throw Error('Unresolved fixed size');r.size=size;
 }else if(type==='array'||type==='map'){
  const key=type==='array'?'items':'values';if(!m[key])throw Error('Missing '+key);r[key]=structural(m[key]!);
 }
 return r;
}
/** Underlying carrier only; full native semantics/default/logical validation is deliberately separate. */
export function avroFieldAllowsNull(roots:NativeJson[],recordName:string,fieldName:string):boolean {
 const registry:Record<string,Type>=Object.create(null);
 for(const root of roots)Type.forSchema(structural(root) as never,{registry,wrapUnions:true});
 const record=registry[recordName];if(!record||!Type.isType(record,'record','error'))throw Error('Record is unresolved');
 const field=(record as unknown as {getFields():{name:string;type:Type}[]}).getFields().find(f=>f.name===fieldName);
 if(!field)throw Error('Field is unresolved');
 if(Type.isType(field.type,'null'))return true;
 if(Type.isType(field.type,'union:wrapped','union:unwrapped'))return (field.type as unknown as {getTypes():Type[]}).getTypes().some(t=>Type.isType(t,'null'));
 return false;
}
