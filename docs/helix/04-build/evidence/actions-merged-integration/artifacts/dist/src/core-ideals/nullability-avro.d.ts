import { type Document, type Json, type Diagnostic, type Nullability, type ExtensionPackage } from '../model/types';
import { type NativeJson } from '../model/native-json';
import { type CoreNullabilityDeclaration } from '../model/nullability';
export declare const AVRO_NULLABILITY_EXTENSION = "umf.avro.nullability";
export declare const avroNullabilityPackage: ExtensionPackage;
export { default as avroNullabilityClassificationSchema } from '../../spec/core/avro-nullability-classification.schema.json';
export interface AvroNullabilityRequest {
    column: string;
    nativeSource: string;
    mode: 'strict' | 'report';
    scope: 'underlying-field-value' | 'reader-resolution' | 'write-input' | 'unresolved';
    carrier: 'avro-null' | 'unresolved';
    dependencies?: {
        id: string;
        schema: string;
    }[];
    author?: CoreNullabilityDeclaration;
}
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
};
declare const recovery: 'Retain the complete source and native archive; unknown native meaning is not replaced by the core label';
export interface AvroNullabilityClassification {
    operation: 'classify-avro-nullability';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    source: Document;
    target?: Document;
    request: AvroNullabilityRequest;
    binding: typeof binding;
    mapping: {
        origin: 'classified';
        idealPath: string;
        nativePath: string;
        dependencyId?: string;
        nativeFragment: NativeJson;
        nullability: Nullability;
        interpretation: 'declared' | 'unknown' | 'unsupported';
        outcome: 'exact' | 'unknown' | 'not-expressible';
        scope: AvroNullabilityRequest['scope'];
        carrier: AvroNullabilityRequest['carrier'];
        basis: 'Underlying field type in a present containing record; not member omission, reader defaults, ancestor availability or logical refinements';
    };
    residuals: {
        path: string;
        value: Json;
        reason: string;
        recovery: typeof recovery;
    }[];
    diagnostics: Diagnostic[];
}
export declare function classifyAvroNullability(input: Document, options: AvroNullabilityRequest): AvroNullabilityClassification;
/** Receipt consistency is not authentication; any model edit requires reclassification. */
export declare function verifyAvroNullabilityClassification(input: AvroNullabilityClassification, current: Document): AvroNullabilityClassification;
/** Recover exact original schema bundle text, including unclaimed native content. */
export declare function recoverAvroNullabilityBundle(input: AvroNullabilityClassification, current: Document): {
    schema: string;
    dependencies: {
        id: string;
        schema: string;
    }[];
};
