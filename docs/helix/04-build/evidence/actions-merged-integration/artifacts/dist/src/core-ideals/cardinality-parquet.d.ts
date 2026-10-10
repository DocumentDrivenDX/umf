import { type Document, type Json, type Diagnostic, type Cardinality, type ExtensionPackage } from '../model/types';
import { type ParquetCardinalityNode } from './parquet-cardinality-shape';
export declare const PARQUET_CARDINALITY_EXTENSION = "umf.parquet.cardinality";
export declare const parquetCardinalityPackage: ExtensionPackage;
export { default as parquetCardinalityClassificationSchema } from '../../spec/core/parquet-cardinality-classification.schema.json';
export interface ParquetCardinalityRequest {
    index: number;
    identity: {
        module: string;
        element: string;
    };
    profile: 'present-value-schema' | 'unresolved';
    mode: 'strict' | 'report';
}
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
}, basis: string;
declare const recovery: 'Retain original native archive and author assertions; classification does not replace native meaning';
type Node = ParquetCardinalityNode & {
    identity: {
        module: string;
        element: string;
    };
};
export interface ParquetCardinalityClassification {
    operation: 'classify-parquet-cardinality';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    source: Document;
    target?: Document;
    request: ParquetCardinalityRequest;
    binding: typeof binding;
    mapping: {
        origin: 'classified';
        cardinality: Cardinality;
        outcome: 'exact' | 'approximated' | 'unknown';
        basis: typeof basis;
        nodes: Node[];
    };
    residuals: {
        path: string;
        value: Json;
        reason: string;
        recovery: typeof recovery;
    }[];
    diagnostics: Diagnostic[];
}
/** Publish logical Fields while retaining the physical archive and all existing meaning. */
export declare function classifyParquetCardinality(input: Document, options: ParquetCardinalityRequest): ParquetCardinalityClassification;
/** Recompute consistency; this is not receipt authentication. */
export declare function verifyParquetCardinalityClassification(input: ParquetCardinalityClassification, current: Document): ParquetCardinalityClassification & {
    [x: string]: {};
};
export declare function recoverParquetCardinalityBytes(input: ParquetCardinalityClassification, current: Document): Uint8Array<ArrayBufferLike>;
