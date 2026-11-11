// SPDX-License-Identifier: MIT OR Apache-2.0
import {copyJson} from './json';
import {UmfError} from './types';
export {parseNativeJson,parseNativeYaml} from '#umf-source';
export type NativeJson = {kind:'null'} | {kind:'boolean';value:boolean} | {kind:'string';value:string} | {kind:'number';value:string} | {kind:'array';items:NativeJson[]} | {kind:'object';members:Record<string,NativeJson>};
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
