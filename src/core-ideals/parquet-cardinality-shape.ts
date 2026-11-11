// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Json,Cardinality,ScalarType} from '../model/types';
import type {ParquetContainer} from '../adapters/parquet/containers';
export interface ParquetCardinalityNode {
 index:number;path:string[];nativeFragment:Json;
 shape:Cardinality;role:'scalar'|'record'|'array'|'map'|'unresolved';
 nativeNullable:boolean|null;scalarType?:ScalarType;itemIndex?:number;
 recordMembers?:number[];container?:ParquetContainer;
 residuals:{path:string;reason:string}[];
}
export interface ParquetCardinalityShape {index:number;nodes:ParquetCardinalityNode[];}
