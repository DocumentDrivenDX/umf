import { type Document, type Json, type Diagnostic, type ExtensionPackage } from '../model/types';
export declare const AVRO_KEYS_EXTENSION = "umf.avro.keys";
export declare const avroKeysPackage: ExtensionPackage;
export { default as avroKeyClassificationSchema } from '../../spec/core/avro-key-classification.schema.json';
export interface AvroKeyArchive {
    schema: string;
    dependencies: {
        id: string;
        schema: string;
    }[];
}
export interface AvroKeyRequest {
    mode: 'strict' | 'report';
    profile: 'schema-declarations';
    nativeSource: AvroKeyArchive;
}
export interface AvroKeyObservation {
    nativePath: string;
    name: string;
    fields: {
        name: string;
        nativePath: string;
    }[];
    enforcement: 'not-expressible';
    authorIntent: 'unknown';
    provenance: 'inferred';
    scope: 'schema-declaration';
}
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
}, recovery: 'Original native archive retained; no authored key inferred';
export interface AvroKeyClassification {
    operation: 'classify-avro-keys';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    source: Document;
    target?: Document;
    request: AvroKeyRequest;
    binding: typeof binding;
    observations: AvroKeyObservation[];
    residuals: {
        path: string;
        value: Json;
        outcome: 'not-expressible';
        reason: string;
        recovery: typeof recovery;
    }[];
    diagnostics: Diagnostic[];
}
/** Observe record declarations; unknown metadata, field order and defaults never assert identity. */
export declare function classifyAvroKeys(input: Document, options: AvroKeyRequest): AvroKeyClassification;
export declare function verifyAvroKeyClassification(input: AvroKeyClassification, current: Document): AvroKeyClassification;
export declare function recoverAvroKeySource(input: AvroKeyClassification, current: Document): AvroKeyArchive;
