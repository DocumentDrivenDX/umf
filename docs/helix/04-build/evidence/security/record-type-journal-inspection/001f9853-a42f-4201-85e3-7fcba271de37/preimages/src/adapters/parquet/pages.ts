import {inspectParquetSchema} from './schema';
import {exportParquetCapture,inspectParquetFraming} from './index';
import {decodeCompactStruct} from './compact';
import {mapParquetIdl} from './idl-map';
import {unsafeParquetMetadata} from './rewrite';
import type {Document,Diagnostic,Json} from '../../model/types';
export const PARQUET_PAGE_LIMITS={headerBytes:65536,pages:10000,pageBytes:8*1024*1024,totalBytes:64*1024*1024,pageValues:100000,totalValues:1000000,rows:10000} as const;
export interface ParquetPage {rowGroup:number;column:number;offset:number;headerBytes:number;bodyOffset:number;bodyBytes:number;header:Json}
export interface ParquetPageInspection {source:Document;status:'checked'|'blocked';complete:false;diagnostics:Diagnostic[];pages?:ParquetPage[];declaredUncompressedBytes?:number;declaredValues?:number}
/** Validates declared page boundaries/budgets without decompressing or decoding data. */
export function inspectParquetPages(source:Document):ParquetPageInspection {
 const inspected=inspectParquetSchema(source),r:ParquetPageInspection={source:inspected.source,status:'blocked',complete:false,diagnostics:[...inspected.diagnostics]};if(inspected.status!=='checked')return r;
 const metadata=inspected.metadata as any,bytes=exportParquetCapture(source),footer=inspectParquetFraming(source).footerRegion!.offset,pages:ParquetPage[]=[],ranges:{start:number;end:number}[]=[];let totalBytes=0,totalValues=0;
 const fail=(message:string):never=>{throw Error(message);};const count=(v:string,max:number,label:string)=>{const n=BigInt(v);if(n<0n||n>BigInt(max))fail(label+' exceeds supported nonnegative bound');return Number(n);};
 try{
  if(unsafeParquetMetadata(metadata)||r.diagnostics.some(d=>d.code==='PARQUET_ENUM_UNKNOWN'))fail('Unknown/crypto metadata prevents page interpretation');count(metadata.num_rows,PARQUET_PAGE_LIMITS.rows,'Rows');
  for(const [g,group] of metadata.row_groups.entries())for(const [c,column] of group.columns.entries()){
   if(column.file_path!==undefined||!column.meta_data)fail('External or unavailable columns cannot be inspected');const m=column.meta_data,start=count(m.dictionary_page_offset??m.data_page_offset,footer,'Chunk offset'),size=count(m.total_compressed_size,footer,'Chunk size'),end=start+size;
   if(start<4||end>footer)fail('Column chunk is outside the data region');if(ranges.some(x=>start<x.end&&end>x.start))fail('Column chunks overlap');ranges.push({start,end});
   const expectedValues=count(m.num_values,PARQUET_PAGE_LIMITS.totalValues,'Column values'),expectedBytes=count(m.total_uncompressed_size,PARQUET_PAGE_LIMITS.totalBytes,'Column uncompressed size');let at=start,values=0,uncompressed=0,firstData:number|undefined,dictionary=false,v2Rows=0,allV2=true;
   while(at<end){
    if(pages.length>=PARQUET_PAGE_LIMITS.pages)fail('Page count limit exceeded');const decoded=decodeCompactStruct(bytes.subarray(at,Math.min(end,at+PARQUET_PAGE_LIMITS.headerBytes))),header=mapParquetIdl(decoded.value,'PageHeader',r.diagnostics) as any;
    if(unsafeParquetMetadata(header)||r.diagnostics.some(d=>d.code==='PARQUET_ENUM_UNKNOWN'))fail('Unknown page header semantics');
    const compressed=count(header.compressed_page_size,PARQUET_PAGE_LIMITS.pageBytes,'Page compressed size'),expanded=count(header.uncompressed_page_size,PARQUET_PAGE_LIMITS.pageBytes,'Page uncompressed size'),bodyOffset=at+decoded.consumedBytes;if(bodyOffset+compressed>end)fail('Page body exceeds column chunk');
    const type=header.type,which=type==='0'?'data_page_header':type==='2'?'dictionary_page_header':type==='3'?'data_page_header_v2':undefined;if(!which||!header[which])fail('Unsupported or missing page-type header');
    for(const k of ['data_page_header','dictionary_page_header','data_page_header_v2','index_page_header'])if(k!==which&&header[k]!==undefined)fail('Conflicting page-type headers');
    const h=header[which!],n=count(h.num_values,PARQUET_PAGE_LIMITS.pageValues,'Page values');
    if(type==='2'){if(dictionary||at!==start||m.dictionary_page_offset===undefined)fail('Dictionary must occur once at declared chunk start');dictionary=true;}
    else {firstData??=at;values+=n;if(values>PARQUET_PAGE_LIMITS.totalValues)fail('Column value limit exceeded');if(type==='0')allV2=false;else{const nulls=count(h.num_nulls,n,'Page nulls'),rows=count(h.num_rows,PARQUET_PAGE_LIMITS.rows,'Page rows'),levels=count(h.definition_levels_byte_length,compressed,'Definition bytes')+count(h.repetition_levels_byte_length,compressed,'Repetition bytes');if(rows>n||levels>compressed||levels>expanded)fail('Inconsistent V2 counts or level lengths');v2Rows+=rows;void nulls;if(h.is_compressed===false&&compressed!==expanded)fail('Uncompressed V2 sizes differ');}}
    if(m.codec==='0'&&compressed!==expanded)fail('Uncompressed page sizes differ');
    if(type!=='2'&&['2','8'].includes(h.encoding)&&!dictionary)fail('Dictionary-encoded data lacks a preceding dictionary');
    uncompressed+=decoded.consumedBytes+expanded;totalBytes+=decoded.consumedBytes+expanded;totalValues+=n;if(totalBytes>PARQUET_PAGE_LIMITS.totalBytes||totalValues>PARQUET_PAGE_LIMITS.totalValues)fail('Aggregate page budget exceeded');
    pages.push({rowGroup:g,column:c,offset:at,headerBytes:decoded.consumedBytes,bodyOffset,bodyBytes:compressed,header});at=bodyOffset+compressed;
   }
   if(values!==expectedValues||uncompressed!==expectedBytes)fail('Page totals differ from column metadata');if(firstData!==undefined&&firstData!==count(m.data_page_offset,footer,'Data offset'))fail('First data page differs from declared offset');if(m.dictionary_page_offset!==undefined&&!dictionary)fail('Declared dictionary page is absent');if(allV2&&v2Rows!==Number(group.num_rows))fail('V2 row totals differ from row group');
  }
  r.status='checked';r.pages=pages;r.declaredUncompressedBytes=totalBytes;r.declaredValues=totalValues;r.diagnostics.push({code:'PARQUET_PAGE_PAYLOAD_UNVERIFIED',path:'',severity:'warning',message:'Page headers/boundaries and declared budgets checked; decompressed sizes, encodings, levels, values and CRCs remain unverified'});
 }catch(e){r.diagnostics.push({code:'PARQUET_PAGE_BOUNDS',path:'',severity:'error',message:(e as Error).message});}return r;
}
