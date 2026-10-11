import { type Document } from '../../model/types';
import { type BindingPayload } from '../../extensions/binding';
import { type PostgresqlBackend } from '../../adapters/postgresql';
export interface PostgresqlBindingResidual {
    path: string;
    reason: string;
    choice: unknown;
}
export interface PostgresqlIndexProjection {
    status: 'blocked' | 'reported' | 'proposed';
    logical: Document;
    binding: Document;
    nativeArchive: Document;
    target: BindingPayload['target'];
    residuals: PostgresqlBindingResidual[];
    /** DDL proposal verified by the pinned parser/deparser/codec; execution is a separate oracle. */
    candidate?: string;
}
/** Emit PostgreSQL 17 index DDL only against exact columns in a retained CREATE TABLE source. */
export declare function projectBindingIndexesToPostgresql(logical: Document, binding: Document, nativeArchive: Document, backend: PostgresqlBackend, lossPolicy: 'strict' | 'report'): Promise<PostgresqlIndexProjection>;
