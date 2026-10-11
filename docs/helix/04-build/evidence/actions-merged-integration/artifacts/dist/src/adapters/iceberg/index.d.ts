import { Registry } from '../../registry/registry';
import { type NativeJson } from '../../model/native-json';
import { type Document, type ExtensionPackage } from '../../model/types';
export declare const ICEBERG_EXTENSION = "umf.iceberg";
export declare const icebergPackage: ExtensionPackage;
export declare function icebergRegistry(): Registry;
export declare function inspectIceberg(document: Document): import("../..").Validation;
export declare function importIcebergSchema(text: string, options: {
    id: string;
}): Document;
export declare function exportIcebergSchema(document: Document): string;
export declare function getIcebergNode(document: Document, path: string): NativeJson;
export declare function proposeIcebergNodeEdit(document: Document, path: string, text: string): {
    document: Document;
    validation: import("../..").Validation;
};
