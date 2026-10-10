import { Registry } from '../../registry/registry';
import { type NativeJson } from '../../model/native-json';
import { type Document, type Diagnostic, type ExtensionPackage } from '../../model/types';
export declare const SMITHY_EXTENSION = "umf.smithy";
export declare const smithyPackage: ExtensionPackage;
export declare function smithyRegistry(): Registry;
export declare function inspectSmithy(document: Document): import("../..").Validation;
export declare function importSmithyJson(text: string, options: {
    id: string;
    dependencies?: {
        id: string;
        schema: string;
    }[];
}): Document;
export declare function exportSmithyJson(document: Document): string;
export declare function exportSmithyBundle(document: Document): {
    schema: string;
    dependencies: {
        id: string;
        schema: string;
    }[];
    source: Document;
    diagnostics: Diagnostic[];
};
export declare function getSmithyNode(document: Document, path: string, dependencyId?: string): NativeJson;
/** Candidate only: native semantic validation remains required. */
export declare function proposeSmithyNodeEdit(document: Document, path: string, text: string, dependencyId?: string): {
    document: Document;
    validation: import("../..").Validation;
};
