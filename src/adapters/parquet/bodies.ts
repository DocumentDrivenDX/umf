import {inspectParquetPages,type ParquetPage} from './pages';
import {inspectParquetMetadata} from './metadata';
import {exportParquetCapture} from './index';
import {decodeSnappyBounded} from './snappy';
import type {Document,Diagnostic} from '../../model/types';
export interface ParquetDecodedPage extends ParquetPage {bodyHex:string;checksum:'verified'|'absent'}
export interface ParquetPageBodies {source:Document;status:'decoded'|'blocked';complete:false;diagnostics:Diagnostic[];pages?:ParquetDecodedPage[];decodedBytes?:number}
const crcTable=Uint32Array.from({length:256},(_,i)=>{let n=i;for(let k=0;k<8;k++)n=n&1?(n>>>1)^0xedb88320:n>>>1;return n>>>0;});
const hexPairs=Array.from({length:256},(_,b)=>b.toString(16).padStart(2,'0'));
function hex(bytes:Uint8Array){const chunks:string[]=[];for(let start=0;start<bytes.length;start+=4096)chunks.push(Array.from(bytes.subarray(start,start+4096),b=>hexPairs[b]!).join(''));return chunks.join('');}
function crc32(bytes:Uint8Array){let n=0xffffffff;for(const b of bytes)n=(n>>>8)^crcTable[(n^b)&255]!;return (n^0xffffffff)>>>0;}
/** Bounded physical page-body decoding only; encodings, levels and scalar values are separate. */
export function decodeParquetPageBodies(source:Document):ParquetPageBodies {
 const inspected=inspectParquetPages(source),r:ParquetPageBodies={source:inspected.source,status:'blocked',complete:false,diagnostics:[...inspected.diagnostics]};if(inspected.status!=='checked')return r;
 const metadata=inspectParquetMetadata(source).metadata as any,bytes=exportParquetCapture(source),pages:ParquetDecodedPage[]=[];let decodedBytes=0;
 try{
  for(const p of inspected.pages!){const codec=metadata.row_groups[p.rowGroup].columns[p.column].meta_data.codec;if(!['0','1'].includes(codec))throw Error('Page codec '+codec+' is not implemented by the bounded decoder');}
  for(const p of inspected.pages!){const h=p.header as any,codec=metadata.row_groups[p.rowGroup].columns[p.column].meta_data.codec,body=bytes.subarray(p.bodyOffset,p.bodyOffset+p.bodyBytes),expected=Number(h.uncompressed_page_size);let checksum:'verified'|'absent'='absent';
   if(h.crc!==undefined){if(crc32(body)!==Number(BigInt(h.crc)&0xffffffffn))throw Error('Page CRC32 mismatch at offset '+p.offset);checksum='verified';}
   const v2=h.data_page_header_v2,levels=v2?Number(v2.definition_levels_byte_length)+Number(v2.repetition_levels_byte_length):0,isCompressed=codec!=='0'&&(!v2||v2.is_compressed!==false);let output:Uint8Array;
   if(!isCompressed){if(body.length!==expected)throw Error('Uncompressed body size mismatch');output=body;}
   else{const decoded=decodeSnappyBounded(body.subarray(levels),expected-levels);output=new Uint8Array(expected);output.set(body.subarray(0,levels));output.set(decoded,levels);}
   decodedBytes+=output.length;pages.push({...p,bodyHex:hex(output),checksum});
  }
  r.status='decoded';r.pages=pages;r.decodedBytes=decodedBytes;r.diagnostics.push({code:'PARQUET_VALUES_UNVERIFIED',path:'',severity:'warning',message:'Physical bodies decoded within page budgets; present CRC32 checks passed. Value encodings, levels, dictionaries and scalar semantics remain unverified'});
 }catch(e){r.diagnostics.push({code:'PARQUET_PAGE_BODY',path:'',severity:'error',message:(e as Error).message});}return r;
}
