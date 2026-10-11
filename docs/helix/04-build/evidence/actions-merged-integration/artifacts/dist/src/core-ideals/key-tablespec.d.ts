import { type Document, type Json, type Diagnostic, type ExtensionPackage } from '../model/types';
export declare const TABLESPEC_KEYS_EXTENSION = "umf.tablespec.keys";
export declare const tableSpecKeysPackage: ExtensionPackage;
export { default as tableSpecKeyClassificationSchema } from '../../spec/core/tablespec-key-classification.schema.json';
export interface TableSpecKeyRequest {
    mode: 'strict' | 'report';
    profile: 'declared-metadata';
}
export interface TableSpecKeyObservation {
    nativePath: string;
    kind: 'primary' | 'alternate';
    state: 'absent' | 'empty' | 'declared' | 'invalid';
    interpretation: 'declared' | 'unknown' | 'unsupported';
    columns: string[];
    resolvedFields: {
        module: string;
        element: string;
    }[];
    enforcement: 'unknown';
    authorIntent: 'unknown';
    basis: string;
}
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
};
declare const recovery: 'Original native archive retained; no authored key inferred';
export interface TableSpecKeyClassification {
    operation: 'classify-tablespec-keys';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    outcome: 'exact' | 'unknown' | 'not-expressible';
    source: Document;
    target?: Document;
    request: TableSpecKeyRequest;
    binding: typeof binding;
    observations: TableSpecKeyObservation[];
    residuals: {
        path: string;
        value: Json;
        outcome: 'unknown' | 'not-expressible';
        reason: string;
        recovery: typeof recovery;
    }[];
    diagnostics: Diagnostic[];
}
/** Observe native declarations without upgrading the envelope or creating author keys. */
export declare function classifyTableSpecKeys(input: Document, options: TableSpecKeyRequest): TableSpecKeyClassification;
/** Check retained input consistency, not authenticity or runtime enforcement. */
export declare function verifyTableSpecKeyClassification(input: TableSpecKeyClassification, current: Document): TableSpecKeyClassification;
export declare function recoverTableSpecKeySource(input: TableSpecKeyClassification, current: Document): string | Record<string, string>;
