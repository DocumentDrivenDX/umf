import { type Document, type Json, type Diagnostic, type Nullability, type ExtensionPackage } from '../model/types';
import { type NativeJson } from '../model/native-json';
import { type CoreNullabilityDeclaration } from '../model/nullability';
export { default as sqlserverNullabilityEvidenceSchema } from '../../spec/extensions/sqlserver-nullability/native.schema.json';
export declare const SQLSERVER_NULLABILITY_EXTENSION = "umf.sqlserver.nullability";
export declare const sqlserverNullabilityPackage: ExtensionPackage;
export { default as sqlserverNullabilityClassificationSchema } from '../../spec/core/sqlserver-nullability-classification.schema.json';
export interface SqlServerNullabilityRequest {
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
export interface SqlServerNullabilityClassification {
    operation: 'classify-sqlserver-nullability';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    source: Document;
    target?: Document;
    request: SqlServerNullabilityRequest;
    binding: typeof binding;
    mapping: {
        origin: 'classified';
        idealPath: string;
        nativePath: string;
        nativeFragment: NativeJson;
        nullability: Nullability;
        interpretation: 'declared' | 'unknown' | 'unsupported';
        outcome: 'exact' | 'unknown' | 'not-expressible';
        scope: SqlServerNullabilityRequest['scope'];
        carrier: SqlServerNullabilityRequest['carrier'];
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
export declare function classifySqlServerNullability(input: Document, options: SqlServerNullabilityRequest): SqlServerNullabilityClassification;
/** Receipt consistency is not authentication; any model edit requires reclassification. */
export declare function verifySqlServerNullabilityClassification(input: SqlServerNullabilityClassification, current: Document): SqlServerNullabilityClassification;
/** Recover exact original capture text, including unclaimed native content. */
export declare function recoverSqlServerNullabilitySource(input: SqlServerNullabilityClassification, current: Document): string;
