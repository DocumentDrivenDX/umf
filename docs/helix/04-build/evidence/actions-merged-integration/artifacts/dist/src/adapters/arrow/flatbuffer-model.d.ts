import { Registry } from '../../registry/registry';
import { type Document, type ExtensionPackage } from '../../model/types';
export declare const ARROW_FLATBUFFER_EXTENSION = "umf.arrow.flatbuffer";
export declare const arrowFlatbufferPackage: ExtensionPackage;
export declare function arrowFlatbufferRegistry(): Registry;
export declare function inspectArrowFlatbufferModel(document: Document): {
    valid: boolean;
    complete: boolean;
    diagnostics: import("../..").Diagnostic[];
};
/** Imports the documented logical JSON profile, not native FlatBuffers bytes or flatc JSON. */
export declare function importArrowFlatbufferModel(text: string, options: {
    id: string;
}): Document;
export declare function exportArrowFlatbufferModel(document: Document): string;
import type { Json } from '../../model/types';
/** Atomic edit of an existing logical-model node; validates structure, not Arrow semantics. */
export declare function proposeArrowFlatbufferEdit(document: Document, path: string, replacement: Json): {
    document: Document;
    validation: {
        valid: boolean;
        complete: boolean;
        diagnostics: import("../..").Diagnostic[];
    };
};
