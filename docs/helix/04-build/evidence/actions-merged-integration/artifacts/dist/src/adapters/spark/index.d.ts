import { Registry } from '../../registry/registry';
import { type NativeJson } from '../../model/native-json';
import { type Document, type ExtensionPackage } from '../../model/types';
export declare const SPARK_EXTENSION = "umf.spark";
export declare const sparkPackage: ExtensionPackage;
export declare function sparkRegistry(): Registry;
export declare function inspectSpark(document: Document): import("../..").Validation;
export declare function importSparkSchema(text: string, options: {
    id: string;
}): Document;
export declare function exportSparkSchema(document: Document): string;
export declare function getSparkNode(document: Document, path: string): NativeJson;
export declare function proposeSparkNodeEdit(document: Document, path: string, text: string): {
    document: Document;
    validation: import("../..").Validation;
};
