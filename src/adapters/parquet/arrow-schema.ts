import {inspectParquetMetadata} from './metadata';
import {decodeArrowFlatbuffer} from '../arrow/flatbuffer-decode';
import {exportArrowFlatbufferModel,importArrowFlatbufferModel} from '../arrow/flatbuffer-model';
import {copyJson} from '../../model/json';
import type {Document,Diagnostic} from '../../model/types';

export interface ParquetArrowSchema {
 source:Document;status:'absent'|'decoded'|'blocked';complete:false;diagnostics:Diagnostic[];
 metadataIndex?:number;ipcHex?:string;message?:Document;schema?:Document;
}
/** Decode the optional ARROW:schema declaration; never infer correspondence to physical data. */
export function getParquetArrowSchema(source:Document):ParquetArrowSchema{
 const inspected=inspectParquetMetadata(source),result:ParquetArrowSchema={source:inspected.source,status:'blocked',complete:false,diagnostics:[...inspected.diagnostics]};
 const fail=(message:string)=>{result.status='blocked';delete result.message;delete result.schema;result.diagnostics.push({code:'PARQUET_ARROW_SCHEMA_BLOCKED',path:'/key_value_metadata',severity:'error',message});return result;};
 if(inspected.status!=='mapped')return result;
 const entries=(inspected.metadata as any).key_value_metadata??[],matches=entries.map((entry:any,index:number)=>({entry,index})).filter(({entry}:any)=>entry.key==='ARROW:schema');
 if(!matches.length){result.status='absent';return result;}
 if(matches.length!==1)return fail('Duplicate ARROW:schema entries are ambiguous');
 const {entry,index}=matches[0];result.metadataIndex=index;
 if(typeof entry.value!=='string'||!entry.value.length)return fail('ARROW:schema requires a nonempty base64 value');
 if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?(?![\s\S])/.test(entry.value))return fail('ARROW:schema must use canonical padded base64');
 try{
  // atob alone accepts whitespace and missing padding; require canonical byte encoding.
  const binary=atob(entry.value);if(btoa(binary)!==entry.value)return fail('ARROW:schema must use canonical padded base64');
  const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));result.ipcHex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  if(bytes.length<4)return fail('Truncated IPC message prefix');
  const view=new DataView(bytes.buffer),continuation=view.getInt32(0,true)===-1,prefix=continuation?8:4;
  if(bytes.length<prefix)return fail('Truncated IPC continuation prefix');
  const length=view.getInt32(prefix-4,true);
  if(length<=0||length!==bytes.length-prefix)return fail('Expected exactly one encapsulated IPC schema message');
  const decoded=decodeArrowFlatbuffer(bytes.subarray(prefix),{id:source.id+'/parquet-arrow-message',rootType:'Message'});
  result.diagnostics.push(...decoded.diagnostics);
  if(!decoded.model||decoded.diagnostics.some(d=>d.code!=='ARROW_FLATBUFFER_INCOMPLETE'))return fail('Embedded Arrow metadata contains unsupported or invalid wire content');
  const model=JSON.parse(exportArrowFlatbufferModel(decoded.model));
  if(model.value.header?.type!=='Schema'||BigInt(model.value.bodyLength??'0')!==0n)return fail('Embedded message must be a body-free Arrow Schema');
  result.message=decoded.model;result.schema=importArrowFlatbufferModel(JSON.stringify({rootType:'Schema',value:model.value.header.value}),{id:source.id+'/parquet-arrow-schema'});
  result.status='decoded';result.diagnostics.push({code:'PARQUET_ARROW_CORRESPONDENCE_UNVERIFIED',path:'/key_value_metadata/'+index,severity:'warning',message:'Embedded Arrow schema decoded independently; agreement with Parquet fields, rows and external metadata is not established. Both declarations remain authoritative source observations.'});
  return copyJson(result) as unknown as ParquetArrowSchema;
 }catch(error){return fail(error instanceof Error?error.message:String(error));}
}
