import { type Document } from '../model/types';
import type { ProjectionIssue } from './json-schema-protobuf';
export type PostgresqlAvroRepresentation = 'value' | 'finite-decimal' | 'avro-temporal' | 'sql-text';
export interface PostgresqlAvroPolicy {
    id: string;
    recordName: string;
    namespace: string;
    table: {
        schema: string;
        name: string;
    };
    fields: Record<string, {
        name: string;
        representation: PostgresqlAvroRepresentation;
    }>;
    lossPolicy: 'strict' | 'allow-reported-loss';
}
export interface PostgresqlAvroProjection {
    status: 'blocked' | 'projected';
    source: Document;
    policy: PostgresqlAvroPolicy;
    issues: ProjectionIssue[];
    mappings: {
        sourcePath: string;
        column: string;
        field: string;
        representation: PostgresqlAvroRepresentation;
    }[];
    target?: Document;
    nativeSchema?: string;
}
/** Schema projection only. Finite/temporal bindings declare a restricted value domain. */
export declare function projectPostgresqlToAvro(source: Document, input: PostgresqlAvroPolicy): PostgresqlAvroProjection;
