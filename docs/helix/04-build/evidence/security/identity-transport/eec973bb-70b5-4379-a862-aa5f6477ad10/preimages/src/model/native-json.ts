import { parseDocument, isMap, isSeq, isScalar } from 'yaml';
import { LIMITS, copyJson } from './json';
import { UmfError } from './types';
export type NativeJson = {kind:'null'} | {kind:'boolean';value:boolean} | {kind:'string';value:string} | {kind:'number';value:string} | {kind:'array';items:NativeJson[]} | {kind:'object';members:Record<string,NativeJson>};
export function parseNativeJson(text: string): NativeJson {
 if(text.length>LIMITS.maxTextLength) throw new UmfError('LIMIT','Native JSON exceeds text limit');
 try {JSON.parse(text);} catch {throw new UmfError('JSON_SCHEMA_SYNTAX','Invalid native JSON');}
 const source=parseDocument(text,{version:'1.2',schema:'core',intAsBigInt:true,uniqueKeys:true,strict:true});
 if(source.errors.length || source.warnings.length) throw new UmfError('JSON_SCHEMA_SYNTAX',[...source.errors,...source.warnings].map(e=>e.message).join('; '));
 let count=0;
 function encode(node:unknown,depth:number):NativeJson {
  if(depth>LIMITS.maxDepth || ++count>LIMITS.maxValues) throw new UmfError('LIMIT','Native JSON structural limit exceeded');
  if(isScalar(node)) {
   if(node.value===null) return {kind:'null'};
   if(typeof node.value==='number' || typeof node.value==='bigint') return {kind:'number',value:node.source!};
   if(typeof node.value==='string') return {kind:'string',value:node.value};
   if(typeof node.value==='boolean') return {kind:'boolean',value:node.value};
  }
  if(isSeq(node)) return {kind:'array',items:node.items.map(n=>encode(n,depth+1))};
  if(isMap(node)) {
   const members:Record<string,NativeJson>=Object.create(null);
   for(const pair of node.items) {
    if(!isScalar(pair.key) || typeof pair.key.value!=='string') throw new UmfError('JSON_SCHEMA_SYNTAX','Non-string JSON key');
    members[pair.key.value]=encode(pair.value,depth+1);
   }
   return {kind:'object',members};
  }
  throw new UmfError('JSON_SCHEMA_SYNTAX','Unexpected native JSON node');
 }
 return encode(source.contents,0);
}
/** Internal renderer: callers must check tree structure first. Never parses numbers. */
export function renderTree(node: NativeJson):string {
 switch(node.kind) {
  case 'null':return 'null';
  case 'number':return node.value;
  case 'boolean':case 'string':return JSON.stringify(node.value);
  case 'array':return '['+node.items.map(renderTree).join(',')+']';
  case 'object':return '{'+Object.entries(node.members).map(([key,value])=>JSON.stringify(key)+':'+renderTree(value)).join(',')+'}';
 }
}
export function cloneTree(node: NativeJson):NativeJson {return copyJson(node) as unknown as NativeJson;}
export function nativePointer(pointer:string):string[] {
 if(pointer==='')return [];
 if(!pointer.startsWith('/') || /~(?![01])/u.test(pointer)) throw new UmfError('JSON_SCHEMA_POINTER','Invalid JSON Pointer');
 return pointer.slice(1).split('/').map(p=>p.replace(/~1/g,'/').replace(/~0/g,'~'));
}
export function treeChild(node:NativeJson,key:string):NativeJson {
 if(node.kind==='object' && Object.hasOwn(node.members,key)) return node.members[key]!;
 if(node.kind==='array' && /^(0|[1-9][0-9]*)$/.test(key) && Number(key)<node.items.length) return node.items[Number(key)]!;
 throw new UmfError('JSON_SCHEMA_POINTER','Native JSON Pointer target does not exist');
}
/** JSON-compatible YAML with explicit scalar profile and exact numeric tokens; aliases/tags are rejected. */
export function parseNativeYaml(text:string,options:{version?:'1.1'|'1.2';dateOnly?:'string';booleanLexicon?:'pyyaml'}={}):NativeJson {
 const version=options.version===undefined?'1.2':options.version;
 if(version!=='1.1'&&version!=='1.2')throw new UmfError('NATIVE_YAML_VERSION','Expected YAML 1.1 or 1.2 scalar profile');
 if(text.length>LIMITS.maxTextLength)throw new UmfError('LIMIT','Native YAML exceeds text limit');
 const doc=parseDocument(text,{version,schema:version==='1.1'?'yaml-1.1':'core',intAsBigInt:true,uniqueKeys:true,strict:true,...(options.booleanLexicon==='pyyaml'?{customTags:(tags:any[])=>tags.map(tag=>tag.tag==='tag:yaml.org,2002:bool'?{...tag,test:new RegExp('^(?![yYnN]$)'+tag.test.source,tag.test.flags)}:tag)}:{})});
 if(doc.errors.length||doc.warnings.length)throw new UmfError('NATIVE_YAML_SYNTAX',[...doc.errors,...doc.warnings].map(e=>e.message).join('; '));
 let count=0;
 function encode(node:any,depth:number):NativeJson {
  if(depth>LIMITS.maxDepth||++count>LIMITS.maxValues)throw new UmfError('LIMIT','Native YAML structural limit exceeded');
  if(node?.tag)throw new UmfError('NATIVE_YAML_TAG','Explicit YAML tags are outside the JSON-compatible profile');
  if(isScalar(node)){
   if(node.value===null)return {kind:'null'};
   if(typeof node.value==='string')return {kind:'string',value:node.value};
   if(typeof node.value==='boolean')return {kind:'boolean',value:node.value};
   if(node.value instanceof Date&&options.dateOnly==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(node.source??''))return {kind:'string',value:node.source!};
   if(typeof node.value==='bigint')return {kind:'number',value:node.source==='-0'?'-0':node.value.toString()};
   if(typeof node.value==='number'){
    let value=version==='1.1'?node.source!.replaceAll('_',''):node.source!;
    value=value.replace(/^\+/,'').replace(/^(-?)\./,'$10.').replace(/\.(?=e|$)/i,'.0').replace(/^(-?)0+(?=[0-9])/,'$1');
    if(!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(value))throw new UmfError('NATIVE_YAML_NUMBER','Unsupported exact numeric spelling');
    return {kind:'number',value};
   }
  }
  if(isSeq(node))return {kind:'array',items:node.items.map(n=>encode(n,depth+1))};
  if(isMap(node)){
   const members:Record<string,NativeJson>=Object.create(null);
   for(const pair of node.items){if(!isScalar(pair.key)||typeof pair.key.value!=='string'||pair.key.tag)throw new UmfError('NATIVE_YAML_KEY','JSON-compatible YAML requires untagged string keys');members[pair.key.value]=encode(pair.value,depth+1);}
   return {kind:'object',members};
  }
  // Empty YAML nodes represent null; aliases and other nodes cannot be flattened silently.
  if(node===null)return {kind:'null'};
  throw new UmfError('NATIVE_YAML_NODE','Aliases and non-JSON YAML nodes are unsupported');
 }
 return encode(doc.contents,0);
}
