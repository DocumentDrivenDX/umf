import { Registry } from '../../registry/registry';
import { type NativeJson } from '../../model/native-json';
import { type Document, type ExtensionPackage } from '../../model/types';
export declare const ARROW_EXTENSION = "umf.arrow";
export declare const arrowPackage: ExtensionPackage;
export declare function arrowRegistry(): Registry;
export declare function inspectArrow(document: Document): import("../..").Validation;
export declare function importArrowSchema(text: string, options: {
    id: string;
}): Document;
export declare function exportArrowSchema(document: Document): string;
export declare function getArrowNode(document: Document, path: string): NativeJson;
export declare function proposeArrowNodeEdit(document: Document, path: string, text: string): {
    document: Document;
    validation: import("../..").Validation;
};
