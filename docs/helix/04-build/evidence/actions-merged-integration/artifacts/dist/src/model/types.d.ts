export type Json = null | boolean | number | string | Json[] | {
    [key: string]: Json;
};
export type JsonObject = {
    [key: string]: Json;
};
export type Scope = 'document' | 'module' | 'element';
/** Value family only; native refinements determine the actual domain and behavior. */
export declare const SCALAR_TYPES: readonly ['boolean', 'integer', 'decimal', 'float', 'string', 'binary', 'date', 'time', 'timestamp'];
export type ScalarType = typeof SCALAR_TYPES[number];
export declare const ELEMENT_KINDS: readonly ['field', 'record', 'group'];
export type ElementKind = typeof ELEMENT_KINDS[number];
/** Ideal availability only; native absence representations require explicit bindings. */
export declare const NULLABILITIES: readonly ['required', 'absent-allowed', 'unspecified'];
export type Nullability = typeof NULLABILITIES[number];
/** Ideal container shape; native repetition and storage encodings remain separate. */
export declare const CARDINALITIES: readonly ['one', 'array', 'map', 'unspecified'];
export type Cardinality = typeof CARDINALITIES[number];
export interface CoreItemTypeReference {
    module: string;
    element: string;
    [key: string]: unknown;
}
export interface Element {
    id: string;
    name?: string;
    description?: string;
    scalarType?: ScalarType | (string & {});
    extensions: Record<string, Json>;
    references?: {
        role: string;
        module: string;
        element: string;
        [key: string]: unknown;
    }[];
    [key: string]: unknown;
}
export interface Module {
    id: string;
    namespace: string;
    elements: Element[];
    extensions?: Record<string, Json>;
    [key: string]: unknown;
}
export interface Document {
    umf: '0.1.0' | '0.2.0' | '0.3.0' | '0.4.0' | '0.5.0' | '0.6.0' | '0.7.0' | '0.8.0';
    id: string;
    vocabularies: Record<string, {
        version: string;
        [key: string]: unknown;
    }>;
    modules: Module[];
    extensions?: Record<string, Json>;
    [key: string]: unknown;
}
export interface ExtensionPackage {
    id: string;
    version: string;
    coreVersion: '0.1.0';
    description: string;
    schema: JsonObject | boolean;
    semantics: string;
    scopes: Scope[];
    capabilities: {
        validation: 'structural' | 'semantic';
        directions: ('import' | 'export')[];
        evidence: string[];
        native?: {
            system: string;
            version: string;
            subset: string;
        };
    };
}
export interface Diagnostic {
    code: string;
    path: string;
    message: string;
    severity: 'error' | 'warning';
}
export interface Validation {
    valid: boolean;
    complete: boolean;
    diagnostics: Diagnostic[];
}
export declare class UmfError extends Error {
    readonly code: string;
    readonly path: string;
    constructor(code: string, message: string, path?: string);
}
export declare const pointer: (key: string) => string;
