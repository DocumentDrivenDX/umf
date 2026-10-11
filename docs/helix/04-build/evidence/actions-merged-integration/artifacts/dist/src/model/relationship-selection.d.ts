import { type Document, type Diagnostic } from './types';
import type { CoreRelationshipIdentity } from './relationships';
import type { CoreRelationship, RelationshipEndpoint, RelationshipTarget, RelationshipCandidate } from '../validation/relationships';
import { Registry } from '../registry/registry';
export interface CoreRelationshipQuery {
    modules?: string[];
    names?: string[];
    identities?: CoreRelationshipIdentity[];
    sources?: RelationshipEndpoint[];
    targets?: RelationshipEndpoint[];
}
interface Navigation {
    name: string | null;
    from: RelationshipEndpoint[];
    to: RelationshipEndpoint[];
}
export interface CoreRelationshipSelectionEntry {
    identity: CoreRelationshipIdentity;
    path: string;
    relationship: CoreRelationship;
    sources: {
        reference: RelationshipEndpoint;
        recordPath: string;
    }[];
    targets: {
        reference: RelationshipTarget;
        recordPath: string;
        keyPath: string;
    }[];
    associationRecord?: {
        reference: RelationshipEndpoint;
        recordPath: string;
    };
    navigation: {
        forward: Navigation;
        reverse?: Navigation;
    };
    uninterpretedPaths: string[];
}
export interface CoreRelationshipSelection {
    operation: 'select-core-relationships';
    version: '1.0.0';
    source: RelationshipCandidate;
    query: CoreRelationshipQuery;
    selection: CoreRelationshipSelectionEntry[];
    diagnostics: Diagnostic[];
    residuals: [];
    provenance: 'unverified';
    navigationScope: 'authored-presentation-only';
}
export declare function selectCoreRelationships(input: Document, queryInput: CoreRelationshipQuery, registry?: Registry): CoreRelationshipSelection;
export {};
