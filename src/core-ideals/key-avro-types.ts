// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
export interface AvroKeyArchive {schema:string;dependencies:{id:string;schema:string}[]}
export interface AvroKeyRequest {mode:'strict'|'report';profile:'schema-declarations';nativeSource:AvroKeyArchive}
export interface AvroKeyObservation {nativePath:string;name:string;fields:{name:string;nativePath:string}[];enforcement:'not-expressible';authorIntent:'unknown';provenance:'inferred';scope:'schema-declaration'}
export interface AvroKeyClassification {
 operation:'classify-avro-keys';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:AvroKeyRequest;
 binding:{id:'umf.avro.keys';version:'1.0.0';nativeVersion:'1.12.0';subset:'Schema declarations observed with Apache Avro 1.12.0 and fastavro 1.12.2; no collection uniqueness, authored identity inference or native equivalence'};
 observations:AvroKeyObservation[];
 residuals:{path:string;value:Json;outcome:'not-expressible';reason:string;recovery:'Original native archive retained; no authored key inferred'}[];
 diagnostics:Diagnostic[];
}
