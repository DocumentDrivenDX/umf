import { Registry } from '../../registry/registry';
import { type NativeJson } from '../../model/native-json';
import { type Document, type ExtensionPackage } from '../../model/types';
export declare const DELTA_EXTENSION = "umf.delta";
export declare const deltaPackage: ExtensionPackage;
export declare function deltaRegistry(): Registry;
export declare function inspectDelta(document: Document): import("../..").Validation;
export declare function importDeltaSchema(text: string, options: {
    id: string;
}): Document;
export declare function exportDeltaSchema(document: Document): string;
export declare function getDeltaNode(document: Document, path: string): NativeJson;
export declare function proposeDeltaNodeEdit(document: Document, path: string, text: string): {
    document: Document;
    validation: import("../..").Validation;
};
