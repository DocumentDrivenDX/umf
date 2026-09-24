import {decodeCompactStruct} from './compact';
import {exportParquetCapture,inspectParquetFraming} from './index';
import type {Document,Diagnostic} from '../../model/types';
export type ParquetWireKind='bool'|'i8'|'i16'|'i32'|'i64'|'double'|'binary'|'list'|'set'|'map'|'struct'|'uuid';
export type ParquetWireValue=
 | {kind:'bool';value:boolean}
 | {kind:'i8'|'i16'|'i32'|'i64';value:string}
 | {kind:'double';bits:string}
 | {kind:'binary'|'uuid';hex:string}
 | {kind:'list'|'set';elementType:ParquetWireKind;items:ParquetWireValue[]}
 | {kind:'map';keyType?:ParquetWireKind;valueType?:ParquetWireKind;entries:{key:ParquetWireValue;value:ParquetWireValue}[]}
 | {kind:'struct';fields:{id:number;value:ParquetWireValue}[]};
export interface ParquetFooterDecode {source:Document;status:'decoded'|'blocked';complete:false;diagnostics:Diagnostic[];value?:ParquetWireValue;consumedBytes?:number;trailingBytes?:number}
/** Bounded Compact Protocol tree. Field semantics and native Parquet validity remain unverified. */
export function decodeParquetFooter(document:Document):ParquetFooterDecode{
 const framing=inspectParquetFraming(document),result:ParquetFooterDecode={source:framing.source,status:'blocked',complete:false,diagnostics:[...framing.diagnostics]};
 const error=(code:string,message:string)=>result.diagnostics.push({code,path:'',severity:'error',message});
 if(!framing.footerRegion)return result;if(framing.footerRegion.mode==='encrypted'){error('PARQUET_FOOTER_ENCRYPTED','Encrypted footer requires a separate decryption implementation');return result;}
 const region=framing.footerRegion,bytes=exportParquetCapture(document).subarray(region.offset,region.offset+region.length);
 try{const {value:tree,consumedBytes:at}=decodeCompactStruct(bytes);result.status='decoded';result.value=tree;result.consumedBytes=at;result.trailingBytes=bytes.length-at;if(at!==bytes.length)result.diagnostics.push({code:'PARQUET_FOOTER_TRAILING',path:'',severity:'warning',message:'Bytes remain after the first struct; source retains them without interpreting signatures or other content'});result.diagnostics.push({code:'PARQUET_FOOTER_SEMANTICS_UNVERIFIED',path:'',severity:'warning',message:'Unknown IDs, duplicates, ordering and exact values are retained; the Parquet IDL and logical schema are not validated'});}
 catch(e){error('PARQUET_FOOTER_DECODE',(e as Error).message);}return result;
}
