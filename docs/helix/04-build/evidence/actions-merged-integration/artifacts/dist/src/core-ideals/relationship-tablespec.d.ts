import { type Document, type Json, type Diagnostic, type ExtensionPackage } from '../model/types';
import type { NativeJson } from '../model/native-json';
export declare const TABLESPEC_RELATIONSHIPS_EXTENSION = "umf.tablespec.relationships";
export declare const tableSpecRelationshipsPackage: ExtensionPackage;
export { default as tableSpecRelationshipClassificationSchema } from '../../spec/core/tablespec-relationship-classification.schema.json';
export interface TableSpecRelationshipRequest {
    mode: 'strict' | 'report';
    profile: 'declared-metadata';
}
export interface TableSpecRelationshipObservation {
    nativePath: string;
    carrier: 'foreign_keys' | 'outgoing' | 'referenced_by' | 'incoming' | 'unknown';
    state: 'declared' | 'invalid' | 'unknown';
    native: NativeJson;
    sourceColumn: string | null;
    targetTable: string | null;
    targetColumn: string | null;
    resolvedSource: {
        module: string;
        element: string;
    } | null;
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
declare const recovery: 'Original native archive retained; no authored relationship inferred';
export interface TableSpecRelationshipClassification {
    operation: 'classify-tablespec-relationships';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    outcome: 'exact' | 'unknown' | 'not-expressible';
    source: Document;
    target?: Document;
    request: TableSpecRelationshipRequest;
    binding: typeof binding;
    observations: TableSpecRelationshipObservation[];
    residuals: {
        path: string;
        value: Json;
        outcome: 'unknown' | 'not-expressible';
        reason: string;
        recovery: typeof recovery;
    }[];
    diagnostics: Diagnostic[];
}
/** Observe native declarations without upgrading the envelope or creating authored relationships. */
export declare function classifyTableSpecRelationships(input: Document, options: TableSpecRelationshipRequest): TableSpecRelationshipClassification;
/** Check retained input consistency, not authenticity or runtime enforcement. */
export declare function verifyTableSpecRelationshipClassification(input: TableSpecRelationshipClassification, current: Document): TableSpecRelationshipClassification;
export declare function recoverTableSpecRelationshipSource(input: TableSpecRelationshipClassification, current: Document): string | Record<string, string>;
