import { type Document, type Json, type Validation } from './types';
import { type CoreLiteral } from './schema-literals';
export type CoreSchemaPropertyIdentity = {
    scope: 'document';
} | {
    scope: 'module';
    module: string;
} | {
    scope: 'element';
    module: string;
    element: string;
};
export interface CoreSchemaPropertyPatch {
    title?: string;
    aliases?: string[];
    examples?: CoreLiteral[];
    allowedValues?: CoreLiteral[];
    default?: {
        value: CoreLiteral;
        on: 'missing' | 'null' | 'missing-or-null';
    };
    facets?: {
        length?: {
            min?: number;
            max?: number;
            unit: 'unicode-scalar' | 'byte';
        };
        collectionSize?: {
            min?: number;
            max?: number;
        };
        range?: {
            min?: CoreLiteral;
            max?: CoreLiteral;
            minInclusive?: boolean;
            maxInclusive?: boolean;
        };
    };
}
export declare function inspectCoreSchemaProperties(input: Document, identity: CoreSchemaPropertyIdentity): {
    operation: 'inspect-core-schema-properties';
    version: '1.0.0';
    source: Document;
    identity: {
        scope: 'document';
    } | {
        scope: 'module';
        module: string;
    } | {
        scope: 'element';
        module: string;
        element: string;
    };
    path: string;
    properties: Record<string, Json>;
    diagnostics: import("./types").Diagnostic[];
    provenance: 'unverified';
};
export declare function declareCoreSchemaProperties(input: Document, identity: CoreSchemaPropertyIdentity, patch: CoreSchemaPropertyPatch): Document;
export declare function validateCoreFieldValue(input: Document, fieldInput: {
    module: string;
    element: string;
}, valueInput: CoreLiteral): Validation;
export type CoreDefaultInput = {
    state: 'missing';
} | {
    state: 'present';
    value: CoreLiteral;
};
export declare function resolveCoreDefault(input: Document, fieldInput: {
    module: string;
    element: string;
}, stateInput: CoreDefaultInput): {
    operation: 'resolve-core-default';
    version: '1.0.0';
    source: Document;
    identity: Json;
    input: CoreDefaultInput;
    result: CoreDefaultInput;
    applied: boolean;
};
