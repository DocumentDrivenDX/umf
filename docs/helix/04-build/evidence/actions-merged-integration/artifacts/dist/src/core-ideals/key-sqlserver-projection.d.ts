import { type Document, type Json, type Diagnostic } from '../model/types';
import { type CoreKeyDeclaration, type CoreRecordIdentity } from '../model/keys';
import { sqlServerKeyCarriers as carriers, sqlServerKeySessionOptions } from './key-sqlserver-carriers';
export { default as keySqlServerProjectionSchema } from '../../spec/core/key-sqlserver-projection.schema.json';
export interface KeySqlServerRequest {
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
        nativeSize?: number;
        encoding?: {
            bytesColumn: string;
            lengthColumn: string;
        };
    }[];
}
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
};
declare const recovery: 'Recover authored source from retained receipt; native import alone does not recover authored identity';
export interface KeySqlServerProjection {
    operation: 'project-keys-sqlserver';
    version: '1.0.0';
    status: 'projected' | 'blocked';
    source: Document;
    authors: CoreKeyDeclaration[];
    request: KeySqlServerRequest;
    binding: typeof binding;
    requiredSessionOptions: typeof sqlServerKeySessionOptions;
    target?: {
        format: 'sqlserver-ddl';
        sql: string;
    };
    nativeSql?: string;
    mappings: {
        keyId: string;
        keyName: string;
        idealPath: string;
        nativePath: string;
        columns: string[];
        nativeColumns: string[];
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
export declare function projectKeysToSqlServer(input: Document, authorInput: CoreKeyDeclaration[], options: KeySqlServerRequest): KeySqlServerProjection;
/** Recompute projection and match current native representation; not source authentication. */
export declare function verifyKeysSqlServerProjection(input: KeySqlServerProjection, current: {
    format: 'sqlserver-ddl';
    sql: string;
}): KeySqlServerProjection;
export declare function recoverKeysSqlServerIdeal(input: KeySqlServerProjection, current: {
    format: 'sqlserver-ddl';
    sql: string;
}): Document;
