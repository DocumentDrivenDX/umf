import { type Document, type Json, type Diagnostic } from '../model/types';
import { type CoreRelationshipDeclaration, type CoreRelationshipIdentity } from '../model/relationships';
import type { RelationshipEndpoint } from '../validation/relationships';
import { type AvroRelationshipCarrier } from './relationship-avro-carrier';
export { default as relationshipAvroProjectionSchema } from '../../spec/core/relationship-avro-projection.schema.json';
export interface RelationshipAvroRequest extends Omit<AvroRelationshipCarrier, 'components'> {
    id: string;
    profile: 'target-key-record';
    relationship: CoreRelationshipIdentity;
    mode: 'strict' | 'report';
    components: (AvroRelationshipCarrier['components'][number] & {
        targetField: RelationshipEndpoint;
    })[];
}
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
};
declare const recovery: 'Retained receipt recovers authored source and emitted native archive; native-only import does not establish authored intent';
export interface RelationshipAvroProjection {
    operation: 'project-relationship-avro';
    version: '1.0.0';
    status: 'projected' | 'blocked';
    outcome: 'approximated' | 'not-expressible' | 'unknown';
    source: Document;
    author: CoreRelationshipDeclaration;
    request: RelationshipAvroRequest;
    binding: typeof binding;
    target?: Document;
    nativeArchive?: {
        schema: string;
        dependencies: [];
    };
    mappings: {
        idealPath: string;
        nativePath: string;
        outcome: 'approximated';
        targetKey: string;
        componentPaths: string[];
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
/** Explicit reference-value lowering with retained authored meaning; no native identity inference. */
export declare function projectRelationshipToAvro(input: Document, authorInput: CoreRelationshipDeclaration, options: RelationshipAvroRequest): RelationshipAvroProjection;
/** Verify retained consistency against a current or freshly imported native document. */
export declare function verifyRelationshipAvroProjection(input: RelationshipAvroProjection, current: Document): RelationshipAvroProjection;
export declare function recoverRelationshipAvroIdeal(input: RelationshipAvroProjection, current: Document): Document;
export declare function recoverRelationshipAvroNative(input: RelationshipAvroProjection, current: Document): {
    schema: string;
    dependencies: [];
};
