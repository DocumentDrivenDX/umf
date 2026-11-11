// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic,Nullability} from '../model/types';
import type {NativeJson} from '../model/native-json';
import type {CoreNullabilityDeclaration} from '../model/nullability';
export interface AvroNullabilityRequest {
 column:string;nativeSource:string;mode:'strict'|'report';scope:'underlying-field-value'|'reader-resolution'|'write-input'|'unresolved';carrier:'avro-null'|'unresolved';dependencies?:{id:string;schema:string}[];author?:CoreNullabilityDeclaration;
}
export interface AvroNullabilityClassification {
 operation:'classify-avro-nullability';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:AvroNullabilityRequest;
 binding:{id:'umf.avro.nullability';version:'1.0.0';nativeVersion:'1.12.0';subset:'Underlying field-value null carrier in declared records; excludes writer omission, reader defaults and logical refinements'};
 mapping:{origin:'classified';idealPath:string;nativePath:string;dependencyId?:string;nativeFragment:NativeJson;nullability:Nullability;interpretation:'declared'|'unknown'|'unsupported';outcome:'exact'|'unknown'|'not-expressible';scope:AvroNullabilityRequest['scope'];carrier:AvroNullabilityRequest['carrier'];basis:'Underlying field type in a present containing record; not member omission, reader defaults, ancestor availability or logical refinements'};
 residuals:{path:string;value:Json;reason:string;recovery:'Retain the complete source and native archive; unknown native meaning is not replaced by the core label'}[];
 diagnostics:Diagnostic[];
}
