import { type Document, type Json, type Diagnostic } from '../model/types';
import { type CoreKeyDeclaration, type CoreRecordIdentity } from '../model/keys';
import { type PostgresqlBackend } from '../adapters/postgresql';
import { carriers } from './postgresql-syntax';
export { default as keyPostgresqlProjectionSchema } from '../../spec/core/key-postgresql-projection.schema.json';
export interface KeyPostgresqlRequest {
    id: string;
    record: CoreRecordIdentity;
    namespace: string;
    tableName: string;
    scope: 'new-table-stored-values';
    keyNames: {
        keyId: string;
        name: string;
    }[];
    mode: 'strict' | 'report';
    columns: {
        field: CoreRecordIdentity;
        name: string;
        nativeType: keyof typeof carriers;
    }[];
}
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
};
declare const recovery: 'Recover authored source from retained receipt; native import alone does not recover authored identity';
export interface KeyPostgresqlProjection {
    operation: 'project-keys-postgresql';
    version: '1.0.0';
    status: 'projected' | 'blocked';
    source: Document;
    authors: CoreKeyDeclaration[];
    request: KeyPostgresqlRequest;
    binding: typeof binding;
    target?: Document;
    nativeSql?: string;
    mappings: {
        keyId: string;
        keyName: string;
        idealPath: string;
        nativePath: string;
        columns: string[];
        primary: boolean;
        constraintName: string;
        origin: 'authored';
        enforcement: 'primary-key-not-null' | 'unique-not-null';
        equality: 'exact-on-representable-values' | 'unknown';
        outcome: 'not-expressible';
    }[];
    residuals: {
        path: string;
        value: Json;
        reason: string;
        outcome: 'unknown' | 'not-expressible';
        recovery: typeof recovery;
    }[];
    diagnostics: Diagnostic[];
}
/** Consume verified declarations by stable ID. Native names never supply authored identity. */
export declare function projectKeysToPostgresql(input: Document, authorInput: CoreKeyDeclaration[], options: KeyPostgresqlRequest, backend: PostgresqlBackend): Promise<KeyPostgresqlProjection>;
/** Recompute projection and match current native representation; not source authentication. */
export declare function verifyKeysPostgresqlProjection(input: KeyPostgresqlProjection, current: Document, backend: PostgresqlBackend): Promise<KeyPostgresqlProjection>;
export declare function recoverKeysPostgresqlIdeal(input: KeyPostgresqlProjection, current: Document, backend: PostgresqlBackend): Promise<Document>;
