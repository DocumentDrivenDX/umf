// SPDX-License-Identifier: MIT OR Apache-2.0
import type {parquetCarriers} from './parquet-carriers';
type Availability={nullable:boolean;fieldId?:number};
export type ParquetCardinalityCarrier=Availability&(
 {kind:'scalar';nativeType:keyof typeof parquetCarriers}|
 {kind:'array';item:ParquetCardinalityCarrier}|
 {kind:'map';keyType:keyof typeof parquetCarriers;value:ParquetCardinalityCarrier}|
 {kind:'record';fields:{name:string;type:ParquetCardinalityCarrier}[]}
);
