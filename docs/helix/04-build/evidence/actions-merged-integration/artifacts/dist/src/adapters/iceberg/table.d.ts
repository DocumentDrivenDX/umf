import { Registry } from '../../registry/registry';
import { type NativeJson } from '../../model/native-json';
import { type Document, type ExtensionPackage } from '../../model/types';
export declare const ICEBERG_TABLE_EXTENSION = "umf.iceberg.table";
export declare const icebergTablePackage: ExtensionPackage;
export declare function icebergTableRegistry(): Registry;
export declare function inspectIcebergTable(document: Document): import("../..").Validation;
export declare function importIcebergTable(text: string, options: {
    id: string;
}): Document;
export declare function exportIcebergTable(document: Document): string;
export declare function getIcebergTableNode(document: Document, path: string): NativeJson;
export declare function proposeIcebergTableNodeEdit(document: Document, path: string, text: string): {
    document: Document;
    validation: import("../..").Validation;
};
