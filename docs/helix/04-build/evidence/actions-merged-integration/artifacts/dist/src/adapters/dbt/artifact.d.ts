import { Registry } from '../../registry/registry';
import { type NativeJson } from '../../model/native-json';
import { type Document, type ExtensionPackage } from '../../model/types';
export declare const DBT_ARTIFACT_EXTENSION = "umf.dbt.artifact";
export declare const dbtArtifactPackage: ExtensionPackage;
export declare function dbtArtifactRegistry(): Registry;
export declare function inspectDbtArtifact(document: Document): import("../..").Validation;
export declare function importDbtArtifact(text: string, options: {
    id: string;
}): Document;
export declare function exportDbtArtifact(document: Document): string;
export declare function getDbtArtifactNode(document: Document, path: string): NativeJson;
export declare function proposeDbtArtifactNodeEdit(document: Document, path: string, text: string): {
    document: Document;
    validation: import("../..").Validation;
};
