import { type Document } from '../../model/types';
import { type SqlServerTablePolicy, type SqlServerTableProjection } from './tables';
/** Relationship-independent SQL Server table/index stage, checked against an explicit native catalog. */
export declare function projectBindingTablesAndIndexesToSqlServer(logical: Document, binding: Document, policy: SqlServerTablePolicy, nativeSource: string, lossPolicy: 'strict' | 'report'): SqlServerTableProjection;
/** Generate relationship-independent SQL Server DDL from authored inputs; catalog evidence is optional. */
export declare function projectBindingTablesAndIndexesFromPlanToSqlServer(logical: Document, binding: Document, policy: SqlServerTablePolicy, lossPolicy: 'strict' | 'report', nativeSource?: string): SqlServerTableProjection;
