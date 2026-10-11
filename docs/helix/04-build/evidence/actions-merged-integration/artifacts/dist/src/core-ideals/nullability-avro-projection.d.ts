import { avroCarriers } from './avro-carriers';
import { type Document, type Json, type Diagnostic } from '../model/types';
import { type CoreNullabilityDeclaration } from '../model/nullability';
export { default as nullabilityAvroProjectionSchema } from '../../spec/core/nullability-avro-projection.schema.json';
export interface NullabilityAvroRequest {
    id: string;
    recordName: string;
    namespace: string;
    fieldName: string;
    nativeType: keyof typeof avroCarriers;
    mode: 'strict' | 'report';
    scope: 'underlying-field-value' | 'write-input' | 'reader-resolution' | 'unresolved';
    carrier: 'avro-null' | 'unresolved';
}
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
};
export interface NullabilityAvroProjection {
    operation: 'project-nullability-avro';
    version: '1.0.0';
    status: 'projected' | 'blocked';
    source: Document;
    author: CoreNullabilityDeclaration;
    request: NullabilityAvroRequest;
    target?: Document;
    binding: typeof binding;
    diagnostics: Diagnostic[];
    mapping: {
        origin: 'authored';
        nullability: 'required' | 'absent-allowed' | 'unspecified';
        encoding: 'non-null' | 'null-union' | 'null-only';
        basis: 'authored-requirement' | 'no-authored-requirement' | 'unprojected-requirement';
        scope: NullabilityAvroRequest['scope'];
        carrier: NullabilityAvroRequest['carrier'];
        idealPath: string;
        nativePath: '/fields/0/type';
        outcome: 'exact' | 'unknown' | 'not-expressible';
    };
    residuals: {
        path: string;
        value: Json;
        reason: string;
        outcome: 'unknown' | 'not-expressible';
        recovery: 'Recover source meaning with retained projection receipt; native-only import does not recover author intent';
    }[];
}
export declare function projectNullabilityToAvro(input: CoreNullabilityDeclaration, options: NullabilityAvroRequest): NullabilityAvroProjection & {
    diagnostics: Diagnostic[];
};
/** Recover retained author meaning only when the receipt and supplied native target still agree. */
export declare function recoverNullabilityFromAvro(input: NullabilityAvroProjection, nativeText: string): Document;
