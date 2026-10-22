import { type Document, type Json, type Diagnostic } from '../../model/types';
import { type PostgresqlBackend } from '../../adapters/postgresql';
import { type DddPostgresqlTablePolicy } from './tables';
import { type PostgresqlRelationshipLayoutPolicy } from './relationship-layout';
export { default as dddPostgresqlPolicySchema } from '../../../spec/projections/ddd-postgresql-policy.schema.json';
export { default as dddPostgresqlProjectionSchema } from '../../../spec/projections/ddd-postgresql-projection.schema.json';
export interface DddPostgresqlPolicy {
    profile: 'ddd-postgresql-1';
    version: '1.0.0';
    targetVersion: '17.4';
    mode: 'strict' | 'report';
    objectCheckNaming: 'ck-table-column-object-v1';
    tablePolicy: DddPostgresqlTablePolicy;
    layoutPolicy: PostgresqlRelationshipLayoutPolicy;
}
export interface DddPostgresqlProjection {
    operation: 'project-ddd-postgresql';
    version: '1.0.0';
    status: 'projected' | 'blocked';
    source: Document;
    binding: Document;
    policy: DddPostgresqlPolicy;
    nativeVersion: '17.4';
    mappings: {
        source: 'logical' | 'binding' | 'policy';
        path: string;
        statement: number;
        kind: 'schema' | 'table' | 'column' | 'embedded-check' | 'partition' | 'key' | 'relationship' | 'index';
        target: string;
        outcome: 'exact' | 'approximated';
    }[];
    residuals: {
        source: 'logical' | 'binding' | 'policy';
        path: string;
        value: Json;
        outcome: 'unknown' | 'not-expressible' | 'approximated';
        reason: string;
    }[];
    diagnostics: Diagnostic[];
    nativeSource?: string;
    targetArchive?: Document;
}
/** Whole authored graph projection; portable library never deploys or queries a database. */
export declare function projectDddToPostgresql(logicalInput: Document, bindingInput: Document, policyInput: DddPostgresqlPolicy, backend: PostgresqlBackend): Promise<DddPostgresqlProjection>;
export declare function verifyDddPostgresqlProjection(input: DddPostgresqlProjection, current: Document, backend: PostgresqlBackend): Promise<DddPostgresqlProjection>;
export declare function recoverDddPostgresqlIdeal(input: DddPostgresqlProjection, current: Document, backend: PostgresqlBackend): Promise<{
    logical: Document;
    binding: Document;
    policy: DddPostgresqlPolicy;
}>;
export declare function recoverDddPostgresqlNative(input: DddPostgresqlProjection, current: Document, backend: PostgresqlBackend): Promise<string>;
