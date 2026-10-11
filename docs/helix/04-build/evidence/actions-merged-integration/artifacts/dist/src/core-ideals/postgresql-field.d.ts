import { type Document, type Json, type Diagnostic } from '../model/types';
import { type CoreKindDeclaration } from '../model/field-kind';
export { default as postgresqlFieldClassificationSchema } from '../../spec/core/postgresql-field-classification.schema.json';
export interface PostgresqlFieldRequest {
    column: string;
    nativeSource: string;
    mode: 'strict' | 'report';
    author?: CoreKindDeclaration;
}
declare const binding: {
    readonly id: 'umf.postgresql.catalog.field';
    readonly version: '1.0.0';
    readonly nativeVersion: '17.4';
    readonly subset: 'Captured catalog column membership; excludes raw DDL and native constraint/value equivalence';
};
export interface PostgresqlFieldClassification {
    operation: 'classify-postgresql-field';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    source: Document;
    target?: Document;
    request: PostgresqlFieldRequest;
    binding: typeof binding;
    mapping: {
        origin: 'classified';
        kind: 'field';
        idealPath: string;
        nativePath: string;
        nativeFragment: Json;
        basis: 'checked-catalog-column-membership';
        outcome: 'exact' | 'unknown';
    };
    residuals: {
        path: string;
        value: Json;
        reason: string;
        recovery: 'Original assertion and native fragment retained in source; reclassify with corrected provenance';
    }[];
    diagnostics: Diagnostic[];
}
/** Native paths are JSON pointers into the retained capture text, not pointers into the tagged UMF encoding. */
export declare function classifyPostgresqlField(input: Document, options: PostgresqlFieldRequest): PostgresqlFieldClassification;
export declare function recoverPostgresqlFieldCapture(input: PostgresqlFieldClassification, current: Document): string;
