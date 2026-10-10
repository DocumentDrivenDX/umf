import { type Document, type Json, type Diagnostic, type ExtensionPackage } from '../model/types';
export declare const SQLSERVER_KEYS_EXTENSION = "umf.sqlserver.keys";
export declare const sqlserverKeysPackage: ExtensionPackage;
export { default as sqlserverKeyClassificationSchema } from '../../spec/core/sqlserver-key-classification.schema.json';
export interface SqlServerKeyRequest {
    nativeSource: string;
    mode: 'strict' | 'report';
    profile: 'captured-stored-values';
}
export interface SqlServerKeyObservation {
    identity: {
        schema: string;
        table: string;
        indexId: number;
        name: string | null;
    };
    nativePath: string;
    fields: {
        module: string;
        element: string;
    }[];
    primary: boolean;
    enforcement: 'immediate-unique-nonnull' | 'conditional' | 'nullable' | 'not-unique' | 'unavailable' | 'unknown';
    equality: 'exact-on-representable-values' | 'incompatible' | 'unknown';
    ignoreDuplicateKey: boolean;
    authorIntent: 'unknown';
    provenance: 'inferred';
    scope: 'captured-table-stored-values';
    reasons: string[];
}
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
}, recovery: 'Original native catalog retained; authored key intent is not inferred';
export interface SqlServerKeyClassification {
    operation: 'classify-sqlserver-keys';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    outcome: 'exact' | 'unknown' | 'not-expressible';
    source: Document;
    target?: Document;
    request: SqlServerKeyRequest;
    binding: typeof binding;
    observations: SqlServerKeyObservation[];
    residuals: {
        path: string;
        value: Json;
        outcome: 'unknown' | 'not-expressible';
        reason: string;
        recovery: typeof recovery;
    }[];
    diagnostics: Diagnostic[];
}
/** Captured facts are observations, not authenticated state or authored identity. */
export declare function classifySqlServerKeys(input: Document, options: SqlServerKeyRequest): SqlServerKeyClassification;
export declare function verifySqlServerKeyClassification(input: SqlServerKeyClassification, current: Document): SqlServerKeyClassification;
export declare function recoverSqlServerKeySource(input: SqlServerKeyClassification, current: Document): string;
