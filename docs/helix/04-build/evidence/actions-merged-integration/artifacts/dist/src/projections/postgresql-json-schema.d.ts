import { type Document } from '../model/types';
import type { ProjectionIssue } from './json-schema-protobuf';
export interface PostgresqlRowPolicy {
    id: string;
    schemaId: string;
    relation: {
        schema: string;
        name: string;
    };
    columns: Record<string, 'sql-text' | 'json-boolean' | 'json-int32' | 'json-value'>;
    lossPolicy: 'strict' | 'allow-reported-loss';
}
export interface PostgresqlRowProjection {
    status: 'blocked' | 'projected';
    complete: false;
    source: Document;
    policy: PostgresqlRowPolicy;
    issues: ProjectionIssue[];
    mappings: {
        column: string;
        nativeType: string;
        encoding: string;
        targetPointer: string;
    }[];
    target?: Document;
    nativeSchema?: string;
    sql?: string;
}
/** Read-row encoding contract; never an INSERT validator or automatic migration. */
export declare function projectPostgresqlRowToJsonSchema(source: Document, input: PostgresqlRowPolicy): PostgresqlRowProjection;
