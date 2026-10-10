import { type Document } from '../../model/types';
import { type BindingFieldRef, type BindingPayload } from '../../extensions/binding';
export interface SqlServerFieldType extends BindingFieldRef {
    sqlType: string;
}
export interface SqlServerPartitionFamily {
    name: string;
    scheme: string;
    column: string;
}
export interface SqlServerTablePolicy {
    fieldTypes: SqlServerFieldType[];
    partitionFamilies: SqlServerPartitionFamily[];
}
export interface SqlServerTableResidual {
    path: string;
    reason: string;
    choice: unknown;
}
export interface SqlServerTableMapping {
    sourcePath: string;
    target: string;
}
export interface SqlServerTableProjection {
    status: 'blocked' | 'reported' | 'proposed';
    logical: Document;
    binding: Document;
    target: BindingPayload['target'];
    policy: SqlServerTablePolicy;
    residuals: SqlServerTableResidual[];
    mappings: SqlServerTableMapping[];
    candidate?: string;
    nativeArchive?: Document;
    nativeSource?: string;
}
/** Relationship-independent SQL Server 2022 table proposal from an authored physical binding. */
export declare function projectBindingTablesToSqlServer(logical: Document, binding: Document, policy: SqlServerTablePolicy, lossPolicy: 'strict' | 'report', nativeSource?: string): SqlServerTableProjection;
