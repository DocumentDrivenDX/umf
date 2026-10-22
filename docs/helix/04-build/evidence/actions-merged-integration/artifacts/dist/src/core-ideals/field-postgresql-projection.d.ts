import { type Document, type Json, type Diagnostic } from '../model/types';
import { type CoreKindDeclaration } from '../model/field-kind';
import { type PostgresqlBackend } from '../adapters/postgresql';
export { default as fieldPostgresqlProjectionSchema } from '../../spec/core/field-postgresql-projection.schema.json';
import { carriers } from './postgresql-syntax';
export interface FieldPostgresqlRequest {
    id: string;
    namespace: string;
    tableName: string;
    columnName: string;
    nativeType: keyof typeof carriers;
    mode: 'strict' | 'report';
}
declare const binding: {
    readonly id: 'umf.core.field.postgresql';
    readonly version: '1.0.0';
    readonly nativeVersion: '17.4';
    readonly subset: 'Single authored Field with explicit pg_catalog carrier; no value-domain or execution equivalence';
};
export interface FieldPostgresqlProjection {
    operation: 'project-field-postgresql';
    version: '1.0.0';
    status: 'projected' | 'blocked';
    source: Document;
    author: CoreKindDeclaration;
    request: FieldPostgresqlRequest;
    target?: Document;
    nativeSql?: string;
    diagnostics: Diagnostic[];
    binding: typeof binding;
    mapping: {
        origin: 'authored';
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
export declare function projectFieldToPostgresql(input: CoreKindDeclaration, options: FieldPostgresqlRequest, backend: PostgresqlBackend): Promise<FieldPostgresqlProjection>;
/** Recover retained author meaning only when the receipt and supplied native target still agree. */
export declare function recoverFieldFromPostgresql(input: FieldPostgresqlProjection, nativeText: string, backend: PostgresqlBackend): Promise<Document>;
