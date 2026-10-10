import { type Document } from '../../model/types';
import { type PostgresqlBackend } from '../../adapters/postgresql';
import { type DddPostgresqlTablePolicy, type DddPostgresqlTableProjection } from './tables';
/** Relationship-independent stage of CONTRACT-043: DDD tables followed by physical indexes. */
export declare function projectDddTablesAndIndexesToPostgresql(logical: Document, binding: Document, backend: PostgresqlBackend, policy: DddPostgresqlTablePolicy, lossPolicy: 'strict' | 'report'): Promise<DddPostgresqlTableProjection>;
