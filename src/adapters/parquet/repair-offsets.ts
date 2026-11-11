// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic} from '../../model/types';
export interface ParquetOffsetRepair {source:Document;status:'transformed'|'blocked';complete:false;diagnostics:Diagnostic[];output?:Document;unchangedPrefixBytes?:number;repairs?:{rowGroup:number;column:number;oldDataOffset:number;dataOffset:number;dictionaryOffset:number}[]}
