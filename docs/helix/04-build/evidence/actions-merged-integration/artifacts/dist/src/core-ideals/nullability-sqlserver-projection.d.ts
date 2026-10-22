import { type Document, type Json, type Diagnostic } from '../model/types';
import { type CoreNullabilityDeclaration } from '../model/nullability';
export { default as nullabilitySqlServerProjectionSchema } from '../../spec/core/nullability-sqlserver-projection.schema.json';
import { sqlServerCarriers as carriers } from './sqlserver-syntax';
export interface NullabilitySqlServerRequest {
    id: string;
    namespace: string;
    tableName: string;
    columnName: string;
    nativeType: keyof typeof carriers;
    mode: 'strict' | 'report';
    scope: 'stored-relation' | 'query-result' | 'write-input' | 'unresolved';
    carrier: 'sql-null' | 'unresolved';
}
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
};
export interface NullabilitySqlServerProjection {
    operation: 'project-nullability-sqlserver';
    version: '1.0.0';
    status: 'projected' | 'blocked';
    source: Document;
    author: CoreNullabilityDeclaration;
    request: NullabilitySqlServerRequest;
    target?: {
        format: 'sqlserver-ddl';
        sql: string;
    };
    nativeSql?: string;
    diagnostics: Diagnostic[];
    binding: typeof binding;
    mapping: {
        origin: 'authored';
        nullability: 'required' | 'absent-allowed' | 'unspecified';
        encoding: 'not-null' | 'null';
        basis: 'authored-requirement' | 'no-authored-requirement' | 'unprojected-requirement';
        scope: NullabilitySqlServerRequest['scope'];
        carrier: NullabilitySqlServerRequest['carrier'];
        idealPath: string;
        nativePath: '/sql';
        outcome: 'exact' | 'unknown' | 'not-expressible';
    };
    residuals: {
        path: string;
        value: Json;
        reason: string;
        outcome: 'unknown' | 'not-expressible';
        recovery: 'Recover source meaning with retained projection receipt; native-only import does not recover author intent';
    }[];
}
export declare function projectNullabilityToSqlServer(input: CoreNullabilityDeclaration, options: NullabilitySqlServerRequest): NullabilitySqlServerProjection;
/** Recover retained author meaning only when the receipt and supplied native target still agree. */
export declare function recoverNullabilityFromSqlServer(input: NullabilitySqlServerProjection, nativeText: string): Document;
