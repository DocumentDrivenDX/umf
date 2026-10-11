import { type Document, type Json, type Diagnostic } from '../model/types';
import { type CoreNullabilityDeclaration } from '../model/nullability';
import { type PostgresqlBackend } from '../adapters/postgresql';
export { default as nullabilityPostgresqlProjectionSchema } from '../../spec/core/nullability-postgresql-projection.schema.json';
import { carriers } from './postgresql-syntax';
export interface NullabilityPostgresqlRequest {
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
export interface NullabilityPostgresqlProjection {
    operation: 'project-nullability-postgresql';
    version: '1.0.0';
    status: 'projected' | 'blocked';
    source: Document;
    author: CoreNullabilityDeclaration;
    request: NullabilityPostgresqlRequest;
    target?: Document;
    nativeSql?: string;
    diagnostics: Diagnostic[];
    binding: typeof binding;
    mapping: {
        origin: 'authored';
        nullability: 'required' | 'absent-allowed' | 'unspecified';
        encoding: 'not-null' | 'null' | 'omitted';
        scope: NullabilityPostgresqlRequest['scope'];
        carrier: NullabilityPostgresqlRequest['carrier'];
        idealPath: string;
        nativePath: '/stmts/0/stmt/CreateStmt/tableElts/0/ColumnDef';
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
export declare function projectNullabilityToPostgresql(input: CoreNullabilityDeclaration, options: NullabilityPostgresqlRequest, backend: PostgresqlBackend): Promise<NullabilityPostgresqlProjection>;
/** Recover retained author meaning only when the receipt and supplied native target still agree. */
export declare function recoverNullabilityFromPostgresql(input: NullabilityPostgresqlProjection, nativeText: string, backend: PostgresqlBackend): Promise<Document>;
