import { Registry } from '../../registry/registry';
import { type Document, type Diagnostic, type ExtensionPackage, type Validation } from '../../model/types';
import { type NativeJson } from './tree';
export { parseNativeJson, type NativeJson } from './tree';
export declare const JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema";
export declare const JSON_SCHEMA_EXTENSION = "umf.json-schema";
export declare const jsonSchemaPackage: ExtensionPackage;
export interface JsonSchemaPayload {
    dialect: typeof JSON_SCHEMA_DIALECT;
    baseUri: string;
    root: NativeJson;
    resources: Record<string, NativeJson>;
}
export interface SchemaPosition {
    pointer: string;
    node: NativeJson;
}
export declare function jsonSchemaRegistry(): Registry;
export declare function inspectJsonSchema(document: Document): Validation;
export declare function importJsonSchema(text: string, options: {
    id: string;
    baseUri: string;
    resources?: Record<string, string>;
}): Document;
export declare function exportJsonSchema(document: Document): string;
export declare function exportJsonSchemaResources(document: Document): Record<string, string>;
export declare function getJsonSchemaNode(document: Document, path: string): NativeJson;
export declare function walkJsonSchema(document: Document): SchemaPosition[];
export declare function editJsonSchemaNode(document: Document, path: string, replacement: string): Document;
/** Complete export bundle: source metadata and interpretation limits accompany native output. */
export declare function exportJsonSchemaBundle(document: Document): {
    schema: string;
    resources: Record<string, string>;
    source: Document;
    diagnostics: Diagnostic[];
};
