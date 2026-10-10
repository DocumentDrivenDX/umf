import { type Document, type Diagnostic } from '../model/types';
import { type CoreKindDeclaration } from '../model/field-kind';
import { type PostgresqlBackend } from '../adapters/postgresql';
import { type FieldPostgresqlRequest, type FieldPostgresqlProjection } from './field-postgresql-projection';
export { default as recordPostgresqlProjectionSchema } from '../../spec/core/record-postgresql-projection.schema.json';
export interface RecordPostgresqlRequest {
    id: string;
    namespace: string;
    tableName: string;
    mode: 'strict' | 'report';
    fields: {
        author: CoreKindDeclaration;
        columnName: string;
        nativeType: FieldPostgresqlRequest['nativeType'];
    }[];
}
declare const binding: {
    readonly id: 'umf.core.record.postgresql';
    readonly version: '1.0.0';
    readonly nativeVersion: '17.4';
    readonly subset: 'Authored record with explicit pg_catalog field carriers; no value-domain or execution equivalence';
};
export interface RecordPostgresqlProjection {
    operation: 'project-record-postgresql';
    version: '1.0.0';
    status: 'projected' | 'blocked';
    source: Document;
    author: CoreKindDeclaration;
    request: RecordPostgresqlRequest;
    binding: typeof binding;
    target?: Document;
    nativeSql?: string;
    mappings: {
        origin: 'authored';
        kind: 'record' | 'field';
        idealPath: string;
        nativePath: string;
        outcome: 'exact' | 'unknown' | 'not-expressible';
    }[];
    residuals: FieldPostgresqlProjection['residuals'];
    diagnostics: Diagnostic[];
}
export declare function projectRecordToPostgresql(input: CoreKindDeclaration, options: RecordPostgresqlRequest, backend: PostgresqlBackend): Promise<RecordPostgresqlProjection>;
export declare function recoverRecordFromPostgresql(input: RecordPostgresqlProjection, nativeText: string, backend: PostgresqlBackend): Promise<Document>;
