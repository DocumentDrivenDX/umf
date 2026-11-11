// SPDX-License-Identifier: MIT OR Apache-2.0
import type {IcebergTableTransforms} from './table-transforms';
export interface IcebergTablePromotionReport {
 complete:false;previousSchemaId:number;nextSchemaId:number;fieldId:number;
 sourceType:string;targetType:string;appendedSchemaPath:string;
 checkedPartitionFields:string[];bindings:IcebergTableTransforms;limitations:string[];
}
