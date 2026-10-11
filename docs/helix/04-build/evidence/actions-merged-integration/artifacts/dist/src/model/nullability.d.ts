export { default as coreNullabilityOperationV5Schema } from '../../spec/core/nullability-operation-v5.schema.json';
export { default as coreNullabilityOperationV4Schema } from '../../spec/core/nullability-operation-v4.schema.json';
export { default as coreNullabilityOperationV3Schema } from '../../spec/core/nullability-operation-v3.schema.json';
import { type Document, type Nullability, type Json } from './types';
export { default as coreNullabilityOperationV2Schema } from '../../spec/core/nullability-operation-v2.schema.json';
export { default as coreNullabilityOperationSchema } from '../../spec/core/nullability-operation.schema.json';
export interface CoreNullabilityIdentity {
    module: string;
    element: string;
}
export type CoreNullabilityMeaning = {
    state: 'known';
    nullability: Nullability;
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
export interface CoreNullabilityInspection {
    operation: 'inspect-core-nullability';
    version: '1.0.0' | '2.0.0' | '3.0.0' | '4.0.0' | '5.0.0';
    source: Document;
    identity: CoreNullabilityIdentity;
    path: string;
    meaning: CoreNullabilityMeaning;
    provenance: 'unverified';
}
export interface CoreNullabilityDeclaration {
    operation: 'declare-core-nullability';
    version: '1.0.0' | '2.0.0' | '3.0.0' | '4.0.0' | '5.0.0';
    source: Document;
    target: Document;
    identity: CoreNullabilityIdentity;
    provenance: {
        origin: 'authored';
        idealPath: string;
        nullability: Nullability;
        binding: {
            id: 'umf.core.nullability.authoring';
            version: '1.0.0' | '2.0.0' | '3.0.0' | '4.0.0' | '5.0.0';
        };
        basis: 'explicit-author-declaration';
        nativePath: null;
    };
}
/** Inspect availability without inferring a native absence carrier or provenance. */
export declare function inspectCoreNullability(input: Document, identity: CoreNullabilityIdentity): CoreNullabilityInspection;
/** Explicit author action; archives previous meaning and makes no native classification claim. */
export declare function declareCoreNullability(input: Document, identity: CoreNullabilityIdentity, nullability: Nullability): CoreNullabilityDeclaration;
/** Revalidate a retained declaration before relying on its provenance. Any model change requires a new declaration. */
export declare function verifyCoreNullabilityDeclaration(input: CoreNullabilityDeclaration, current: Document): CoreNullabilityDeclaration;
