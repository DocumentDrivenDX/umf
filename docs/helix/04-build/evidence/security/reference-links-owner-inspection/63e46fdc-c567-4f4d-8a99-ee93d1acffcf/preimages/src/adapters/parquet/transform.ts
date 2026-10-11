import {inspectParquetMetadata} from './metadata';
import {decodeParquetFooter,type ParquetWireValue} from './footer';
import {rewriteParquetFooter,unsafeParquetMetadata} from './rewrite';
import {PARQUET_MAX_BYTES} from './index';
import {copyJson} from '../../model/json';
import type {Document,Diagnostic} from '../../model/types';
export interface ParquetKeyValue {key:string;value?:string}
export interface ParquetMetadataTransform {source:Document;status:'transformed'|'blocked';complete:false;diagnostics:Diagnostic[];output?:Document;added?:ParquetKeyValue[];unchangedPrefixBytes?:number}
/** Append new file-level keys. Refuse replacement, unknown metadata, encryption and footer trailers. */
export function appendParquetKeyValueMetadata(source:Document,entries:ParquetKeyValue[]):ParquetMetadataTransform {
 const inspected=inspectParquetMetadata(source),r:ParquetMetadataTransform={source:inspected.source,status:'blocked',complete:false,diagnostics:[...inspected.diagnostics]};
 const fail=(message:string)=>{r.diagnostics.push({code:'PARQUET_METADATA_EDIT_BLOCKED',path:'',severity:'error',message});return r;};
 if(inspected.status!=='mapped')return r;
 try{entries=copyJson(entries) as unknown as ParquetKeyValue[];}catch(e){return fail((e as Error).message);}
 if(!Array.isArray(entries)||entries.length===0||entries.length>1000)return fail('Expected 1..1000 new metadata entries');
 const metadata=inspected.metadata as any,decoded=decodeParquetFooter(source);
 if(decoded.trailingBytes!==0)return fail('Trailing footer bytes may contain signatures and cannot be rewritten');
 if(unsafeParquetMetadata(metadata)||inspected.diagnostics.some(d=>d.code==='PARQUET_ENUM_UNKNOWN'))return fail('Unknown or encryption metadata prevents a safe rewrite');
 const used=new Set<string>((metadata.key_value_metadata??[]).map((v:any)=>v.key)),encoder=new TextEncoder();let total=0;
 for(const e of entries){
  if(!e||typeof e!=='object'||Object.keys(e).some(k=>k!=='key'&&k!=='value')||typeof e.key!=='string'||e.value!==undefined&&typeof e.value!=='string')return fail('Entries require string keys and optional string values with no unknown fields');
  for(const s of [e.key,...(e.value===undefined?[]:[e.value])]){if(s.length>PARQUET_MAX_BYTES)return fail('Metadata strings exceed the file size bound');const b=encoder.encode(s);if(new TextDecoder('utf-8',{ignoreBOM:true}).decode(b)!==s)return fail('Metadata strings must round trip UTF-8 without replacement');total+=b.length;if(total>PARQUET_MAX_BYTES)return fail('Metadata additions exceed the file size bound');}
  if(used.has(e.key))return fail('Existing or duplicate keys cannot be replaced by an append operation');used.add(e.key);
 }
 let tree:ParquetWireValue;try{tree=copyJson(inspected.wire!) as ParquetWireValue;}catch(e){return fail((e as Error).message);}if(tree.kind!=='struct')return fail('Expected FileMetaData struct');
 const binary=(s:string):ParquetWireValue=>({kind:'binary',hex:Array.from(encoder.encode(s),b=>b.toString(16).padStart(2,'0')).join('')});
 const additions:ParquetWireValue[]=entries.map(e=>({kind:'struct',fields:[{id:1,value:binary(e.key)},...(e.value===undefined?[]:[{id:2,value:binary(e.value)}])]}));
 const field=tree.fields.find(f=>f.id===5);if(field){if(field.value.kind!=='list')return fail('Invalid key-value metadata list');field.value.items.push(...additions);}else tree.fields.push({id:5,value:{kind:'list',elementType:'struct',items:additions}});
 try{
  const {output,unchangedPrefixBytes:offset}=rewriteParquetFooter(source,tree);
  if(inspectParquetMetadata(output).status!=='mapped')return fail('Edited footer failed metadata validation');
  r.output=output;r.added=entries;r.unchangedPrefixBytes=offset;r.status='transformed';
  r.diagnostics.push({code:'PARQUET_METADATA_EDIT_SCOPE',path:'',severity:'warning',message:'File metadata appended; footer encoding may normalize, all preceding bytes are unchanged. Metadata consumers may change behavior; data validity and cross-system semantics are not established'});return r;
 }catch(e){return fail((e as Error).message);}
}
