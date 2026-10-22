import { type Document } from '../model/types';
import type { ProjectionIssue } from './json-schema-protobuf';
export interface AvroDocumentBindings {
    id: string;
    schemaId: string;
    long: 'decimal-string';
    bytes: 'hex-string';
    union: 'untagged';
    lossPolicy: 'strict' | 'allow-reported-loss';
}
export interface AvroDocumentProjection {
    status: 'blocked' | 'projected';
    source: Document;
    policy: AvroDocumentBindings;
    issues: ProjectionIssue[];
    mappings: {
        name: string;
        sourcePath: string;
        targetPointer: string;
    }[];
    target?: Document;
    nativeSchema?: string;
}
/** Projects schema shapes; instance encoding is an explicit caller responsibility. */
export declare function projectAvroToJsonSchema(source: Document, input: AvroDocumentBindings): AvroDocumentProjection;
