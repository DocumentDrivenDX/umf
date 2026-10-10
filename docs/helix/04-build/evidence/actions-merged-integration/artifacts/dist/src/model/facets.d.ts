export { default as coreFacetOperationV3Schema } from '../../spec/core/facet-operation-v3.schema.json';
export { default as coreFacetOperationV2Schema } from '../../spec/core/facet-operation-v2.schema.json';
import { type Document, type Json } from './types';
export { default as coreFacetOperationSchema } from '../../spec/core/facet-operation.schema.json';
export interface CoreFacetIdentity {
    module: string;
    element: string;
}
export interface CoreFacetPatch {
    length?: {
        max: number;
        unit: 'unicode-scalar' | 'byte';
    };
    precision?: number;
    scale?: number;
    integerWidth?: {
        bits: number;
        signed: boolean;
    };
}
export interface CoreFacets {
    length?: {
        max: number;
        unit: string;
        [key: string]: unknown;
    };
    precision?: number;
    scale?: number;
    integerWidth?: {
        bits: number;
        signed: boolean;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}
export type CoreFacetMeaning = {
    state: 'missing' | 'inapplicable';
} | {
    state: 'legacy';
    value: Json;
} | {
    state: 'known' | 'partial';
    facets: CoreFacets;
    interpreted: CoreFacetPatch;
    uninterpretedPaths: string[];
};
export interface CoreFacetInspection {
    operation: 'inspect-core-facets';
    version: '1.0.0' | '2.0.0' | '3.0.0';
    source: Document;
    identity: CoreFacetIdentity;
    path: string;
    meaning: CoreFacetMeaning;
    provenance: 'unverified';
}
export interface CoreFacetDeclaration {
    operation: 'declare-core-facets';
    version: '1.0.0' | '2.0.0' | '3.0.0';
    source: Document;
    target: Document;
    identity: CoreFacetIdentity;
    request: CoreFacetPatch;
    provenance: {
        origin: 'authored';
        idealPath: string;
        binding: {
            id: 'umf.core.facets.authoring';
            version: '1.0.0' | '2.0.0' | '3.0.0';
        };
        basis: 'explicit-author-declaration';
        nativePath: null;
    };
}
/** Copies known assertions separately from uninterpreted members; never infers authorship. */
export declare function inspectCoreFacets(input: Document, identity: CoreFacetIdentity): CoreFacetInspection;
/** Patch known groups only; omitted groups and unknown nested qualifiers remain attached. */
export declare function declareCoreFacets(input: Document, identity: CoreFacetIdentity, options: CoreFacetPatch): CoreFacetDeclaration;
/** Receipt consistency and current-document check, not source authentication. */
export declare function verifyCoreFacetDeclaration(input: CoreFacetDeclaration, current: Document): CoreFacetDeclaration;
