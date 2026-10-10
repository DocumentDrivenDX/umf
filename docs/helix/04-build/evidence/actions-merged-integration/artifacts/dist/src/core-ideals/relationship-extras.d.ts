import { type Document, type Json, type Diagnostic } from '../model/types';
import { type CoreRelationshipDeclaration, type CoreRelationshipIdentity } from '../model/relationships';
export { default as relationshipExtrasSchema } from '../../spec/core/relationship-extras.schema.json';
export type RelationshipExtraSystem = 'graphql' | 'rdf' | 'linkml';
export type RelationshipExtraArchive = {
    format: 'graphql-sdl' | 'linkml-json' | 'linkml-yaml';
    text: string;
} | {
    format: 'rdf-nquads';
    text: string;
    blankNodeScope: string;
};
export interface RelationshipExtraRecord {
    module: string;
    element: string;
    name: string;
    markerField?: string;
}
interface CommonRequest {
    id: string;
    mode: 'strict' | 'report';
    relationship: CoreRelationshipIdentity;
    records: RelationshipExtraRecord[];
    orientation?: 'source-to-target';
}
export type RelationshipExtraRequest = CommonRequest & ({
    system: 'graphql';
    root: {
        typeName: string;
        fieldName: string;
    };
    field: string;
    inverseField?: string;
    forwardUnion?: string;
    inverseUnion?: string;
} | {
    system: 'rdf';
    predicate: string;
    inversePredicate?: string;
    unionPolicy: 'owl-union';
} | {
    system: 'linkml';
    schemaId: string;
    schemaName: string;
    slot: string;
    inverseSlot?: string;
});
export interface RelationshipExtraClassificationRequest {
    system: RelationshipExtraSystem;
    mode: 'strict' | 'report';
    archive: RelationshipExtraArchive;
}
export interface RelationshipExtraObservation {
    nativePath: string;
    kind: 'graphql-field' | 'rdf-domain' | 'rdf-range' | 'rdf-union' | 'rdf-list' | 'linkml-class' | 'linkml-slot';
    provenance: 'inferred';
    authorIntent: 'unknown';
}
interface Loss {
    path: string;
    value: Json;
    outcome: 'approximated' | 'not-expressible' | 'unknown';
    reason: string;
    recovery: 'retained-source';
}
interface BaseReceipt {
    version: '1.0.0';
    source: Document;
    target?: Document;
    binding: string;
    outcome: 'approximated' | 'not-expressible' | 'unknown';
    residuals: Loss[];
    diagnostics: Diagnostic[];
}
export interface RelationshipExtraClassification extends BaseReceipt {
    operation: 'classify-relationship-extra';
    status: 'classified' | 'blocked';
    request: RelationshipExtraClassificationRequest;
    observations: RelationshipExtraObservation[];
}
export interface RelationshipExtraProjection extends BaseReceipt {
    operation: 'project-relationship-extra';
    status: 'projected' | 'blocked';
    author: CoreRelationshipDeclaration;
    request: RelationshipExtraRequest;
    nativeArchive?: RelationshipExtraArchive;
    mappings: {
        idealPath: string;
        nativePath: string;
        outcome: 'approximated';
        provenance: 'explicit-author-declaration';
    }[];
}
export declare function importRelationshipExtraArchive(input: RelationshipExtraArchive, id: string): Document;
/** Native syntax observations only. The source is copied unchanged; no authored assertions are created. */
export declare function classifyRelationshipExtra(input: Document, options: RelationshipExtraClassificationRequest): RelationshipExtraClassification;
/** Explicit Record-shape down-binding; native-only import never authenticates authored intent. */
export declare function projectRelationshipToExtra(input: Document, authorInput: CoreRelationshipDeclaration, options: RelationshipExtraRequest): RelationshipExtraProjection;
export declare function verifyRelationshipExtra(input: RelationshipExtraProjection | RelationshipExtraClassification, current?: Document): RelationshipExtraClassification | RelationshipExtraProjection;
export declare function recoverRelationshipExtraIdeal(input: RelationshipExtraProjection, current: Document): Document;
export declare function recoverRelationshipExtraNative(input: RelationshipExtraProjection | RelationshipExtraClassification, current: Document): {
    document: Document;
    archive: RelationshipExtraArchive;
};
