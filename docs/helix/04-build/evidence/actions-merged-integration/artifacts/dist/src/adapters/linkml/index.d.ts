import { Registry } from '../../registry/registry';
import { type NativeJson } from '../../model/native-json';
import { type Document, type ExtensionPackage } from '../../model/types';
export declare const LINKML_EXTENSION = "umf.linkml";
export declare const linkmlPackage: ExtensionPackage;
export declare function linkmlRegistry(): Registry;
export declare function inspectLinkmlDocument(document: Document): import("../..").Validation;
export declare function importLinkmlDocument(text: string, options: {
    id: string;
    format: 'json' | 'yaml';
    metamodelVersion?: string;
}): Document;
export declare function exportLinkmlDocument(document: Document, format?: 'json' | 'yaml'): string;
export declare function getLinkmlDocumentNode(document: Document, path: string): NativeJson;
export declare function proposeLinkmlDocumentNodeEdit(document: Document, path: string, text: string): {
    document: Document;
    validation: import("../..").Validation;
};
