// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic} from '../model/types';
import type {ProjectionIssue} from './projection-types';

export interface ProtobufProjectionOptions {
 id:string;packageName:string;messageName:string;
 fields:Record<string,{number:number}>;
 integerType:'int64'|'uint64'|'sint64'|'int32'|'uint32'|'sint32';
 lossPolicy:'strict'|'allow-reported-loss';
}
export interface ProtobufProjection {
 status:'blocked'|'projected';source:Document;policy:ProtobufProjectionOptions;issues:ProjectionIssue[];
 mappings:{sourcePath:string;targetMessage:string;targetField:string;number:number}[];
 nativeSource?:string;target?:Document;targetDiagnostics?:Diagnostic[];
}
