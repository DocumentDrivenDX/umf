import { type Document } from '../model/types';
import type { ProjectionIssue } from './json-schema-protobuf';
export type AvroTableSpecRepresentation = 'string' | 'integer32' | 'float32' | 'boolean' | 'decimal' | 'date' | 'timestamp' | 'local-timestamp' | 'hex-text' | 'json-text';
export interface AvroTableSpecPolicy {
    id: string;
    tableName: string;
    fields: Record<string, {
        name: string;
        representation: AvroTableSpecRepresentation;
    }>;
    lossPolicy: 'strict' | 'allow-reported-loss';
}
export interface AvroTableSpecProjection {
    status: 'blocked' | 'projected';
    source: Document;
    policy: AvroTableSpecPolicy;
    issues: ProjectionIssue[];
    mappings: {
        sourcePath: string;
        field: string;
        column: string;
        representation: AvroTableSpecRepresentation;
        nullable: boolean;
    }[];
    target?: Document;
    nativeSchema?: string;
}
/** Root-record schema projection. Instance encoders and TableSpec pipelines remain separate. */
export declare function projectAvroToTableSpec(input: Document, options: AvroTableSpecPolicy): AvroTableSpecProjection;
