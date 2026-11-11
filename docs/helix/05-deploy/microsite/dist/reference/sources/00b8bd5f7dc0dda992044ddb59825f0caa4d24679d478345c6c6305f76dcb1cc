// SPDX-License-Identifier: MIT OR Apache-2.0
import type {ParquetMetadataInspection} from './metadata';
export interface ParquetSchemaNode {index:number;name:string;path:string[];definitionLevel:number;repetitionLevel:number;children:ParquetSchemaNode[]}
export interface ParquetSchemaLeaf {index:number;ordinal:number;path:string[];physicalType:string;definitionLevel:number;repetitionLevel:number}
export interface ParquetSchemaInspection extends Omit<ParquetMetadataInspection,'status'> {status:'checked'|'blocked';tree?:ParquetSchemaNode;leaves?:ParquetSchemaLeaf[]}
