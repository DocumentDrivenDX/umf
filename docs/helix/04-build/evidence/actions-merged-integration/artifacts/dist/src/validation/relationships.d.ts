import { type Document, type Validation, type Module, type Json } from '../model/types';
export interface RelationshipEndpoint {
    module: string;
    element: string;
    [key: string]: unknown;
}
export interface RelationshipTarget extends RelationshipEndpoint {
    key: string;
}
export interface RelationshipMultiplicity {
    min: number;
    max: number | '*';
    [key: string]: unknown;
}
export interface CoreRelationship {
    id: string;
    name: string;
    source: RelationshipEndpoint[];
    target: RelationshipTarget[];
    sourceMultiplicity: RelationshipMultiplicity;
    targetMultiplicity: RelationshipMultiplicity;
    targetLifecycle: 'owned' | 'independent' | 'unspecified' | (string & {});
    directed: boolean;
    inverse?: string;
    associationRecord?: RelationshipEndpoint;
    [key: string]: unknown;
}
export interface RelationshipCandidate {
    umf: '0.7.0';
    id: string;
    vocabularies: Document['vocabularies'];
    modules: (Module & {
        relationships?: CoreRelationship[];
    })[];
    extensions?: Record<string, Json>;
    [key: string]: unknown;
}
/** Explicit candidate validator; never reinterprets an older envelope. */
export declare function validateRelationshipCandidate(input: unknown, validateBase?: boolean): Validation;
