import { Registry } from '../../registry/registry';
import { type Document, type Diagnostic, type ExtensionPackage } from '../../model/types';
import { type NativeJson } from '../../model/native-json';
export declare const OPENAPI_EXTENSION = "umf.openapi";
export declare const openapiPackage: ExtensionPackage;
export interface OpenapiResource {
    uri: string;
    root: NativeJson;
    originalSource: string;
    originalFormat: 'json' | 'yaml';
}
export interface OpenapiPayload {
    baseUri?: string;
    resources?: OpenapiResource[];
    profile: 'openapi-json-yaml-0.1';
    root: NativeJson;
    originalSource: string;
    originalFormat: 'json' | 'yaml';
}
export declare function openapiRegistry(): Registry;
export declare function inspectOpenapi(document: Document): import("../..").Validation;
export declare function importOpenapiDocument(text: string, options: {
    id: string;
    format: 'json' | 'yaml';
    baseUri?: string;
    resources?: {
        uri: string;
        text: string;
        format: 'json' | 'yaml';
    }[];
}): Document;
export declare function exportOpenapiDocument(document: Document, format?: 'json' | 'yaml'): string;
export declare function getOpenapiNode(document: Document, path: string, resourceUri?: string): NativeJson;
/** Literal URI + JSON Pointer lookup only; not an OpenAPI/JSON Schema scope resolver. */
export declare function lookupOpenapiResource(document: Document, reference: string, fromUri?: string): {
    uri: string;
    pointer: string;
    node: NativeJson;
    interpretation: 'literal-document-pointer-only';
};
export declare function proposeOpenapiEdit(document: Document, path: string, json: string, resourceUri?: string): {
    document: Document;
    validation: import("../..").Validation;
};
export declare function exportOpenapiBundle(document: Document): {
    schema: string;
    format: "json" | "yaml";
    baseUri?: string;
    resources: {
        uri: string;
        text: string;
        format: "json" | "yaml";
    }[];
    source: Document;
    diagnostics: Diagnostic[];
};
