// Optional pinned WASM runtime, kept outside the core browser bundle.
import {parse,deparse} from '@libpg-query/parser';
// @ts-ignore Generated native Protobuf codec does not ship declarations.
import {pg_query} from '@libpg-query/parser/proto.js';
import schema from '../../spec/extensions/postgresql/native-ast.schema.json';
export const identity='@libpg-query/parser@17.6.10' as const;
export {parse};
const definitions=schema.$defs as Record<string,any>;
/** Construct nested native messages before fromObject. The pinned Boolean converter
 * calls its own message constructor instead of the JS Boolean built-in. Creating
 * that typed message directly retains the boolean; no global codec is patched.
 * Null-prototype dictionaries also prevent inherited `constructor` properties from
 * being mistaken for the native JsonObjectAgg/JsonArrayAgg constructor field.
 * The public export guard still compares the complete input and codec output. */
function message(type:string,value:any):any{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Expected native message '+type);
 const fields=definitions[type]?.properties;if(!fields)throw Error('Unknown native message '+type);
 const input=Object.assign(Object.create(null),value);
 for(const [key,field] of Object.entries(fields) as [string,any][]){
  if(!Object.hasOwn(input,key))continue;
  const ref=field.$ref??field.items?.$ref;if(!ref)continue;
  const child=ref.slice('#/$defs/'.length);if(!definitions[child]?.properties)continue;
  input[key]=field.type==='array'?input[key].map((v:any)=>message(child,v)):message(child,input[key]);
 }
 if(type==='Boolean'){
  if(Object.hasOwn(input,'boolval')&&typeof input.boolval!=='boolean')throw Error('Expected native Boolean.boolval');
  return pg_query.Boolean.create(input);
 }
 return pg_query[type].fromObject(input);
}
export async function deparseTree(tree:unknown){return deparse(message('ParseResult',tree));}
export function codecRoundTrip(tree:unknown){return pg_query.ParseResult.toObject(message('ParseResult',tree),{enums:String,longs:Number});}
export const backend={identity,parse,deparse:deparseTree,codecRoundTrip};
