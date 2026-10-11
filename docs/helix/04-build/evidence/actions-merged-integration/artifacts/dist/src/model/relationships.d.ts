import { type Document, type Json, type Diagnostic } from './types';
import { type RelationshipCandidate, type CoreRelationship, type RelationshipEndpoint, type RelationshipTarget, type RelationshipMultiplicity } from '../validation/relationships';
export interface RelationshipModuleIdentity {
    module: string;
}
export interface CoreRelationshipIdentity extends RelationshipModuleIdentity {
    id: string;
}
export interface CoreRelationshipRequest {
    id: string;
    name: string;
    source: RelationshipEndpoint[];
    target: RelationshipTarget[];
    sourceMultiplicity: RelationshipMultiplicity;
    targetMultiplicity: RelationshipMultiplicity;
    targetLifecycle: 'owned' | 'independent' | 'unspecified';
    directed: boolean;
    inverse?: string | null;
    associationRecord?: RelationshipEndpoint;
}
type Source = Document | RelationshipCandidate;
interface OperationContext {
    diagnostics: Diagnostic[];
    residuals: [];
}
export interface CoreRelationshipDeclaration extends OperationContext {
    operation: 'declare-core-relationship';
    version: '1.0.0';
    source: RelationshipCandidate;
    target: RelationshipCandidate;
    identity: RelationshipModuleIdentity;
    request: CoreRelationshipRequest;
    provenance: {
        origin: 'authored';
        idealPath: string;
        basis: 'explicit-author-declaration';
        nativePath: null;
    };
}
export type CoreRelationshipMeaning = {
    state: 'missing';
} | {
    state: 'legacy';
    value: Json;
} | {
    state: 'known' | 'partial';
    relationships: CoreRelationship[];
    uninterpretedPaths: string[];
};
export interface CoreRelationshipInspection extends OperationContext {
    operation: 'inspect-core-relationships';
    version: '1.0.0';
    source: Source;
    identity: RelationshipModuleIdentity;
    path: string;
    meaning: CoreRelationshipMeaning;
    provenance: 'unverified';
}
export interface CoreRelationshipLookup extends OperationContext {
    operation: 'lookup-core-relationship';
    version: '1.0.0';
    source: RelationshipCandidate;
    identity: CoreRelationshipIdentity;
    path: string;
    relationship: CoreRelationship;
    uninterpretedPaths: string[];
    provenance: 'unverified';
}
export type CoreRelationshipOperation = CoreRelationshipDeclaration | CoreRelationshipInspection | CoreRelationshipLookup;
export declare function inspectCoreRelationships(input: Source, identity: RelationshipModuleIdentity): CoreRelationshipInspection;
export declare function lookupCoreRelationship(input: Source, identityInput: CoreRelationshipIdentity): CoreRelationshipLookup;
export declare function declareCoreRelationship(input: Source, identity: RelationshipModuleIdentity, requestInput: CoreRelationshipRequest): CoreRelationshipDeclaration;
export declare function verifyCoreRelationshipOperation(input: CoreRelationshipOperation, current: Source): CoreRelationshipOperation;
export {};
