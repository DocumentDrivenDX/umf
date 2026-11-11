// SPDX-License-Identifier: MIT OR Apache-2.0
import type {ParquetPageLevels} from './levels';
import type {ParquetPhysicalValue} from './plain';
import type {Document,Diagnostic} from '../../model/types';
export type {ParquetPhysicalValue} from './plain';
export interface ParquetPhysicalPage {rowGroup:number;column:number;offset:number;kind:'dictionary'|'data';values:ParquetPhysicalValue[];levels?:ParquetPageLevels;dictionaryIndexes?:number[];dictionaryPadding?:number[]}
export interface ParquetPhysical {source:Document;status:'decoded'|'blocked';complete:false;diagnostics:Diagnostic[];pages?:ParquetPhysicalPage[];materializedBytes?:number}
