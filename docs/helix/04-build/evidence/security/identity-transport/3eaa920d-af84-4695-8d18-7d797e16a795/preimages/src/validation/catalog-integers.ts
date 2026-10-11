import type {NativeJson} from '../model/native-json';
import {readJsonValue} from '../model/serialization';
/** Exact integer preflight for the owned catalog schemas. Not a JSON Schema validator.
 * Traverses declared properties/items, local $defs references and nullable anyOf.
 * Unknown native properties remain uninterpreted.
 */
export function catalogIntegerErrors(root:NativeJson,schema:any):string[]{
 const errors=new Set<string>();
 function walk(node:NativeJson,rule:any,path:string):void{
  if(rule.$ref){const prefix='#/$defs/';if(!rule.$ref.startsWith(prefix))throw Error('Unsupported catalog schema reference');walk(node,schema.$defs[rule.$ref.slice(prefix.length)],path);return;}
  if(rule.anyOf){for(const branch of rule.anyOf)walk(node,branch,path);return;}
  if(node.kind==='number'&&(rule.type==='integer'||Array.isArray(rule.type)&&rule.type.includes('integer'))){
   try{const value=readJsonValue(node.value,'json');if(typeof value!=='number'||!Number.isSafeInteger(value))throw Error('Not an exact integer');}catch{errors.add(path);}
  }
  if(node.kind==='object')for(const [key,value] of Object.entries(node.members))if(rule.properties&&Object.hasOwn(rule.properties,key))walk(value,rule.properties[key],path+'/'+key.replace(/~/g,'~0').replace(/\//g,'~1'));
  if(node.kind==='array'&&rule.items)node.items.forEach((value,index)=>walk(value,rule.items,path+'/'+index));
 }
 walk(root,schema,'');return [...errors];
}
