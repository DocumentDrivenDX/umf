import { type Document } from '../model/types';
import type { ProjectionIssue } from './json-schema-protobuf';
export interface OpenapiJsonSchemaPolicy {
    id: string;
    schemaId: string;
    pointer: string;
    resourceUri?: string;
    schemaResources?: string[];
    usage: 'schema-only';
    lossPolicy: 'strict' | 'allow-reported-loss';
}
export interface OpenapiJsonSchemaProjection {
    status: 'blocked' | 'projected';
    source: Document;
    policy: OpenapiJsonSchemaPolicy;
    issues: ProjectionIssue[];
    mappings: {
        retrievalUri: string;
        sourcePointer: string;
        targetPointer: string;
    }[];
    target?: Document;
    nativeSchema?: string;
}
/** Project static JSON instance constraints with explicit API/annotation losses. */
export declare function projectOpenapiToJsonSchema(source: Document, input: OpenapiJsonSchemaPolicy): OpenapiJsonSchemaProjection;
