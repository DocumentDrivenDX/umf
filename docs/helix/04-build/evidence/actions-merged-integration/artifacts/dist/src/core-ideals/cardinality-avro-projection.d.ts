import { type Document, type Json, type Diagnostic } from '../model/types';
import { type CoreCardinalityDeclaration } from '../model/cardinality';
import { type AvroTypeLocation } from './avro-cardinality-type';
export { default as cardinalityAvroProjectionSchema } from '../../spec/core/cardinality-avro-projection.schema.json';
export interface CardinalityAvroRequest {
    id: string;
    recordName: string;
    namespace: string;
    fieldName: string;
    nativeType: string;
    dependencies: {
        id: string;
        schema: string;
    }[];
    availability: 'avro-null-value' | 'unresolved';
    requireExactValues: boolean;
    mode: 'strict' | 'report';
}
interface Bundle {
    schema: string;
    dependencies: {
        id: string;
        schema: string;
    }[];
}
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
};
export interface CardinalityAvroProjection {
    operation: 'project-cardinality-avro';
    version: '1.0.0';
    status: 'projected' | 'blocked';
    source: Document;
    author: CoreCardinalityDeclaration;
    request: CardinalityAvroRequest;
    target?: Document;
    nativeBundle?: Bundle;
    binding: typeof binding;
    mapping: {
        origin: 'authored';
        idealPath: string;
        cardinality: 'one' | 'array' | 'map' | 'unspecified';
        outcome: 'exact' | 'approximated' | 'unknown' | 'not-expressible';
        items: {
            idealPath: string;
            nativeLocation: AvroTypeLocation;
        }[];
    };
    residuals: {
        path: string;
        value: Json;
        reason: string;
        outcome: 'approximated' | 'unknown' | 'not-expressible';
        recovery: 'Recover source meaning with retained projection receipt; native-only import does not recover author intent';
    }[];
    diagnostics: Diagnostic[];
}
export declare function projectCardinalityToAvro(input: CoreCardinalityDeclaration, options: CardinalityAvroRequest): CardinalityAvroProjection;
export declare function recoverCardinalityFromAvro(input: CardinalityAvroProjection, native: Bundle): Document;
