// SPDX-License-Identifier: MIT OR Apache-2.0
import type {ParquetPhysicalValue} from './physical';
import type {Document,Diagnostic} from '../../model/types';
export type ParquetRowValue=null|{kind:'record';fields:{index:number;name:string;value:ParquetRowValue}[]}|{kind:'repeated';items:ParquetRowValue[]}|{kind:'physical';value:ParquetPhysicalValue};
export interface ParquetRows {source:Document;status:'assembled'|'blocked';complete:false;diagnostics:Diagnostic[];rows?:ParquetRowValue[]}
import type {PARQUET_ROW_NODE_LIMIT} from './package';
export {PARQUET_ROW_NODE_LIMIT} from './package';
