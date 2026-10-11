import {inspectParquetSchema} from './schema';
import {decodeParquetFooter} from './footer';
import {rewriteParquetFooter,unsafeParquetMetadata} from './rewrite';
import {decodeCompactStruct} from './compact';
import {mapParquetIdl} from './idl-map';
import {inspectParquetPages,PARQUET_PAGE_LIMITS} from './pages';
import {decodeParquetValues} from './values';
import {exportParquetCapture,inspectParquetFraming} from './index';
import {copyJson} from '../../model/json';
import type {Document,Diagnostic} from '../../model/types';
export interface ParquetOffsetRepair {source:Document;status:'transformed'|'blocked';complete:false;diagnostics:Diagnostic[];output?:Document;unchangedPrefixBytes?:number;repairs?:{rowGroup:number;column:number;oldDataOffset:number;dataOffset:number;dictionaryOffset:number}[]}
/** Explicit correction of a dictionary stored at data_page_offset with no dictionary offset. */
export function repairParquetDictionaryOffsets(source:Document):ParquetOffsetRepair {
 const inspected=inspectParquetSchema(source),r:ParquetOffsetRepair={source:inspected.source,status:'blocked',complete:false,diagnostics:[...inspected.diagnostics]};if(inspected.status!=='checked')return r;
 try{
  const metadata=inspected.metadata as any,footer=decodeParquetFooter(source);if(footer.trailingBytes!==0||unsafeParquetMetadata(metadata)||r.diagnostics.some(d=>d.code==='PARQUET_ENUM_UNKNOWN'))throw Error('Unknown, crypto or trailing footer content prevents repair');
  const tree=copyJson(footer.value!) as any,bytes=exportParquetCapture(source),end=inspectParquetFraming(source).footerRegion!.offset,repairs:NonNullable<ParquetOffsetRepair['repairs']>=[];
  const field=(s:any,id:number)=>{if(s.kind!=='struct')throw Error('Expected metadata struct');const f=s.fields.find((f:any)=>f.id===id);if(!f)throw Error('Required wire metadata missing');return f.value;};
  const groups=field(tree,4);if(groups.kind!=='list')throw Error('Expected row groups');
  for(const [g,group] of metadata.row_groups.entries())for(const [c,column] of group.columns.entries()){
   if(column.file_path!==undefined||!column.meta_data)throw Error('External or missing columns cannot be repaired');const m=column.meta_data;if(m.dictionary_page_offset!==undefined)continue;
   const offset=BigInt(m.data_page_offset),size=BigInt(m.total_compressed_size);if(offset<4n||size<0n||offset+size>BigInt(end))throw Error('Column chunk outside data region');const start=Number(offset),limit=Number(offset+size);
   const parsed=decodeCompactStruct(bytes.subarray(start,Math.min(limit,start+PARQUET_PAGE_LIMITS.headerBytes))),header=mapParquetIdl(parsed.value,'PageHeader',r.diagnostics) as any;
   if(unsafeParquetMetadata(header)||r.diagnostics.some(d=>d.code==='PARQUET_ENUM_UNKNOWN'))throw Error('Unknown page semantics prevents repair');if(header.type!=='2')continue;
   const body=BigInt(header.compressed_page_size);if(body<0n||body>BigInt(PARQUET_PAGE_LIMITS.pageBytes))throw Error('Dictionary body exceeds supported bounds');const next=start+parsed.consumedBytes+Number(body);if(next>=limit)throw Error('Dictionary is not followed by data in this chunk');
   const following=mapParquetIdl(decodeCompactStruct(bytes.subarray(next,Math.min(limit,next+PARQUET_PAGE_LIMITS.headerBytes))).value,'PageHeader',r.diagnostics) as any;if(!['0','3'].includes(following.type))throw Error('Dictionary must be followed by a data page');
   const columns=field(groups.items[g],1);if(columns.kind!=='list')throw Error('Expected columns');const wire=field(columns.items[c],3),data=field(wire,9);if(data.kind!=='i64')throw Error('Expected data offset integer');data.value=String(next);wire.fields.push({id:11,value:{kind:'i64',value:String(start)}});repairs.push({rowGroup:g,column:c,oldDataOffset:start,dataOffset:next,dictionaryOffset:start});
  }
  if(!repairs.length)throw Error('No matching legacy dictionary-offset layout found');
  const rewritten=rewriteParquetFooter(source,tree),checked=inspectParquetPages(rewritten.output);if(checked.status!=='checked')throw Error('Candidate page validation failed: '+checked.diagnostics.filter(d=>d.severity==='error').map(d=>d.message).join('; '));const values=decodeParquetValues(rewritten.output);if(values.status!=='projected')throw Error('Candidate value validation failed: '+values.diagnostics.filter(d=>d.severity==='error').map(d=>d.message).join('; '));
  r.output=rewritten.output;r.unchangedPrefixBytes=rewritten.unchangedPrefixBytes;r.repairs=repairs;r.status='transformed';r.diagnostics.push({code:'PARQUET_OFFSET_REPAIR_SCOPE',path:'',severity:'warning',message:'Explicit offset correction; all bytes before the footer are unchanged. Original source remains authoritative; footer spelling may normalize. Candidate passes bounded page/value decoding, not general Parquet conformance'});
 }catch(e){r.diagnostics.push({code:'PARQUET_OFFSET_REPAIR_BLOCKED',path:'',severity:'error',message:(e as Error).message});}return r;
}
