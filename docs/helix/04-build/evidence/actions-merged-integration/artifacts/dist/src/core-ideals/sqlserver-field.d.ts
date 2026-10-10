import { type Document, type Json, type Diagnostic } from '../model/types';
import { type CoreKindDeclaration } from '../model/field-kind';
export { default as sqlserverFieldClassificationSchema } from '../../spec/core/sqlserver-field-classification.schema.json';
export interface SqlServerFieldRequest {
    column: string;
    nativeSource: string;
    mode: 'strict' | 'report';
    author?: CoreKindDeclaration;
}
declare const binding: {
    readonly id: 'umf.sqlserver.catalog.field';
    readonly version: '1.0.0';
    readonly nativeVersion: '16.0.4295.3';
    readonly subset: 'Captured catalog column membership; excludes raw DDL and native constraint/value equivalence';
};
export interface SqlServerFieldClassification {
    operation: 'classify-sqlserver-field';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    source: Document;
    target?: Document;
    request: SqlServerFieldRequest;
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
export declare function classifySqlServerField(input: Document, options: SqlServerFieldRequest): SqlServerFieldClassification;
export declare function recoverSqlServerFieldCapture(input: SqlServerFieldClassification, current: Document): string;
