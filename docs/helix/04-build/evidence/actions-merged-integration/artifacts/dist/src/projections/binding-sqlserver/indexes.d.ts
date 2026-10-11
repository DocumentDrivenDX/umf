import { type Document } from '../../model/types';
import { type BindingPayload } from '../../extensions/binding';
export interface SqlServerBindingResidual {
    path: string;
    reason: string;
    choice: unknown;
}
export interface SqlServerIndexProjection {
    status: 'blocked' | 'reported' | 'proposed';
    logical: Document;
    binding: Document;
    nativeArchive: Document;
    nativeSource: string;
    target: BindingPayload['target'];
    residuals: SqlServerBindingResidual[];
    candidate?: string;
}
export interface SqlServerPlannedColumn {
    schema: string;
    table: string;
    column: string;
    maxLength: number;
}
export interface SqlServerPlannedIndexProjection {
    status: 'blocked' | 'reported' | 'proposed';
    logical: Document;
    binding: Document;
    target: BindingPayload['target'];
    residuals: SqlServerBindingResidual[];
    candidate?: string;
}
/** SQL Server 2022 disk-based rowstore index proposal; native server oracle proves the pinned corpus. */
export declare function projectBindingIndexesToSqlServer(logical: Document, binding: Document, nativeArchive: Document, nativeSource: string, lossPolicy: 'strict' | 'report'): SqlServerIndexProjection;
/** Render the same bounded rowstore subset from columns proved by a generated table plan. */
export declare function projectBindingIndexesAgainstSqlServerPlan(logical: Document, binding: Document, plannedColumns: SqlServerPlannedColumn[], lossPolicy: 'strict' | 'report'): SqlServerPlannedIndexProjection;
