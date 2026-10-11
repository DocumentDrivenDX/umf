import { type Document } from '../model/types';
import type { ProjectionIssue } from './json-schema-protobuf';
export type TableSpecAvroRepresentation = 'string' | 'int32' | 'int64' | 'float32' | 'float64' | 'boolean' | 'decimal' | 'date' | 'timestamp-micros' | 'local-timestamp-micros' | 'embedding-float32';
export interface TableSpecAvroPolicy {
    id: string;
    recordName: string;
    namespace: string;
    context?: string;
    fields: Record<string, {
        name: string;
        representation: TableSpecAvroRepresentation;
        nullable: 'source' | boolean;
        itemsNullable?: boolean;
    }>;
    lossPolicy: 'strict' | 'allow-reported-loss';
}
export interface TableSpecAvroProjection {
    status: 'blocked' | 'projected';
    source: Document;
    policy: TableSpecAvroPolicy;
    issues: ProjectionIssue[];
    mappings: {
        index: number;
        column: string;
        field: string;
        representation: TableSpecAvroRepresentation;
        nullable: boolean;
    }[];
    target?: Document;
    nativeSchema?: string;
}
export declare function projectTableSpecToAvro(source: Document, input: TableSpecAvroPolicy): TableSpecAvroProjection;
