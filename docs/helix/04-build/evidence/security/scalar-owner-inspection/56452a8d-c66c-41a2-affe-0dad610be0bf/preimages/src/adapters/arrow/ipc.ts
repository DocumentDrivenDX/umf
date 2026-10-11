import {copyJson,LIMITS} from '../../model/json';
import {UmfError,type Document} from '../../model/types';
import {exportArrowSchema,inspectArrow} from './index';
export interface ArrowSchemaIpcBackend {
 identity:'apache-arrow@21.2.0';
 encode(schema:unknown):{before:unknown;after:unknown;bytes:Uint8Array};
}
function canonical(value:any):string{
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);
}
/** Normalize only documented native defaults/aliases, never metadata entries or IDs. */
function normalized(schema:any){
 const result=copyJson(schema) as any;result.metadata??=[];
 function field(f:any){
  f.metadata??=[];f.children??=[];
  if(f.type.name==='struct')f.type.name='struct_';if(f.type.name==='NONE')f.type.name='null';
  if(f.type.name==='decimal')f.type.bitWidth??=128;
  if(f.type.name==='timestamp')f.type.timezone??='';
  if(f.type.name==='map')f.type.keysSorted??=false;
  if(f.dictionary){f.dictionary.indexType??={name:'int',bitWidth:32,isSigned:true};f.dictionary.isOrdered??=false;}
  f.children.forEach(field);
 }
 result.fields.forEach(field);return result;
}
/** Schema-only IPC stream. Does not export arrays, dictionary values or arbitrary IPC. */
export function exportArrowSchemaIpc(document:Document,backend:ArrowSchemaIpcBackend):Uint8Array{
 if(backend?.identity!=='apache-arrow@21.2.0'||typeof backend.encode!=='function')throw new UmfError('ARROW_BACKEND','Expected explicit pinned Arrow schema backend');
 const checked=inspectArrow(document);
 if(!checked.valid)throw new UmfError('ARROW_DOCUMENT','Invalid Arrow schema');
 if(checked.diagnostics.some(d=>['ARROW_UNKNOWN','ARROW_UNKNOWN_TYPE','ARROW_DUPLICATE_METADATA','ARROW_REPRESENTATION'].includes(d.code)))throw new UmfError('ARROW_IPC_LOSS','Unknown content or duplicate metadata cannot be silently discarded by native IPC conversion');
 // Known integer tokens have already been checked exactly. copyJson rejects unsafe
 // host integers, so signed-64-bit IDs outside the JS subset remain JSON-only.
 const input=copyJson(JSON.parse(exportArrowSchema(document)));
 const result=backend.encode(copyJson(input));
 const expected=canonical(normalized(input));
 if(canonical(normalized(result.before))!==expected)throw new UmfError('ARROW_IPC_DECODE_LOSS','Native schema decoding changed captured semantics');
 if(canonical(normalized(result.after))!==expected)throw new UmfError('ARROW_IPC_ROUND_TRIP','Native IPC re-read changed captured semantics');
 if(!(result.bytes instanceof Uint8Array)||!result.bytes.length||result.bytes.length>LIMITS.maxTextLength)throw new UmfError('ARROW_IPC_BYTES','Expected bounded native schema IPC bytes');
 return new Uint8Array(result.bytes);
}
