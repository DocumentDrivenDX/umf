import manifest from '../../../spec/extensions/parquet/package.json';
import {checkParquetFieldMetadata} from './field-metadata';
import {Registry} from '../../registry/registry';
import {validateDocument} from '../../validation/document';
import {copyJson} from '../../model/json';
import {UmfError,type Document,type ExtensionPackage,type Diagnostic} from '../../model/types';
export const PARQUET_EXTENSION='umf.parquet';
export const PARQUET_MAX_BYTES=1_000_000;
export const parquetPackage=manifest as unknown as ExtensionPackage;
export function parquetRegistry(){return new Registry().register(parquetPackage);}
/** Captures even malformed source, without interpreting or normalizing any bytes. */
export function captureParquet(bytes:Uint8Array,options:{id:string}):Document{
 if(!(bytes instanceof Uint8Array)||bytes.byteLength>PARQUET_MAX_BYTES)throw new UmfError('PARQUET_LIMIT','Expected at most 1000000 source bytes');
 const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join(''),doc:Document={umf:'0.1.0',id:options.id,vocabularies:{[PARQUET_EXTENSION]:{version:'0.1.0'}},modules:[{id:'parquet',namespace:'',elements:[{id:'source',extensions:{[PARQUET_EXTENSION]:{profile:'parquet-file-source',encoding:'hex',bytes:hex}}}]}]};exportParquetCapture(doc);return doc;
}
export function exportParquetCapture(doc:Document):Uint8Array{
 if(!validateDocument(doc,parquetRegistry()).valid)throw new UmfError('PARQUET_CAPTURE','Invalid Parquet capture envelope');
 if(doc.modules.some(m=>m.id==='parquet.fields'))checkParquetFieldMetadata(doc);
 const p=doc.modules.find(m=>m.id==='parquet')?.elements.find(e=>e.id==='source')?.extensions[PARQUET_EXTENSION];
 if(doc.vocabularies[PARQUET_EXTENSION]?.version!=='0.1.0'||!p||typeof p!=='object'||Array.isArray(p))throw new UmfError('PARQUET_CAPTURE','Expected pinned Parquet source');
 if(Object.keys(p).some(k=>!['profile','encoding','bytes'].includes(k)))throw new UmfError('PARQUET_REPRESENTATION','Unknown capture fields cannot be discarded by native export');
 const hex=p.bytes as string,result=new Uint8Array(hex.length/2);for(let i=0;i<result.length;i++)result[i]=Number.parseInt(hex.slice(i*2,i*2+2),16);return result;
}
export interface ParquetFraming {source:Document;status:'located'|'invalid';complete:false;byteLength:number;footerRegion?:{offset:number;length:number;mode:'plaintext-or-signed'|'encrypted'};diagnostics:Diagnostic[]}
/** Only locates the footer region. PAR1 can contain encrypted columns or a signed footer. */
export function inspectParquetFraming(doc:Document):ParquetFraming{
 const bytes=exportParquetCapture(doc),r:ParquetFraming={source:copyJson(doc) as unknown as Document,status:'invalid',complete:false,byteLength:bytes.length,diagnostics:[]};
 const fail=(code:string,message:string)=>{r.diagnostics.push({code,path:'',severity:'error',message});return r;};
 if(bytes.length<12)return fail('PARQUET_TRUNCATED','File is shorter than the framing minimum');
 const magic=(at:number)=>String.fromCharCode(...bytes.subarray(at,at+4)),start=magic(0),end=magic(bytes.length-4);
 if(!['PAR1','PARE'].includes(start)||end!==start)return fail('PARQUET_MAGIC','Expected matching PAR1 or PARE header and trailer');
 const length=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(bytes.length-8,true),offset=bytes.length-8-length;
 if(length===0||offset<4)return fail('PARQUET_FOOTER_BOUNDS','Footer region is empty or overlaps the file header');
 r.status='located';r.footerRegion={offset,length,mode:start==='PARE'?'encrypted':'plaintext-or-signed'};r.diagnostics.push({code:'PARQUET_UNINTERPRETED',path:'',severity:'warning',message:'Footer location alone does not validate Thrift metadata, schemas, pages, encryption, signatures or native values'});return r;
}
