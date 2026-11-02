// SPDX-License-Identifier: MIT OR Apache-2.0
// Compiler-object extraction only. Rust assigns UMF snapshot identities,
// edge roles, status, limitations and issues from this neutral DTO.
import {getDoc,getSourceLocation,getTypeName,type Program,type Type,type Value} from '@typespec/compiler';

type Ref={field:string;target:string;name?:string;index?:number;usage?:string};
type RawNode={key:string;kind:string;label:string;fields:Record<string,unknown>;references:Ref[];location?:{file:string;start:number;end:number};doc?:string};
export type RawGraph={roots:{expression:string;target?:string;diagnostics?:{code:string;severity:string;message:string}[]}[];nodes:RawNode[]};

/** Return compiler-specific objects and relations without assigning UMF graph semantics. */
export function extractTypeSpecGraph(program:Program,expressions:string[],hostWork?:(units:number)=>void):RawGraph{
 const identities=new WeakMap<object,string>();const nodes:RawNode[]=[];const visited=new Set<string>();
 let next=0;
 function key(value:object):string{let id=identities.get(value);if(!id){hostWork?.(16);id=`host-${next++}`;identities.set(value,id);}return id;}
 function addRef(node:RawNode,field:string,target:Type|undefined,meta:{name?:string;index?:number;usage?:string}={}){
  if(!target)return;hostWork?.(field.length+(meta.name?.length??0)+1);node.references.push({field,target:key(target),...meta});visit(target);
 }
 function rawValue(v:Value,depth=0):unknown{
  hostWork?.(1);
  if(depth>128)return {valueKind:v.valueKind,omitted:'depth-limit'};
  const base={valueKind:v.valueKind,type:{ref:key(v.type)}};visit(v.type);
  switch(v.valueKind){
   case 'NumericValue':if(v.scalar)visit(v.scalar);return {...base,value:v.value.toString(),...(v.scalar?{scalar:{ref:key(v.scalar)}}:{})};
   case 'StringValue':case 'BooleanValue':if(v.scalar)visit(v.scalar);return {...base,value:v.value,...(v.scalar?{scalar:{ref:key(v.scalar)}}:{})};
   case 'NullValue':return {...base,value:null};
   case 'EnumValue':visit(v.value);return {...base,value:{ref:key(v.value)}};
   case 'ArrayValue':return {...base,items:v.values.map(x=>rawValue(x,depth+1))};
   case 'ObjectValue':return {...base,properties:[...v.properties].map(([name,p])=>({name,value:rawValue(p.value,depth+1)}))};
   case 'ScalarValue':visit(v.scalar);return {...base,scalar:{ref:key(v.scalar)},constructor:v.value.name,args:v.value.args.map(x=>rawValue(x,depth+1))};
   default:return base;
  }
 }
 function visit(type:Type):string{
  const id=key(type);if(visited.has(id))return id;hostWork?.(type.kind.length+1);visited.add(id);
  const label=getTypeName(type);hostWork?.(type.kind.length+label.length+1);const node:RawNode={key:id,kind:type.kind,label,fields:Object.create(null),references:[]};nodes.push(node);
  if(type.node){const at=getSourceLocation(type.node);if(at)node.location={file:at.file.path,start:at.pos,end:at.end};}
  const doc=getDoc(program,type);if(doc!==undefined){hostWork?.(doc.length+1);node.doc=doc;}
   if('decorators'in type&&type.decorators.length){node.fields.decorators=type.decorators.map(d=>({name:d.definition?getTypeName(d.definition):d.decorator.name,args:d.args.map(a=>{if(a.value.entityKind==='Value')return {value:rawValue(a.value)};visit(a.value);return {type:{ref:key(a.value)}};})}));}
  switch(type.kind){
   case 'Model':
    for(const [name,p]of type.properties)addRef(node,'properties',p,name?{name}:{});addRef(node,'baseModel',type.baseModel);addRef(node,'sourceModel',type.sourceModel);
    type.sourceModels.forEach((source,index)=>addRef(node,'sourceModels',source.model,{index,usage:source.usage}));
    if(type.indexer){addRef(node,'indexerKey',type.indexer.key);addRef(node,'indexerValue',type.indexer.value);}break;
   case 'ModelProperty':node.fields.optional=type.optional;addRef(node,'type',type.type);addRef(node,'sourceProperty',type.sourceProperty);if(type.defaultValue)node.fields.default=rawValue(type.defaultValue);break;
   case 'Scalar':addRef(node,'baseScalar',type.baseScalar);node.fields.hasConstructors=type.constructors.size>0;break;
   case 'Interface':for(const [name,op]of type.operations)addRef(node,'operations',op,{name});type.sourceInterfaces.forEach((x,index)=>addRef(node,'sourceInterfaces',x,{index}));break;
   case 'Operation':addRef(node,'parameters',type.parameters);addRef(node,'returnType',type.returnType);addRef(node,'sourceOperation',type.sourceOperation);break;
   case 'Enum':for(const [name,member]of type.members)addRef(node,'members',member,{name});break;
   case 'EnumMember':
    if(typeof type.value==='string')node.fields.value={kind:'string',value:type.value};
    if(typeof type.value==='number'){const n=type.node?.value;if(n&&'valueAsString'in n)node.fields.value={kind:'number',value:n.valueAsString};else if(Number.isSafeInteger(type.value))node.fields.value={kind:'number',value:String(type.value)};else node.fields.value={kind:'number',unavailable:true};}
    addRef(node,'sourceMember',type.sourceMember);break;
   case 'Union':for(const [name,variant]of type.variants)addRef(node,'variants',variant,{...(typeof name==='string'?{name}:{}),index:node.references.length});addRef(node,'baseType',type.baseType);node.fields.expression=type.expression;break;
   case 'UnionVariant':addRef(node,'type',type.type);break;
   case 'Tuple':type.values.forEach((v,index)=>addRef(node,'values',v,{index}));break;
   case 'Number':node.fields.value={kind:'number',value:type.valueAsString};break;
   case 'String':case 'Boolean':node.fields.value={kind:type.kind.toLowerCase(),value:type.value};break;
   case 'Intrinsic':break;
   case 'StringTemplate':if(type.stringValue!==undefined)node.fields.stringValue=type.stringValue;type.spans.forEach((v,index)=>addRef(node,'spans',v,{index}));break;
   case 'StringTemplateSpan':node.fields.isInterpolated=type.isInterpolated;addRef(node,'type',type.type);break;
   default:node.fields.unexpandedKind=type.kind;
  }
  return id;
 }
 const roots=expressions.map(expression=>{hostWork?.(expression.length+1);const [type,diagnostics]=program.resolveTypeReference(expression);if(!type||diagnostics.some(d=>d.severity==='error'))return {expression,diagnostics:diagnostics.map(d=>({code:d.code,severity:d.severity,message:d.message}))};return {expression,target:visit(type)};});
 return {roots,nodes};
}
