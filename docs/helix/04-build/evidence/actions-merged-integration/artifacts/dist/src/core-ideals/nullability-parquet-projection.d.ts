import { parquetCarriers } from './parquet-carriers';
import { type Document, type Json, type Diagnostic } from '../model/types';
import { type CoreNullabilityDeclaration } from '../model/nullability';
export { default as nullabilityParquetProjectionSchema } from '../../spec/core/nullability-parquet-projection.schema.json';
export interface NullabilityParquetRequest {
    id: string;
    recordName: string;
    fieldName: string;
    nativeType: keyof typeof parquetCarriers;
    mode: 'strict' | 'report';
    scope: 'row-leaf-value' | 'repeated-element-value' | 'write-input' | 'unresolved';
    carrier: 'definition-level' | 'unresolved';
}
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
};
export interface NullabilityParquetProjection {
    operation: 'project-nullability-parquet';
    version: '1.0.0';
    status: 'projected' | 'blocked';
    source: Document;
    author: CoreNullabilityDeclaration;
    request: NullabilityParquetRequest;
    target?: Document;
    binding: typeof binding;
    diagnostics: Diagnostic[];
    mapping: {
        origin: 'authored';
        nullability: 'required' | 'absent-allowed' | 'unspecified';
        encoding: 'required' | 'optional';
        basis: 'authored-requirement' | 'no-authored-requirement' | 'unprojected-requirement';
        scope: NullabilityParquetRequest['scope'];
        carrier: NullabilityParquetRequest['carrier'];
        idealPath: string;
        nativePath: '/schema/1/repetition_type';
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
export declare function projectNullabilityToParquet(input: CoreNullabilityDeclaration, options: NullabilityParquetRequest): NullabilityParquetProjection & {
    diagnostics: Diagnostic[];
};
/** Recover retained author meaning only when the receipt and supplied native target still agree. */
export declare function recoverNullabilityFromParquet(input: NullabilityParquetProjection, nativeBytes: Uint8Array): Document;
