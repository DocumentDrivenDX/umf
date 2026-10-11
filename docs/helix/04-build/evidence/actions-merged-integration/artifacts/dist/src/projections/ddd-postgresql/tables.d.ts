import { type Document } from '../../model/types';
import { type BindingFieldRef, type BindingPayload } from '../../extensions/binding';
import { type PostgresqlBackend } from '../../adapters/postgresql';
export interface DddPostgresqlFieldType extends BindingFieldRef {
    sqlType: string;
}
export interface DddPostgresqlListPartition {
    name: string;
    column: string;
    defaultTable: string;
}
export interface DddPostgresqlTablePolicy {
    fieldTypes: DddPostgresqlFieldType[];
    partitionFamilies: DddPostgresqlListPartition[];
}
export interface DddPostgresqlTableResidual {
    path: string;
    reason: string;
    choice: unknown;
}
export interface DddPostgresqlTableMapping {
    sourcePath: string;
    target: string;
}
export interface DddPostgresqlTableProjection {
    status: 'blocked' | 'reported' | 'proposed';
    logical: Document;
    binding: Document;
    policy: DddPostgresqlTablePolicy;
    target: BindingPayload['target'];
    residuals: DddPostgresqlTableResidual[];
    mappings: DddPostgresqlTableMapping[];
    candidate?: string;
    targetArchive?: Document;
}
/** Relationship-independent PostgreSQL 17 DDD table proposal checked by the native adapter. */
export declare function projectDddTablesToPostgresql(logical: Document, binding: Document, backend: PostgresqlBackend, policy: DddPostgresqlTablePolicy, lossPolicy: 'strict' | 'report'): Promise<DddPostgresqlTableProjection>;
