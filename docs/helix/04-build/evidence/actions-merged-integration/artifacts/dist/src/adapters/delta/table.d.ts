import { Registry } from '../../registry/registry';
import { type NativeJson } from '../../model/native-json';
import { type Document, type ExtensionPackage } from '../../model/types';
export declare const DELTA_TABLE_EXTENSION = "umf.delta.table";
export declare const deltaTablePackage: ExtensionPackage;
export declare function deltaTableRegistry(): Registry;
export declare function inspectDeltaTable(document: Document): import("../..").Validation;
export declare function importDeltaTable(text: string, options: {
    id: string;
}): Document;
export declare function exportDeltaTable(document: Document): string;
export declare function getDeltaTableNode(document: Document, path: string): NativeJson;
export declare function proposeDeltaTableNodeEdit(document: Document, path: string, text: string): {
    document: Document;
    validation: import("../..").Validation;
};
/** Parse a copied view; this never normalizes the authoritative schemaString. */
export declare function getDeltaTableSchema(document: Document): Document;
