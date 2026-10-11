import { type Document, type Json, type Diagnostic, type ExtensionPackage } from '../model/types';
import type { NativeJson } from '../model/native-json';
export declare const AVRO_RELATIONSHIPS_EXTENSION = "umf.avro.relationships";
export declare const avroRelationshipsPackage: ExtensionPackage;
export { default as avroRelationshipClassificationSchema } from '../../spec/core/avro-relationship-classification.schema.json';
export interface AvroRelationshipArchive {
    schema: string;
    dependencies: {
        id: string;
        schema: string;
    }[];
}
export interface AvroRelationshipRequest {
    mode: 'strict' | 'report';
    profile: 'schema-structure';
    nativeSource: AvroRelationshipArchive;
}
export interface AvroRelationshipObservation {
    nativePath: string;
    kind: 'record' | 'named-type-token' | 'union' | 'array' | 'map';
    nativeNode: NativeJson;
    nameResolution: 'unverified';
    enforcement: 'not-expressible';
    authorIntent: 'unknown';
    provenance: 'inferred';
    scope: 'schema-structure';
}
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
}, recovery: 'Original native archive retained; no authored relationship inferred';
export interface AvroRelationshipClassification {
    operation: 'classify-avro-relationships';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    source: Document;
    target?: Document;
    request: AvroRelationshipRequest;
    binding: typeof binding;
    observations: AvroRelationshipObservation[];
    residuals: {
        path: string;
        value: Json;
        outcome: 'not-expressible';
        reason: string;
        recovery: typeof recovery;
    }[];
    diagnostics: Diagnostic[];
}
/** Observe native schema grammar without resolving names or inferring authored associations. */
export declare function classifyAvroRelationships(input: Document, options: AvroRelationshipRequest): AvroRelationshipClassification;
export declare function verifyAvroRelationshipClassification(input: AvroRelationshipClassification, current: Document): AvroRelationshipClassification;
export declare function recoverAvroRelationshipSource(input: AvroRelationshipClassification, current: Document): AvroRelationshipArchive;
