import { type NativeJson } from '../../model/native-json';
import { type Document } from '../../model/types';
export interface OpenapiSchemaExtraction {
    source: Document;
    pointer: string;
    retrievalUri?: string;
    openapiVersion: string;
    dialect: string;
    dialectOrigin: 'schema' | 'document' | 'openapi-default';
    schema: NativeJson;
    nativeSchema: string;
    complete: false;
    limitations: string[];
}
/** Extract one declared Schema Object while retaining its entire owning context. */
export declare function extractOpenapiSchema(document: Document, input: {
    pointer: string;
    resourceUri?: string;
}): OpenapiSchemaExtraction;
