import {decodeParquetPageBodies} from './bodies';
import {decodeParquetLevels,type ParquetPageLevels} from './levels';
import {inspectParquetSchema} from './schema';
import {decodeParquetPlain,physicalValueBytes,type ParquetPhysicalValue} from './plain';
import {decodeParquetHybrid} from './hybrid';
import type {Document,Diagnostic} from '../../model/types';
export type {ParquetPhysicalValue} from './plain';
export interface ParquetPhysicalPage {rowGroup:number;column:number;offset:number;kind:'dictionary'|'data';values:ParquetPhysicalValue[];levels?:ParquetPageLevels;dictionaryIndexes?:number[];dictionaryPadding?:number[]}
export interface ParquetPhysical {source:Document;status:'decoded'|'blocked';complete:false;diagnostics:Diagnostic[];pages?:ParquetPhysicalPage[];materializedBytes?:number}
/** Bounded PLAIN and dictionary carriers; scalar semantics and row assembly are separate. */
export function decodeParquetPhysical(source:Document):ParquetPhysical {
 const levels=decodeParquetLevels(source),r:ParquetPhysical={source:levels.source,status:'blocked',complete:false,diagnostics:[...levels.diagnostics]};if(levels.status!=='decoded')return r;
 const bodies=decodeParquetPageBodies(source),schema=inspectParquetSchema(source),metadata=schema.metadata as any,dictionaries=new Map<string,ParquetPhysicalValue[]>(),byOffset=new Map(levels.pages!.map(p=>[p.offset,p])),pages:ParquetPhysicalPage[]=[];let materializedBytes=0;
 try{
  for(const p of bodies.pages!){const h=p.header as any,isDictionary=h.type==='2',leaf=schema.leaves![p.column]!,e=metadata.schema[leaf.index],l=byOffset.get(p.offset),header=isDictionary?h.dictionary_page_header:h.data_page_header_v2??h.data_page_header,count=isDictionary?Number(header.num_values):l!.nonNullValues,encoding=header.encoding,key=p.rowGroup+':'+p.column,bytes=new Uint8Array(p.bodyHex.length/2);for(let i=0;i<bytes.length;i++)bytes[i]=parseInt(p.bodyHex.slice(i*2,i*2+2),16);const input=bytes.subarray(isDictionary?0:l!.valuesOffset);let values:ParquetPhysicalValue[],dictionaryIndexes:number[]|undefined,dictionaryPadding:number[]|undefined;
   if(encoding==='0'||isDictionary&&encoding==='2')values=decodeParquetPlain(input,leaf.physicalType,count,e.type_length===undefined?undefined:Number(e.type_length));
   else if(!isDictionary&&['2','8'].includes(encoding)){
    const dictionary=dictionaries.get(key);if(!dictionary)throw Error('Dictionary page unavailable');if(!input.length){if(count!==0)throw Error('Missing dictionary bit width');values=[];dictionaryIndexes=[];dictionaryPadding=[];}
    else{const width=input[0]!;if(count&&dictionary.length===0)throw Error('Empty dictionary referenced');const decoded=decodeParquetHybrid(input.subarray(1),width,count,Math.min(2**width-1,Math.max(0,dictionary.length-1)));dictionaryIndexes=decoded.values;dictionaryPadding=decoded.padding;values=decoded.values.map(i=>({...dictionary[i]!}));}
   }else throw Error('Physical value encoding '+encoding+' is not supported');
   for(const v of values){materializedBytes+=physicalValueBytes(v);if(materializedBytes>67108864)throw Error('Expanded physical values exceed 64 MiB budget');}
   if(isDictionary)dictionaries.set(key,values);
   pages.push({rowGroup:p.rowGroup,column:p.column,offset:p.offset,kind:isDictionary?'dictionary':'data',values,...(l?{levels:l}:{}),...(dictionaryIndexes?{dictionaryIndexes,dictionaryPadding:dictionaryPadding!}: {})});
  }
  r.pages=pages;r.materializedBytes=materializedBytes;r.status='decoded';r.diagnostics.push({code:'PARQUET_PHYSICAL_SEMANTICS_UNVERIFIED',path:'',severity:'warning',message:'Exact physical carriers decoded; logical validation, cross-column consistency and complete row assembly remain unverified'});
 }catch(e){r.diagnostics.push({code:'PARQUET_PHYSICAL_DECODE',path:'',severity:'error',message:(e as Error).message});}return r;
}
