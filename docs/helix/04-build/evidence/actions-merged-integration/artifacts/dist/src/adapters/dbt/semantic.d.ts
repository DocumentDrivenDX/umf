import { Registry } from '../../registry/registry';
import { type NativeJson } from '../../model/native-json';
import { type Document, type ExtensionPackage } from '../../model/types';
export declare const DBT_SEMANTIC_MANIFEST_EXTENSION = "umf.dbt.semantic";
export declare const dbtSemanticManifestPackage: ExtensionPackage;
export declare function dbtSemanticManifestRegistry(): Registry;
export declare function inspectDbtSemanticManifest(document: Document): import("../..").Validation;
export declare function importDbtSemanticManifest(text: string, options: {
    id: string;
}): Document;
export declare function exportDbtSemanticManifest(document: Document): string;
export declare function getDbtSemanticManifestNode(document: Document, path: string): NativeJson;
export declare function proposeDbtSemanticManifestNodeEdit(document: Document, path: string, text: string): {
    document: Document;
    validation: import("../..").Validation;
};
