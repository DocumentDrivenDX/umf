import { type Document, type Json, type Diagnostic } from '../model/types';
import { type CoreRelationshipDeclaration, type CoreRelationshipIdentity } from '../model/relationships';
import type { RelationshipEndpoint } from '../validation/relationships';
import { type ParquetRelationshipCarrier } from './relationship-parquet-carrier';
export { default as relationshipParquetProjectionSchema } from '../../spec/core/relationship-parquet-projection.schema.json';
export interface RelationshipParquetRequest extends Omit<ParquetRelationshipCarrier, 'components'> {
    id: string;
    profile: 'target-key-record';
    relationship: CoreRelationshipIdentity;
    mode: 'strict' | 'report';
    components: (ParquetRelationshipCarrier['components'][number] & {
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
export interface RelationshipParquetProjection {
    operation: 'project-relationship-parquet';
    version: '1.0.0';
    status: 'projected' | 'blocked';
    outcome: 'approximated' | 'not-expressible' | 'unknown';
    source: Document;
    author: CoreRelationshipDeclaration;
    request: RelationshipParquetRequest;
    binding: typeof binding;
    target?: Document;
    nativeArchive?: {
        hex: string;
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
export declare function projectRelationshipToParquet(input: Document, authorInput: CoreRelationshipDeclaration, options: RelationshipParquetRequest): RelationshipParquetProjection;
/** Verify retained consistency against a current or freshly imported native document. */
export declare function verifyRelationshipParquetProjection(input: RelationshipParquetProjection, current: Document): RelationshipParquetProjection;
export declare function recoverRelationshipParquetIdeal(input: RelationshipParquetProjection, current: Document): Document;
export declare function recoverRelationshipParquetNative(input: RelationshipParquetProjection, current: Document): {
    hex: string;
};
