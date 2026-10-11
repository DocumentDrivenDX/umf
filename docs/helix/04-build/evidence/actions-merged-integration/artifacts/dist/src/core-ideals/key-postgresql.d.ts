import { type Document, type Json, type Diagnostic, type ExtensionPackage } from '../model/types';
import type { PostgresqlBackend } from '../adapters/postgresql';
export declare const POSTGRESQL_KEYS_EXTENSION = "umf.postgresql.keys";
export declare const postgresqlKeysPackage: ExtensionPackage;
export { default as postgresqlKeyClassificationSchema } from '../../spec/core/postgresql-key-classification.schema.json';
export interface PostgresqlKeyRequest {
    nativeSource: string;
    supplement: string;
    mode: 'strict' | 'report';
    profile: 'captured-stored-values';
}
export interface PostgresqlKeyObservation {
    identity: {
        schema: string;
        table: string;
        index: string;
    };
    nativePath: string;
    fields: {
        module: string;
        element: string;
    }[];
    primary: boolean;
    enforcement: 'immediate-unique-nonnull' | 'conditional' | 'deferred' | 'nullable' | 'not-unique' | 'unavailable' | 'unknown';
    equality: 'exact-on-representable-values' | 'incompatible' | 'unknown';
    authorIntent: 'unknown';
    provenance: 'inferred';
    scope: 'relation-with-descendants';
    reasons: string[];
}
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
}, recovery: 'Original native catalog and supplement retained; authored key intent is not inferred';
export interface PostgresqlKeyClassification {
    operation: 'classify-postgresql-keys';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    outcome: 'exact' | 'unknown' | 'not-expressible';
    source: Document;
    target?: Document;
    request: PostgresqlKeyRequest;
    binding: typeof binding;
    observations: PostgresqlKeyObservation[];
    residuals: {
        path: string;
        value: Json;
        outcome: 'unknown' | 'not-expressible';
        reason: string;
        recovery: typeof recovery;
    }[];
    diagnostics: Diagnostic[];
}
/** Observe native facts under a fixed stored-value scope, without creating authored keys. */
export declare function classifyPostgresqlKeys(input: Document, options: PostgresqlKeyRequest, backend: PostgresqlBackend): Promise<PostgresqlKeyClassification>;
export declare function verifyPostgresqlKeyClassification(input: PostgresqlKeyClassification, current: Document, backend: PostgresqlBackend): Promise<PostgresqlKeyClassification>;
export declare function recoverPostgresqlKeySource(input: PostgresqlKeyClassification, current: Document, backend: PostgresqlBackend): Promise<{
    nativeSource: string;
    supplement: string;
}>;
