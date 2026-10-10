import { type Document } from '../model/types';
import type { ProjectionIssue } from './json-schema-protobuf';
export interface SqlServerAvroPolicy {
    id: string;
    recordName: string;
    namespace: string;
    table: {
        schema: string;
        name: string;
    };
    fields: Record<string, {
        name: string;
        representation: 'value' | 'sql-text';
    }>;
    lossPolicy: 'strict' | 'allow-reported-loss';
}
export interface SqlServerAvroProjection {
    status: 'blocked' | 'projected';
    source: Document;
    policy: SqlServerAvroPolicy;
    issues: ProjectionIssue[];
    mappings: {
        sourcePath: string;
        column: string;
        field: string;
        representation: 'value' | 'sql-text';
    }[];
    target?: Document;
    nativeSchema?: string;
}
export declare function projectSqlServerToAvro(source: Document, input: SqlServerAvroPolicy): SqlServerAvroProjection;
