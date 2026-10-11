import {decodeParquetPageBodies} from './bodies';
import {inspectParquetSchema} from './schema';
import {decodeParquetHybrid} from './hybrid';
import type {Document,Diagnostic} from '../../model/types';
export interface ParquetPageLevels {rowGroup:number;column:number;offset:number;repetition:number[];definition:number[];repetitionPadding:number[];definitionPadding:number[];valuesOffset:number;nonNullValues:number;rowStarts:number}
export interface ParquetLevels {source:Document;status:'decoded'|'blocked';complete:false;diagnostics:Diagnostic[];pages?:ParquetPageLevels[]}
/** Decodes level streams only. Dictionary and physical value decoding remain separate. */
export function decodeParquetLevels(source:Document):ParquetLevels {
 const bodies=decodeParquetPageBodies(source),r:ParquetLevels={source:bodies.source,status:'blocked',complete:false,diagnostics:[...bodies.diagnostics]};if(bodies.status!=='decoded')return r;
 const schema=inspectParquetSchema(source),metadata=schema.metadata as any,pages:ParquetPageLevels[]=[],rows=new Map<string,number>(),seen=new Set<string>();
 try{
  for(const p of bodies.pages!){const h=p.header as any;if(h.type==='2')continue;const leaf=schema.leaves![p.column]!,v2=h.data_page_header_v2,data=v2??h.data_page_header,count=Number(data.num_values),body=new Uint8Array(p.bodyHex.length/2);for(let i=0;i<body.length;i++)body[i]=parseInt(p.bodyHex.slice(i*2,i*2+2),16);let at=0;
   function levels(max:number,kind:'repetition'|'definition'){
    let length=0;if(v2)length=Number(v2[kind+'_levels_byte_length']);
    if(max===0){if(length!==0)throw Error('Zero-level field has a nonempty level region');return {values:Array<number>(count).fill(0),padding:[]};}
    if(!v2){if(data[kind+'_level_encoding']!=='3')throw Error('Only RLE/hybrid V1 levels are supported');if(at+4>body.length)throw Error('Missing V1 level length');length=new DataView(body.buffer,body.byteOffset+at,4).getUint32(0,true);at+=4;}
    if(length>body.length-at)throw Error('Level region exceeds page body');const result=decodeParquetHybrid(body.subarray(at,at+length),Math.ceil(Math.log2(max+1)),count,max);at+=length;return result;
   }
   const repetition=levels(leaf.repetitionLevel,'repetition'),definition=levels(leaf.definitionLevel,'definition'),key=p.rowGroup+':'+p.column;let nonNullValues=0,rowStarts=0;
   for(let i=0;i<count;i++){if(repetition.values[i]!>definition.values[i]!)throw Error('Repetition level exceeds definition level');if(repetition.values[i]===0)rowStarts++;if(definition.values[i]===leaf.definitionLevel)nonNullValues++;}
   if(count&&(!seen.has(key)||v2)&&repetition.values[0]!==0)throw Error('Initial/V2 page must start at a row boundary');seen.add(key);
   if(v2&&(Number(v2.num_nulls)!==count-nonNullValues||Number(v2.num_rows)!==rowStarts))throw Error('Decoded V2 row/null counts differ from page header');rows.set(key,(rows.get(key)??0)+rowStarts);
   pages.push({rowGroup:p.rowGroup,column:p.column,offset:p.offset,repetition:repetition.values,definition:definition.values,repetitionPadding:repetition.padding,definitionPadding:definition.padding,valuesOffset:at,nonNullValues,rowStarts});
  }
  for(const [g,group] of metadata.row_groups.entries())for(let c=0;c<group.columns.length;c++)if((rows.get(g+':'+c)??0)!==Number(group.num_rows))throw Error('Decoded row starts differ from row-group count');
  r.status='decoded';r.pages=pages;r.diagnostics.push({code:'PARQUET_LEVEL_VALUES_UNVERIFIED',path:'',severity:'warning',message:'Level domains and row/null counts checked; cross-column structural consistency, dictionary indexes, physical values and complete row assembly remain unverified'});
 }catch(e){r.diagnostics.push({code:'PARQUET_LEVEL_DECODE',path:'',severity:'error',message:(e as Error).message});}return r;
}
