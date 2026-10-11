import { type Document, type Json, type Diagnostic } from '../model/types';
import { type CoreRelationshipDeclaration, type CoreRelationshipIdentity } from '../model/relationships';
export { default as relationshipTableSpecProjectionSchema } from '../../spec/core/relationship-tablespec-projection.schema.json';
export interface RelationshipTableSpecRequest {
    profile: 'outgoing-metadata';
    relationship: CoreRelationshipIdentity;
    mode: 'strict' | 'report';
    columns: {
        sourceColumn: string;
        targetField: {
            module: string;
            element: string;
        };
        targetColumn: string;
    }[];
}
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
};
declare const recovery: 'Retained receipt recovers authored meaning and original native sources; native-only import does not establish authored intent';
export interface RelationshipTableSpecProjection {
    operation: 'project-relationship-tablespec';
    version: '1.0.0';
    status: 'projected' | 'blocked';
    outcome: 'approximated' | 'not-expressible' | 'unknown';
    source: Document;
    author: CoreRelationshipDeclaration;
    nativeSource: Document;
    nativeTarget: Document;
    request: RelationshipTableSpecRequest;
    binding: typeof binding;
    target?: Document;
    mappings: {
        idealPath: string;
        nativePath: string;
        outcome: 'approximated';
        sourceColumns: string[];
        targetColumns: string[];
        targetKey: string;
    }[];
    residuals: {
        path: string;
        value: Json;
        outcome: 'unknown' | 'not-expressible' | 'approximated';
        reason: string;
        recovery: typeof recovery;
    }[];
    diagnostics: Diagnostic[];
}
/** Explicit metadata lowering; no native execution or author-intent inference. */
export declare function projectRelationshipToTableSpec(input: Document, authorInput: CoreRelationshipDeclaration, nativeSourceInput: Document, nativeTargetInput: Document, options: RelationshipTableSpecRequest): RelationshipTableSpecProjection;
/** Recomputes retained consistency; does not authenticate authors or native execution. */
export declare function verifyRelationshipTableSpecProjection(input: RelationshipTableSpecProjection, current: Document): RelationshipTableSpecProjection;
export declare function recoverRelationshipTableSpecIdeal(input: RelationshipTableSpecProjection, current: Document): Document;
export declare function recoverRelationshipTableSpecNativeSources(input: RelationshipTableSpecProjection, current: Document): {
    source: string | Record<string, string>;
    target: string | Record<string, string>;
};
