// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic,Json} from '../../model/types';
import type {PARQUET_PAGE_LIMITS} from './package';
export {PARQUET_PAGE_LIMITS} from './package';
export interface ParquetPage {rowGroup:number;column:number;offset:number;headerBytes:number;bodyOffset:number;bodyBytes:number;header:Json}
export interface ParquetPageInspection {source:Document;status:'checked'|'blocked';complete:false;diagnostics:Diagnostic[];pages?:ParquetPage[];declaredUncompressedBytes?:number;declaredValues?:number}
