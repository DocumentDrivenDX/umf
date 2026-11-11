// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic} from '../../model/types';
import type {ArrowFlatbufferEncodingBackend} from '../arrow/api-types';

export interface ParquetArrowSchema {source:Document;status:'absent'|'decoded'|'blocked';complete:false;diagnostics:Diagnostic[];metadataIndex?:number;ipcHex?:string;message?:Document;schema?:Document;}
export interface ParquetArrowRenamePolicy {parquetIndex:number;arrowFieldPath:number[];name:string;parquetName?:string;uninterpretedMetadata:'preserve-and-report';}
export interface ParquetArrowRenameResult {source:Document;policy:ParquetArrowRenamePolicy;status:'blocked'|'transformed';complete:false;diagnostics:Diagnostic[];output?:Document;unchangedPrefixBytes?:number;rename?:{from:string[];to:string[];parquetFrom?:string[];parquetTo?:string[]};}
export type {ArrowFlatbufferEncodingBackend};
