import { type DocumentNode } from 'graphql';
import { Registry } from '../../registry/registry';
import { type Document, type Diagnostic, type ExtensionPackage } from '../../model/types';
export declare const GRAPHQL_EXTENSION = "umf.graphql";
export declare const graphqlPackage: ExtensionPackage;
export interface GraphqlPayload {
    profile: 'graphql-js-17.0.2-sdl';
    mode?: 'schema' | 'fragment';
    ast: DocumentNode;
    originalSource: string;
}
export declare function graphqlRegistry(): Registry;
export declare function inspectGraphql(document: Document): import("../..").Validation;
export declare function importGraphqlSchema(text: string, options: {
    id: string;
    mode?: 'schema' | 'fragment';
}): Document;
export declare function exportGraphqlSchema(document: Document): string;
export declare function getGraphqlAst(document: Document): DocumentNode;
export declare function editGraphqlAst(document: Document, edit: (ast: DocumentNode) => DocumentNode): Document;
export declare function exportGraphqlBundle(document: Document): {
    schema: string;
    source: Document;
    diagnostics: Diagnostic[];
};
