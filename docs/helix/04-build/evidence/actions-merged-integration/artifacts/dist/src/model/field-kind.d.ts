export { default as coreKindOperationV6Schema } from '../../spec/core/kind-operation-v6.schema.json';
export { default as coreKindOperationV5Schema } from '../../spec/core/kind-operation-v5.schema.json';
export { default as coreKindOperationV4Schema } from '../../spec/core/kind-operation-v4.schema.json';
import { type Document, type ElementKind, type Json } from './types';
export { default as coreKindOperationV3Schema } from '../../spec/core/kind-operation-v3.schema.json';
export { default as coreKindOperationV2Schema } from '../../spec/core/kind-operation-v2.schema.json';
export { default as coreKindOperationSchema } from '../../spec/core/kind-operation.schema.json';
export interface CoreKindIdentity {
    module: string;
    element: string;
}
export type CoreKindMeaning = {
    state: 'known';
    kind: ElementKind;
} | {
    state: 'unspecified';
} | {
    state: 'legacy';
    value: Json;
} | {
    state: 'unknown';
    value: string;
};
export interface CoreKindInspection {
    operation: 'inspect-core-kind';
    version: '1.0.0' | '2.0.0' | '3.0.0' | '4.0.0' | '5.0.0' | '6.0.0';
    source: Document;
    identity: CoreKindIdentity;
    path: string;
    meaning: CoreKindMeaning;
    provenance: 'unverified';
}
export interface CoreKindDeclaration {
    operation: 'declare-core-kind';
    version: '1.0.0' | '2.0.0' | '3.0.0' | '4.0.0' | '5.0.0' | '6.0.0';
    source: Document;
    target: Document;
    identity: CoreKindIdentity;
    provenance: {
        origin: 'authored';
        idealPath: string;
        kind: ElementKind;
        binding: {
            id: 'umf.core.kind.authoring';
            version: '1.0.0' | '2.0.0' | '3.0.0' | '4.0.0' | '5.0.0' | '6.0.0';
        };
        basis: 'explicit-author-declaration';
        nativePath: null;
    };
}
/** Read a role without inventing author/classifier provenance or interpreting legacy collisions. */
export declare function inspectCoreElementKind(input: Document, identity: CoreKindIdentity): CoreKindInspection;
/** Explicit author action; archives previous meaning and makes no native classification claim. */
export declare function declareCoreElementKind(input: Document, identity: CoreKindIdentity, kind: ElementKind): CoreKindDeclaration;
/** Revalidate a retained declaration before relying on its provenance. Any model change requires a new declaration. */
export declare function verifyCoreKindDeclaration(input: CoreKindDeclaration, current: Document): CoreKindDeclaration;
