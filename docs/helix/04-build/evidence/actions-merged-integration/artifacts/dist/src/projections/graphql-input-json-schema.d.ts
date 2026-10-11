import { type Document } from '../model/types';
import type { ProjectionIssue } from './json-schema-protobuf';
export interface GraphqlInputBindings {
    id: string;
    schemaId: string;
    inputType: string;
    list: 'array-only';
    idEncoding: 'string-or-integer';
    lossPolicy: 'strict' | 'allow-reported-loss';
}
export interface GraphqlInputProjection {
    status: 'blocked' | 'projected';
    source: Document;
    policy: GraphqlInputBindings;
    issues: ProjectionIssue[];
    mappings: {
        name: string;
        targetPointer: string;
    }[];
    target?: Document;
    nativeSchema?: string;
}
export declare function projectGraphqlInputToJsonSchema(source: Document, input: GraphqlInputBindings): GraphqlInputProjection;
