import { Registry } from '../../registry/registry';
import { type NativeJson } from '../../model/native-json';
import { type Document, type ExtensionPackage } from '../../model/types';
export declare const ODCS_EXTENSION = "umf.odcs";
export declare const odcsPackage: ExtensionPackage;
export declare function odcsRegistry(): Registry;
export declare function inspectOdcsDocument(document: Document): import("../..").Validation;
export declare function importOdcsDocument(text: string, options: {
    id: string;
    format: 'json' | 'yaml';
}): Document;
export declare function exportOdcsDocument(document: Document, format?: 'json' | 'yaml'): string;
export declare function getOdcsDocumentNode(document: Document, path: string): NativeJson;
export declare function proposeOdcsDocumentNodeEdit(document: Document, path: string, text: string): {
    document: Document;
    validation: import("../..").Validation;
};
