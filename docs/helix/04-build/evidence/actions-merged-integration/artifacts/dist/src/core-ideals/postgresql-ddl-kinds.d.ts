import { type Document, type Json, type Diagnostic } from '../model/types';
import { type PostgresqlBackend } from '../adapters/postgresql';
export { default as postgresqlDdlKindsSchema } from '../../spec/core/postgresql-ddl-kinds.schema.json';
export interface PostgresqlDdlKindRequest {
    module: string;
    recordId: string;
    declaration: string;
    mode: 'strict' | 'report';
}
declare const binding: {
    readonly id: 'umf.postgresql.ddl.record';
    readonly version: '1.0.0';
    readonly nativeVersion: '17.4';
    readonly subset: 'Explicit CREATE TABLE declaration only; no catalog expansion or statement replay';
};
declare const compositeBinding: {
    readonly id: 'umf.postgresql.ddl.composite';
    readonly version: '1.0.0';
    readonly nativeVersion: '17.4';
    readonly subset: 'Explicit CREATE TYPE AS composite attributes only; no type resolution or statement replay';
};
export interface PostgresqlDdlKinds {
    operation: 'classify-postgresql-ddl-record';
    version: '1.0.0';
    scope: 'declared-only';
    status: 'classified' | 'blocked';
    source: Document;
    target?: Document;
    request: PostgresqlDdlKindRequest;
    binding: typeof binding | typeof compositeBinding;
    namespaceResolution: 'explicit' | 'create-schema-context' | 'unresolved';
    mappings: {
        origin: 'classified';
        kind: 'field' | 'record';
        idealPath: string;
        nativePath: string;
        nativeFragment: Json;
        basis: 'checked-raw-column-declaration' | 'checked-raw-table-declaration' | 'checked-raw-composite-declaration';
        outcome: 'exact' | 'unknown';
    }[];
    residuals: {
        path: string;
        value: Json;
        reason: string;
        recovery: 'Source and native fragments retained; resolve conflict then recompute whole record classification';
    }[];
    diagnostics: Diagnostic[];
}
export declare function classifyPostgresqlDdlRecord(input: Document, options: PostgresqlDdlKindRequest, backend: PostgresqlBackend): Promise<PostgresqlDdlKinds>;
export declare function recoverPostgresqlDdlKinds(input: PostgresqlDdlKinds, current: Document, backend: PostgresqlBackend): Promise<string>;
