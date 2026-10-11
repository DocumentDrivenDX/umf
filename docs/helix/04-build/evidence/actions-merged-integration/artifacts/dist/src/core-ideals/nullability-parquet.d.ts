import { type Document, type Json, type Diagnostic, type Nullability, type ExtensionPackage } from '../model/types';
import { type CoreNullabilityDeclaration } from '../model/nullability';
export declare const PARQUET_NULLABILITY_EXTENSION = "umf.parquet.nullability";
export declare const parquetNullabilityPackage: ExtensionPackage;
export { default as parquetNullabilityClassificationSchema } from '../../spec/core/parquet-nullability-classification.schema.json';
export interface ParquetNullabilityRequest {
    index: number;
    mode: 'strict' | 'report';
    scope: 'row-leaf-value' | 'repeated-element-value' | 'write-input' | 'unresolved';
    carrier: 'definition-level' | 'unresolved';
    author?: CoreNullabilityDeclaration;
}
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
};
declare const recovery: 'Retain the complete source and native archive; unknown native meaning is not replaced by the core label';
export interface ParquetNullabilityClassification {
    operation: 'classify-parquet-nullability';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    source: Document;
    target?: Document;
    request: ParquetNullabilityRequest;
    binding: typeof binding;
    mapping: {
        origin: 'classified';
        idealPath: string;
        nativePath: string;
        nativeFragment: Json;
        ancestry: {
            index: number;
            repetition: 'required' | 'optional' | 'repeated';
            definitionLevel: number;
            repetitionLevel: number;
        }[];
        contextIndex: number | null;
        absencePaths: string[];
        nullability: Nullability;
        interpretation: 'declared' | 'unknown' | 'unsupported';
        outcome: 'exact' | 'unknown' | 'not-expressible';
        scope: ParquetNullabilityRequest['scope'];
        carrier: ParquetNullabilityRequest['carrier'];
        basis: 'Physical definition-level availability in the selected context; repeated cardinality, writer inputs, Arrow metadata and logical refinements remain separate';
    };
    residuals: {
        path: string;
        value: Json;
        reason: string;
        recovery: typeof recovery;
    }[];
    diagnostics: Diagnostic[];
}
export declare function classifyParquetNullability(input: Document, options: ParquetNullabilityRequest): ParquetNullabilityClassification;
/** Receipt consistency is not authentication; any model edit requires reclassification. */
export declare function verifyParquetNullabilityClassification(input: ParquetNullabilityClassification, current: Document): ParquetNullabilityClassification;
/** Recover original file bytes, including unclaimed pages and embedded metadata. */
export declare function recoverParquetNullabilityBytes(input: ParquetNullabilityClassification, current: Document): Uint8Array;
