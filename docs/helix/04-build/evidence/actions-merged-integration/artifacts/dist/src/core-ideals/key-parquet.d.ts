import { type Document, type Json, type Diagnostic, type ExtensionPackage } from '../model/types';
export declare const PARQUET_KEYS_EXTENSION = "umf.parquet.keys";
export declare const parquetKeysPackage: ExtensionPackage;
export { default as parquetKeyClassificationSchema } from '../../spec/core/parquet-key-classification.schema.json';
export interface ParquetKeyRequest {
    mode: 'strict' | 'report';
    profile: 'file-schema';
}
export interface ParquetKeyObservation {
    nativePath: string;
    index: number;
    path: string[];
    kind: 'physical-leaf' | 'physical-group';
    definitionLevel: number;
    repetitionLevel: number;
    nativeField: Json;
    enforcement: 'not-expressible';
    authorIntent: 'unknown';
    provenance: 'inferred';
    scope: 'file-schema';
}
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
}, recovery: 'Original native archive retained; no authored key inferred';
export interface ParquetKeyClassification {
    operation: 'classify-parquet-keys';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    source: Document;
    target?: Document;
    request: ParquetKeyRequest;
    binding: typeof binding;
    observations: ParquetKeyObservation[];
    residuals: {
        path: string;
        value: Json;
        outcome: 'not-expressible';
        reason: string;
        recovery: typeof recovery;
    }[];
    diagnostics: Diagnostic[];
}
/** Observe physical schema only. Sorting, field IDs, statistics and metadata never assert identity. */
export declare function classifyParquetKeys(input: Document, options: ParquetKeyRequest): ParquetKeyClassification;
export declare function verifyParquetKeyClassification(input: ParquetKeyClassification, current: Document): ParquetKeyClassification;
export declare function recoverParquetKeySource(input: ParquetKeyClassification, current: Document): Uint8Array;
