import { type Document, type Json, type Diagnostic } from '../model/types';
import { type CoreRelationshipDeclaration, type CoreRelationshipIdentity } from '../model/relationships';
import type { RelationshipEndpoint } from '../validation/relationships';
export { default as relationshipSqlServerProjectionSchema } from '../../spec/core/relationship-sqlserver-projection.schema.json';
export interface SqlServerRelationshipKey {
    keyId: string;
    constraintName: string;
    columns: {
        field: RelationshipEndpoint;
        name: string;
        nativeType: 'bit' | 'tinyint' | 'smallint' | 'int' | 'bigint';
    }[];
}
export interface RelationshipSqlServerRequest {
    id: string;
    relationship: CoreRelationshipIdentity;
    profile: 'new-key-tables';
    mode: 'strict' | 'report';
    namespace: string;
    sourceKey: SqlServerRelationshipKey;
    targetKey: SqlServerRelationshipKey;
    referenceColumns: string[];
    constraintName: string;
    deleteAction: 'NO_ACTION' | 'CASCADE' | 'SET_NULL';
    updateAction: 'NO_ACTION' | 'CASCADE' | 'SET_NULL';
    junction?: {
        tableName: string;
        sourceColumns: string[];
        sourceConstraintName: string;
        pairConstraintName: string;
    };
}
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
};
export interface RelationshipSqlServerProjection {
    operation: 'project-relationship-sqlserver';
    version: '1.0.0';
    status: 'projected' | 'blocked';
    source: Document;
    author: CoreRelationshipDeclaration;
    bindingSource: Document;
    request: RelationshipSqlServerRequest;
    binding: typeof binding;
    target?: {
        format: 'sqlserver-ddl';
        sql: string;
    };
    mappings: {
        idealPath: string;
        nativePath: string;
        storage: 'foreign_key' | 'junction';
        targetKey: string;
        sourceKey: string;
        enforcement: 'enabled-trusted-stored-values';
        outcome: 'approximated';
    }[];
    residuals: {
        path: string;
        value: Json;
        reason: string;
        outcome: 'unknown' | 'not-expressible' | 'approximated';
        recovery: string;
    }[];
    diagnostics: Diagnostic[];
}
/** New endpoint-key tables plus declared FK/junction; never mutates existing tables. */
export declare function projectRelationshipToSqlServer(input: Document, authorInput: CoreRelationshipDeclaration, bindingInput: Document, options: RelationshipSqlServerRequest): RelationshipSqlServerProjection;
export declare function verifyRelationshipSqlServerProjection(input: RelationshipSqlServerProjection, current: {
    format: 'sqlserver-ddl';
    sql: string;
}): RelationshipSqlServerProjection;
export declare function recoverRelationshipSqlServerIdeal(input: RelationshipSqlServerProjection, current: {
    format: 'sqlserver-ddl';
    sql: string;
}): Document;
export declare function recoverRelationshipSqlServerBinding(input: RelationshipSqlServerProjection, current: {
    format: 'sqlserver-ddl';
    sql: string;
}): Document;
export declare function recoverRelationshipSqlServerNative(input: RelationshipSqlServerProjection, current: {
    format: 'sqlserver-ddl';
    sql: string;
}): string;
