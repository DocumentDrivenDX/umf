// SPDX-License-Identifier: MIT OR Apache-2.0
import type {ParquetLogicalInspection} from './logical';
export type ParquetContainer = {index:number;kind:'list';nullable:boolean;repeatedIndex:number;elementIndex:number;elementNullable:boolean;layout:'two-level'|'three-level'} | {index:number;kind:'map';nullable:boolean;repeatedIndex:number;keyIndex:number;valueIndex?:number;valueNullable:boolean;duplicateKeys:'last-value'};
export interface ParquetContainerInspection extends ParquetLogicalInspection {containers?:ParquetContainer[]}
