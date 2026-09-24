import {mapParquetIdl} from './idl-map';
import {decodeParquetFooter,type ParquetWireValue} from './footer';
import type {Document,Diagnostic,Json} from '../../model/types';
export interface ParquetMetadataInspection {source:Document;status:'mapped'|'blocked';complete:false;diagnostics:Diagnostic[];wire?:ParquetWireValue;metadata?:Json}
/** Maps known IDL fields; opaque fields and authoritative bytes remain available. */
export function inspectParquetMetadata(source:Document):ParquetMetadataInspection{
 const decoded=decodeParquetFooter(source),r:ParquetMetadataInspection={source:decoded.source,status:'blocked',complete:false,diagnostics:[...decoded.diagnostics]};if(!decoded.value)return r;r.wire=decoded.value;
 try{r.metadata=mapParquetIdl(decoded.value,'FileMetaData',r.diagnostics);r.status='mapped';r.diagnostics.push({code:'PARQUET_METADATA_SEMANTICS_UNVERIFIED',path:'',severity:'warning',message:'Known IDL shapes mapped; schema-tree consistency, logical constraints, native reading and safe edits remain unverified'});}catch(e){if(!r.diagnostics.some(d=>d.code==='PARQUET_METADATA_SHAPE'))r.diagnostics.push({code:'PARQUET_METADATA_SHAPE',path:'',severity:'error',message:(e as Error).message});}return r;
}
