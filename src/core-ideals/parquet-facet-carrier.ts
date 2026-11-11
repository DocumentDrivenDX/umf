// SPDX-License-Identifier: MIT OR Apache-2.0
import type {parquetCarriers} from './parquet-carriers';
export type ParquetFacetCarrier=
 |{kind:'primitive';nativeType:keyof typeof parquetCarriers}
 |{kind:'integer';bits:8|16|32|64;signed:boolean}
 |{kind:'fixed';bytes:number}
 |{kind:'decimal';carrier:'int32'|'int64'|'bytes'|'fixed';precision:number;scale:number;bytes?:number};
export interface ParquetFacetFileRequest {recordName:string;fieldName:string;nullable:boolean;fieldId?:number;carrier:ParquetFacetCarrier;metadata?:Record<string,string>;}
