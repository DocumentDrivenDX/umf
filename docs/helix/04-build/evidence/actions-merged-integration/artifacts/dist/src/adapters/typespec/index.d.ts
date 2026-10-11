import { Registry } from '../../registry/registry';
import { type Document, type ExtensionPackage } from '../../model/types';
export declare const TYPESPEC_EXTENSION = "umf.typespec";
export declare const typespecPackage: ExtensionPackage;
export interface TypeSpecPayload {
    profile: 'typespec-1.16.0-sources';
    entrypoint: string;
    files: Record<string, string>;
    libraries?: Record<string, string>;
}
export declare function typespecRegistry(): Registry;
export declare function inspectTypeSpec(document: Document): import("../..").Validation;
export declare function importTypeSpecSources(input: {
    entrypoint: string;
    files: Record<string, string>;
    libraries?: Record<string, string>;
}, options: {
    id: string;
}): Document;
export declare function exportTypeSpecSources(document: Document): {
    entrypoint: string;
    files: Record<string, string>;
    libraries?: Record<string, string>;
};
export declare function compileTypeSpecDocument(document: Document): Promise<{
    compiler: string;
    libraries: {
        [x: string]: string;
    };
    valid: boolean;
    complete: false;
    diagnostics: {
        code: string;
        severity: import("@typespec/compiler").DiagnosticSeverity;
        message: string;
        file?: string;
        start?: number;
        end?: number;
    }[];
    limitations: string[];
}>;
export declare function proposeTypeSpecSourceEdit(document: Document, path: string, text: string): {
    document: Document;
    validation: import("../..").Validation;
};
export declare function getTypeSpecSyntax(document: Document, path: string): {
    kind: string;
    start: number;
    end: number;
}[];
