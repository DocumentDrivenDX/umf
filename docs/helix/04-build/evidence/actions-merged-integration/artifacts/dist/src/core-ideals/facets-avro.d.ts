import { type Document, type Json, type Diagnostic, type ExtensionPackage } from '../model/types';
import { type NativeJson } from '../model/native-json';
import { type CoreFacetDeclaration, type CoreFacetPatch } from '../model/facets';
import type { AvroTypeLocation } from './avro-cardinality-type';
export declare const AVRO_FACETS_EXTENSION = "umf.avro.facets";
export declare const avroFacetsPackage: ExtensionPackage;
export { default as avroFacetClassificationSchema } from '../../spec/core/avro-facet-classification.schema.json';
export interface AvroFacetRequest {
    location: AvroTypeLocation;
    nativeSource: string;
    dependencies?: {
        id: string;
        schema: string;
    }[];
    identity: {
        module: string;
        element: string;
    };
    mode: 'strict' | 'report';
    profile: 'declared-schema' | 'apache-datum-writer' | 'fastavro-schemaless-writer' | 'unresolved';
    obligation: 'value-domain' | 'exact-input';
    author?: CoreFacetDeclaration;
}
type Outcome = 'exact' | 'approximated' | 'not-expressible' | 'unknown';
type Concept = 'length' | 'decimal' | 'integerWidth' | 'conversion' | 'native';
interface Observation {
    concept: Concept;
    idealPath: string;
    location: AvroTypeLocation;
    interpretation: 'declared' | 'inferred' | 'unknown' | 'unsupported';
    outcome: Outcome;
    basis: string;
}
interface Branch {
    location: AvroTypeLocation;
    declarationLocation: AvroTypeLocation;
    nativeFragment: NativeJson;
    declarationFragment: NativeJson;
    family: 'integer' | 'float' | 'decimal' | 'string' | 'binary' | 'null' | 'unsupported';
    facets: CoreFacetPatch;
    interpretation: 'declared' | 'unknown' | 'unsupported';
    enforcement: 'unverified';
}
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
};
declare const recovery: 'Retain original native archive and authored facets; interpretation does not replace native meaning';
export interface AvroFacetClassification {
    operation: 'classify-avro-facets';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    outcome: Outcome;
    source: Document;
    target?: Document;
    request: AvroFacetRequest;
    binding: typeof binding;
    mapping: {
        origin: 'classified';
        idealPath: string;
        location: AvroTypeLocation;
        nativeFragment: NativeJson;
        facets: CoreFacetPatch;
        branches: Branch[];
        observations: Observation[];
    };
    residuals: {
        path: string;
        location: AvroTypeLocation;
        targetPath: string | null;
        value: Json;
        reason: string;
        outcome: Exclude<Outcome, 'exact'>;
        binding: typeof binding;
        recovery: typeof recovery;
    }[];
    diagnostics: Diagnostic[];
}
/** Add scoped facet observations to an explicit logical Field, preserving the
 * native bundle and source texts. Profiles never authenticate a writer or source. */
export declare function classifyAvroFacets(input: Document, options: AvroFacetRequest): AvroFacetClassification;
/** Verify retained receipt consistency, not source authenticity. */
export declare function verifyAvroFacetClassification(input: AvroFacetClassification, current: Document): AvroFacetClassification;
export declare function recoverAvroFacetSource(input: AvroFacetClassification, current: Document): {
    schema: string;
    dependencies: {
        id: string;
        schema: string;
    }[];
};
