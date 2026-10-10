import { type Document, type Json, type Diagnostic } from '../../model/types';
import { type SqlServerPartitionFamily } from './tables';
import { type SqlServerRelationshipLayoutPolicy } from './relationship-layout';
export { default as sqlserverPhysicalBindingSchema } from '../../../spec/projections/sqlserver-physical-binding.schema.json';
export interface SqlServerPhysicalPolicy {
    layout: SqlServerRelationshipLayoutPolicy;
    partitionFamilies: SqlServerPartitionFamily[];
}
export interface SqlServerPhysicalProjection {
    operation: 'project-binding-sqlserver';
    version: '1.0.0';
    status: 'reported' | 'blocked';
    logical: Document;
    binding: Document;
    policy: SqlServerPhysicalPolicy;
    lossPolicy: 'strict' | 'report';
    nativeSource?: string;
    nativeArchive?: Document;
    candidate?: string;
    residuals: {
        source: 'logical' | 'binding' | 'policy' | 'native';
        path: string;
        reason: string;
        value: Json;
    }[];
    mappings: {
        sourcePath: string;
        target: string;
        kind: 'table' | 'column' | 'key' | 'relationship' | 'index';
        outcome: 'approximated' | 'unknown';
    }[];
    diagnostics: Diagnostic[];
}
/** Compose complete qualified table, Key, relationship and index DDL without executing it. */
export declare function projectBindingToSqlServer(logicalInput: Document, bindingInput: Document, policyInput: SqlServerPhysicalPolicy, lossPolicy: 'strict' | 'report', nativeSource?: string): SqlServerPhysicalProjection;
export declare function verifyBindingSqlServerProjection(input: SqlServerPhysicalProjection, current: string): SqlServerPhysicalProjection & {
    [x: string]: {};
};
export declare function recoverBindingSqlServerSources(input: SqlServerPhysicalProjection, current: string): {
    logical: Document;
    binding: Document;
    policy: SqlServerPhysicalPolicy;
};
export declare function recoverBindingSqlServerNative(input: SqlServerPhysicalProjection, current: string): {
    sql: string;
    catalog?: string;
};
