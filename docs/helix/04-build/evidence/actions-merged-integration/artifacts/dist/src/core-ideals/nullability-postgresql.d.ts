import { type Document, type Json, type Diagnostic, type Nullability, type ExtensionPackage } from '../model/types';
import { type NativeJson } from '../model/native-json';
import { type CoreNullabilityDeclaration } from '../model/nullability';
export declare const POSTGRESQL_NULLABILITY_EXTENSION = "umf.postgresql.nullability";
export declare const postgresqlNullabilityPackage: ExtensionPackage;
export { default as postgresqlNullabilityClassificationSchema } from '../../spec/core/postgresql-nullability-classification.schema.json';
export interface PostgresqlNullabilityRequest {
    column: string;
    nativeSource: string;
    mode: 'strict' | 'report';
    scope: 'stored-relation' | 'query-result' | 'write-input' | 'unresolved';
    carrier: 'sql-null' | 'unresolved';
    author?: CoreNullabilityDeclaration;
}
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
};
declare const recovery: 'Retain the complete source and native archive; unknown native meaning is not replaced by the core label';
export interface PostgresqlNullabilityClassification {
    operation: 'classify-postgresql-nullability';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    source: Document;
    target?: Document;
    request: PostgresqlNullabilityRequest;
    binding: typeof binding;
    mapping: {
        origin: 'classified';
        idealPath: string;
        nativePath: string;
        nativeFragment: NativeJson;
        nullability: Nullability;
        interpretation: 'declared' | 'unknown' | 'unsupported';
        outcome: 'exact' | 'unknown' | 'not-expressible';
        scope: PostgresqlNullabilityRequest['scope'];
        carrier: PostgresqlNullabilityRequest['carrier'];
        basis: 'Captured declarations for stored relation values; not query results, omitted inputs or live enforcement verification';
    };
    residuals: {
        path: string;
        value: Json;
        reason: string;
        recovery: typeof recovery;
    }[];
    diagnostics: Diagnostic[];
}
/** Native absence is classified only for explicitly scoped stored-relation declarations. */
export declare function classifyPostgresqlNullability(input: Document, options: PostgresqlNullabilityRequest): PostgresqlNullabilityClassification;
/** Receipt consistency is not authentication; any model edit requires reclassification. */
export declare function verifyPostgresqlNullabilityClassification(input: PostgresqlNullabilityClassification, current: Document): PostgresqlNullabilityClassification;
/** Recover exact original capture text, including unclaimed native content. */
export declare function recoverPostgresqlNullabilitySource(input: PostgresqlNullabilityClassification, current: Document): string;
