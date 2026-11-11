// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import type {NativeJson} from '../model/native-json';
export interface AvroRelationshipArchive {schema:string;dependencies:{id:string;schema:string}[]}
export interface AvroRelationshipRequest {mode:'strict'|'report';profile:'schema-structure';nativeSource:AvroRelationshipArchive}
export interface AvroRelationshipObservation {nativePath:string;kind:'record'|'named-type-token'|'union'|'array'|'map';nativeNode:NativeJson;nameResolution:'unverified';enforcement:'not-expressible';authorIntent:'unknown';provenance:'inferred';scope:'schema-structure'}
export interface AvroRelationshipClassification {
 operation:'classify-avro-relationships';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:AvroRelationshipRequest;
 binding:{id:'umf.avro.relationships';version:'1.0.0';nativeVersion:'1.12.0';subset:'Structural observations informed by Apache Avro 1.12.0 and fastavro 1.12.2 discovery; no name resolution, native validity certification, authored association inference or native equivalence'};
 observations:AvroRelationshipObservation[];
 residuals:{path:string;value:Json;outcome:'not-expressible';reason:string;recovery:'Original native archive retained; no authored relationship inferred'}[];
 diagnostics:Diagnostic[];
}
