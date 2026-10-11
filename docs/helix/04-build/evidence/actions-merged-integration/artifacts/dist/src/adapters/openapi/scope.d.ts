import { type NativeJson } from '../../model/native-json';
import { type Document } from '../../model/types';
export interface OpenapiSchemaLocation {
    retrievalUri: string;
    pointer: string;
    baseUri: string;
    dialect: string;
}
export interface OpenapiSchemaIndex {
    locations: OpenapiSchemaLocation[];
    identifiers: Record<string, {
        retrievalUri: string;
        pointer: string;
    }>;
    complete: false;
    limitations: string[];
}
/** Index supplied descriptions and explicitly declared standalone schema documents. */
export declare function indexOpenapiSchemas(document: Document, input?: {
    schemaResources?: string[];
}): OpenapiSchemaIndex;
export declare function resolveOpenapiSchemaReference(document: Document, input: {
    pointer: string;
    reference: string;
    resourceUri?: string;
    schemaResources?: string[];
}): {
    source: OpenapiSchemaLocation;
    target: OpenapiSchemaLocation;
    node: NativeJson;
    complete: false;
    limitations: string[];
};
