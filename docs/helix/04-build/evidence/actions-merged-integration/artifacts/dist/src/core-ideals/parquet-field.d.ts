import { type Document, type Json, type Diagnostic } from '../model/types';
import { type CoreKindDeclaration } from '../model/field-kind';
export { default as parquetFieldClassificationSchema } from '../../spec/core/parquet-field-classification.schema.json';
export interface ParquetFieldRequest {
    index: number;
    mode: 'strict' | 'report';
    author?: CoreKindDeclaration;
}
declare const binding: {
    readonly id: 'umf.parquet.field';
    readonly version: '1.0.0';
    readonly nativeVersion: 'parquet-format@219e3f12a62f9476e830c21e26d030d231f7c017';
    readonly subset: 'Checked primitive schema leaves only; groups and container wrappers excluded; repetition remains native, not scalar cardinality';
};
export interface ParquetFieldClassification {
    operation: 'classify-parquet-field';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    source: Document;
    target?: Document;
    request: ParquetFieldRequest;
    binding: typeof binding;
    diagnostics: Diagnostic[];
    mapping: {
        origin: 'classified';
        kind: 'field';
        idealPath: string;
        nativePath: string;
        nativeFragment: Json;
        basis: 'checked-primitive-schema-leaf';
        outcome: 'exact' | 'unknown';
    };
    residuals: {
        path: string;
        value: Json;
        reason: string;
        recovery: 'Original assertion and native fragment retained in source; reclassify with corrected provenance';
    }[];
}
/** Classify one checked native member. Does not infer scalar family, cardinality, requiredness or author intent. */
export declare function classifyParquetField(input: Document, options: ParquetFieldRequest): ParquetFieldClassification;
/** Recompute the native basis and reject classification receipts after any target edit. */
export declare function verifyParquetFieldClassification(input: ParquetFieldClassification, current: Document): ParquetFieldClassification;
export declare function recoverParquetFieldBytes(input: ParquetFieldClassification, current: Document): Uint8Array;
