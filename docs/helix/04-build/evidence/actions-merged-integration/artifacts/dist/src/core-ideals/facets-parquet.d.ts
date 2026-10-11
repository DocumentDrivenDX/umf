import { type Document, type Json, type Diagnostic, type ExtensionPackage } from '../model/types';
import { type CoreFacetDeclaration, type CoreFacetPatch } from '../model/facets';
export declare const PARQUET_FACETS_EXTENSION = "umf.parquet.facets";
export declare const parquetFacetsPackage: ExtensionPackage;
export { default as parquetFacetClassificationSchema } from '../../spec/core/parquet-facet-classification.schema.json';
export interface ParquetFacetRequest {
    location: {
        index: number;
        scope: 'present-non-null-leaf';
    };
    identity: {
        module: string;
        element: string;
    };
    mode: 'strict' | 'report';
    profile: 'declared-schema' | 'pyarrow-safe-array-input' | 'unresolved';
    obligation: 'value-domain' | 'exact-input';
    author?: CoreFacetDeclaration;
}
type Outcome = 'exact' | 'approximated' | 'not-expressible' | 'unknown';
type Concept = 'length' | 'decimal' | 'integerWidth' | 'conversion' | 'native';
interface Observation {
    concept: Concept;
    idealPath: string;
    location: ParquetFacetRequest['location'];
    interpretation: 'declared' | 'inferred' | 'unknown' | 'unsupported';
    outcome: Outcome;
    basis: string;
}
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
};
declare const recovery: 'Retain original native archive and authored facets; interpretation does not replace native meaning';
export interface ParquetFacetClassification {
    operation: 'classify-parquet-facets';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    outcome: Outcome;
    source: Document;
    target?: Document;
    request: ParquetFacetRequest;
    binding: typeof binding;
    mapping: {
        origin: 'classified';
        idealPath: string;
        location: ParquetFacetRequest['location'];
        nativeFragment: Json;
        facets: CoreFacetPatch;
        observations: Observation[];
    };
    residuals: {
        path: string;
        location: ParquetFacetRequest['location'];
        targetPath: string | null;
        value: Json;
        reason: string;
        outcome: Exclude<Outcome, 'exact'>;
        binding: typeof binding;
        recovery: typeof recovery;
    }[];
    diagnostics: Diagnostic[];
}
/** Classify the declaration of one present non-null leaf value. Does not infer
 * row availability, container cardinality, authored provenance or file validity. */
export declare function classifyParquetFacets(input: Document, options: ParquetFacetRequest): ParquetFacetClassification;
export declare function verifyParquetFacetClassification(input: ParquetFacetClassification, current: Document): ParquetFacetClassification;
export declare function recoverParquetFacetSource(input: ParquetFacetClassification, current: Document): Uint8Array;
