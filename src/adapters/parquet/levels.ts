// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic} from '../../model/types';
export interface ParquetPageLevels {rowGroup:number;column:number;offset:number;repetition:number[];definition:number[];repetitionPadding:number[];definitionPadding:number[];valuesOffset:number;nonNullValues:number;rowStarts:number}
export interface ParquetLevels {source:Document;status:'decoded'|'blocked';complete:false;diagnostics:Diagnostic[];pages?:ParquetPageLevels[]}
