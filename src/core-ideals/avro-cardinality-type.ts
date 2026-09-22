import {Type} from 'avsc/etc/browser/avsc-types';
import {copyJson} from '../model/json';
import {type NativeJson} from '../model/native-json';
import {readJsonValue} from '../model/serialization';

export interface AvroTypeLocation {path:string;dependencyId?:string;}
export interface AvroShapeBranch {
 location:AvroTypeLocation;native:NativeJson;type:string;shape:'one'|'array'|'map'|'null';
 definition?:AvroTypeLocation;item?:{location:AvroTypeLocation;native:NativeJson};
}
interface AvroShape {
 branches:AvroShapeBranch[];
 /** Shape of a present, non-null value only; never member omission or reader defaults. */
 shape:'one'|'array'|'map'|'unspecified';allowsNull:boolean;
}
export interface AvroFieldShape extends AvroShape {field:AvroTypeLocation;}
export interface AvroTypeShape extends AvroShape {location:AvroTypeLocation;}
type Roots={root:NativeJson;dependencyId?:string}[];
interface Entry {node:NativeJson;location:AvroTypeLocation;namespace:string;}
const primitives=new Set(['null','boolean','int','long','float','double','bytes','string']);
const namedKinds=new Set(['record','error','enum','fixed']);
const string=(node:NativeJson|undefined):string=>{if(node?.kind!=='string')throw Error('Expected native string');return node.value;};
const child=(location:AvroTypeLocation,suffix:string):AvroTypeLocation=>({...location,path:location.path+suffix});

/** Structural carrier analysis. Defaults, logical types and unknown metadata stay in native nodes.
 * avsc validates declaration order, names, duplicate union branches and structural references.
 * It never receives numeric metadata or logical annotations that it could normalize.
 */
export function inspectAvroFieldShape(input:Roots,recordName:string,fieldName:string):AvroFieldShape {
 const {location,field,...shape}=resolve(input,{recordName,fieldName});
 return {...shape,field:field!};
}
/** Resolve only paths registered as type syntax, never paths into defaults or opaque metadata. */
export function inspectAvroTypeShape(input:Roots,location:AvroTypeLocation):AvroTypeShape {
 const {field,...shape}=resolve(input,{location});return shape;
}
function resolve(input:Roots,selector:{recordName:string;fieldName:string}|{location:AvroTypeLocation}):AvroTypeShape&{field?:AvroTypeLocation} {
 const roots=copyJson(input) as unknown as typeof input;
 const names=new Map<string,Entry>(),fields=new Map<string,Map<string,Entry>>(),types=new Map<string,Entry>();
 const key=(location:AvroTypeLocation)=>JSON.stringify([location.dependencyId??null,location.path]);
 const dependencyIds=new Set<string>();
 const registry:Record<string,Type>=Object.create(null);
 function structural(node:NativeJson,location:AvroTypeLocation,namespace:string):unknown {
  types.set(key(location),{node,location,namespace});
  if(node.kind==='string')return node.value;
  if(node.kind==='array')return node.items.map((n,i)=>structural(n,child(location,'/'+i),namespace));
  if(node.kind!=='object')throw Error('Expected type syntax');
  const m=node.members,type=string(m.type),out:Record<string,unknown>={type};let ns=namespace,full='';
  if(namedKinds.has(type)){
   const name=string(m.name),declared=m.namespace===undefined?namespace:string(m.namespace);
   full=name.includes('.')?name:declared?declared+'.'+name:name;
   ns=full.includes('.')?full.slice(0,full.lastIndexOf('.')):'';
   if(names.has(full))throw Error('Duplicate native name: '+full);
   names.set(full,{node,location,namespace:ns});out.name=name;
   if(m.namespace!==undefined)out.namespace=string(m.namespace);
  }
  if(type==='record'||type==='error'){
   if(m.fields?.kind!=='array')throw Error('Expected record fields');
   const members=new Map<string,Entry>();fields.set(full,members);
   out.fields=m.fields.items.map((field,i)=>{
    if(field.kind!=='object'||field.members.type===undefined)throw Error('Malformed record field');
    const name=string(field.members.name),fieldLocation=child(location,'/fields/'+i);
    if(members.has(name))throw Error('Duplicate native field: '+name);
    members.set(name,{node:field,location:fieldLocation,namespace:ns});
    return {name,type:structural(field.members.type,child(fieldLocation,'/type'),ns)};
   });
  }else if(type==='array'||type==='map'){
   const member=type==='array'?'items':'values';if(m[member]===undefined)throw Error('Missing '+member);
   out[member]=structural(m[member],child(location,'/'+member),ns);
  }else if(type==='enum'){
   if(m.symbols?.kind!=='array')throw Error('Expected enum symbols');out.symbols=m.symbols.items.map(string);
  }else if(type==='fixed'){
   if(m.size?.kind!=='number')throw Error('Expected fixed size');const size=readJsonValue(m.size.value,'json');
   if(typeof size!=='number'||!Number.isSafeInteger(size)||size<1)throw Error('Unresolved fixed size');out.size=size;
  }
  return out;
 }
 if(!roots.length||roots.at(-1)!.dependencyId!==undefined||roots.slice(0,-1).some(r=>typeof r.dependencyId!=='string'))throw Error('Ordered dependencies followed by one main root required');
 for(const root of roots){
  if(root.dependencyId!==undefined){if(!root.dependencyId||dependencyIds.has(root.dependencyId))throw Error('Duplicate or empty dependency identity');dependencyIds.add(root.dependencyId);}
  const location:AvroTypeLocation={path:'',...(root.dependencyId!==undefined?{dependencyId:root.dependencyId}:{})};
  Type.forSchema(structural(root.root,location,'') as never,{registry,wrapUnions:true});
 }
 const field='recordName'in selector?fields.get(selector.recordName)?.get(selector.fieldName):undefined;
 if('recordName'in selector&&(!field||field.node.kind!=='object'))throw Error('Native field is unresolved');
 const selected=types.get(key('location'in selector?selector.location:child(field!.location,'/type')));
 if(!selected)throw Error('Native type location is unresolved');
 function branch(node:NativeJson,location:AvroTypeLocation,namespace:string):AvroShapeBranch {
  const type=node.kind==='string'?node.value:node.kind==='object'?string(node.members.type):undefined;
  if(type===undefined)throw Error('Unresolved union branch');
  const result:AvroShapeBranch={location,native:node,type,shape:'one'};
  if(type==='null')result.shape='null';
  else if(type==='array'||type==='map'){
   if(node.kind!=='object')throw Error('Missing container definition');
   const key=type==='array'?'items':'values';result.shape=type;
   result.item={location:child(location,'/'+key),native:node.members[key]!};
  }else if(!primitives.has(type)&&!namedKinds.has(type)){
   const full=type.includes('.')?type:namespace?namespace+'.'+type:type;
   const definition=names.get(full);if(!definition)throw Error('Unresolved named type: '+full);
   result.definition=definition.location;
  }else if(namedKinds.has(type))result.definition=location;
  return result;
 }
 const type=selected.node,location=selected.location;
 const branches=type.kind==='array'?type.items.map((n,i)=>branch(n,child(location,'/'+i),selected.namespace)):[branch(type,location,selected.namespace)];
 const nonNull=branches.filter(b=>b.shape!=='null'),shapes=new Set(nonNull.map(b=>b.shape));
 const shape=shapes.size===1?nonNull[0]!.shape:'unspecified';
 return copyJson({location,...(field?{field:field.location}:{}),branches,shape,allowsNull:branches.some(b=>b.shape==='null')}) as unknown as AvroTypeShape&{field?:AvroTypeLocation};
}
