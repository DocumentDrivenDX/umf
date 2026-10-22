import { type Document, type Json, type Diagnostic, type ExtensionPackage } from '../model/types';
export declare const PARQUET_RELATIONSHIPS_EXTENSION = "umf.parquet.relationships";
export declare const parquetRelationshipsPackage: ExtensionPackage;
export { default as parquetRelationshipClassificationSchema } from '../../spec/core/parquet-relationship-classification.schema.json';
export interface ParquetRelationshipRequest {
    mode: 'strict' | 'report';
    profile: 'file-schema';
}
export interface ParquetRelationshipObservation {
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
}, recovery: 'Original native archive retained; no authored relationship inferred';
export interface ParquetRelationshipClassification {
    operation: 'classify-parquet-relationships';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    source: Document;
    target?: Document;
    request: ParquetRelationshipRequest;
    binding: typeof binding;
    observations: ParquetRelationshipObservation[];
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
export declare function classifyParquetRelationships(input: Document, options: ParquetRelationshipRequest): ParquetRelationshipClassification;
export declare function verifyParquetRelationshipClassification(input: ParquetRelationshipClassification, current: Document): ParquetRelationshipClassification;
export declare function recoverParquetRelationshipSource(input: ParquetRelationshipClassification, current: Document): Uint8Array;
