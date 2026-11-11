// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic,Json,Cardinality} from '../model/types';
import type {NativeJson} from '../model/native-json';
import type {AvroTypeLocation} from './avro-cardinality-type';

export interface AvroCardinalityRequest {
 column:string;nativeSource:string;dependencies?:{id:string;schema:string}[];
 identity:{module:string;element:string};profile:'present-non-null-schema'|'unresolved';mode:'strict'|'report';
}
interface AvroCardinalityNode {
 identity:{module:string;element:string};location:AvroTypeLocation;nativeFragment:NativeJson;
 cardinality:Cardinality;interpretation:'declared'|'unknown'|'unsupported';nativeAllowsNull:boolean|null;definitions:AvroTypeLocation[];
}
export interface AvroCardinalityClassification {
 operation:'classify-avro-cardinality';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;
 request:AvroCardinalityRequest;
 binding:{id:'umf.avro.cardinality';version:'1.0.0';nativeVersion:'1.12.0';subset:'Declared shape of present non-null values; native union branches, availability, logical refinements and codec behavior remain separate'};
 mapping:{origin:'classified';cardinality:Cardinality;outcome:'exact'|'unknown'|'not-expressible';basis:string;nodes:AvroCardinalityNode[]};
 residuals:{path:string;value:Json;reason:string;recovery:string}[];diagnostics:Diagnostic[];
}
