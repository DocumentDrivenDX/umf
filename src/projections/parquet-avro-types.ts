// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '../model/types';
import type {ProjectionIssue} from './projection-types';
export interface ParquetAvroPolicy {id:string;recordName:string;namespace:string;fieldNames:Record<string,string>;maps:'entry-arrays';lossPolicy:'strict'|'allow-reported-loss';}
export interface ParquetAvroProjection {status:'blocked'|'projected';source:Document;policy:ParquetAvroPolicy;issues:ProjectionIssue[];mappings:{index:number;path:string[]}[];target?:Document;nativeSchema?:string;}
