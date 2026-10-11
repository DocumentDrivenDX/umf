export { default as coreCardinalityOperationV4Schema } from '../../spec/core/cardinality-operation-v4.schema.json';
export { default as coreCardinalityOperationV3Schema } from '../../spec/core/cardinality-operation-v3.schema.json';
export { default as coreCardinalityOperationV2Schema } from '../../spec/core/cardinality-operation-v2.schema.json';
import { type Document, type Cardinality, type CoreItemTypeReference, type Json } from './types';
export { default as coreCardinalityOperationSchema } from '../../spec/core/cardinality-operation.schema.json';
export interface CoreCardinalityIdentity {
    module: string;
    element: string;
}
export type CoreCardinalityMeaning = {
    state: 'known';
    cardinality: Cardinality;
    itemType?: CoreItemTypeReference;
} | {
    state: 'missing';
} | {
    state: 'inapplicable';
} | {
    state: 'legacy';
    value: Json;
} | {
    state: 'unknown';
    value: string;
};
export interface CoreCardinalityInspection {
    operation: 'inspect-core-cardinality';
    version: '1.0.0' | '2.0.0' | '3.0.0' | '4.0.0';
    source: Document;
    identity: CoreCardinalityIdentity;
    path: string;
    meaning: CoreCardinalityMeaning;
    provenance: 'unverified';
}
export interface CoreCardinalityRequest {
    cardinality: Cardinality;
    itemType?: CoreItemTypeReference | null;
}
export interface CoreCardinalityDeclaration {
    operation: 'declare-core-cardinality';
    version: '1.0.0' | '2.0.0' | '3.0.0' | '4.0.0';
    source: Document;
    target: Document;
    identity: CoreCardinalityIdentity;
    request: CoreCardinalityRequest;
    provenance: {
        origin: 'authored';
        idealPath: string;
        cardinality: Cardinality;
        binding: {
            id: 'umf.core.cardinality.authoring';
            version: '1.0.0' | '2.0.0' | '3.0.0' | '4.0.0';
        };
        basis: 'explicit-author-declaration';
        nativePath: null;
    };
}
/** Inspect ideal container/item meaning without inferring native shape or author provenance. */
export declare function inspectCoreCardinality(input: Document, identity: CoreCardinalityIdentity): CoreCardinalityInspection;
/** Explicit author action; archives previous meaning and makes no native classification claim. */
export declare function declareCoreCardinality(input: Document, identity: CoreCardinalityIdentity, options: CoreCardinalityRequest): CoreCardinalityDeclaration;
/** Revalidate a retained declaration before relying on its provenance. Any model change requires a new declaration. */
export declare function verifyCoreCardinalityDeclaration(input: CoreCardinalityDeclaration, current: Document): CoreCardinalityDeclaration;
