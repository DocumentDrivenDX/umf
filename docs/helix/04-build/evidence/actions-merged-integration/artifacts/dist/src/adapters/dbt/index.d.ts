import { Registry } from '../../registry/registry';
import { type NativeJson } from '../../model/native-json';
import { type Document, type ExtensionPackage } from '../../model/types';
export declare const DBT_MANIFEST_EXTENSION = "umf.dbt.manifest";
export declare const dbtManifestPackage: ExtensionPackage;
export declare function dbtManifestRegistry(): Registry;
export declare function inspectDbtManifest(document: Document): import("../..").Validation;
export declare function importDbtManifest(text: string, options: {
    id: string;
}): Document;
export declare function exportDbtManifest(document: Document): string;
export declare function getDbtManifestNode(document: Document, path: string): NativeJson;
export declare function proposeDbtManifestNodeEdit(document: Document, path: string, text: string): {
    document: Document;
    validation: import("../..").Validation;
};
