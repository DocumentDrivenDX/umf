import { type Document, type Json, type Diagnostic, type ExtensionPackage } from '../model/types';
import { type NativeJson } from '../model/native-json';
import { type CoreFacetDeclaration, type CoreFacetPatch } from '../model/facets';
export declare const TABLESPEC_FACETS_EXTENSION = "umf.tablespec.facets";
export declare const tableSpecFacetsPackage: ExtensionPackage;
export { default as tableSpecFacetClassificationSchema } from '../../spec/core/tablespec-facet-classification.schema.json';
export type TableSpecFacetProfile = 'declared-metadata' | 'json-schema' | 'pyspark-schema' | 'gx-spark' | 'gx-suite-spark' | 'ingest-cast' | 'unresolved';
export interface TableSpecFacetRequest {
    column: number;
    mode: 'strict' | 'report';
    profile: TableSpecFacetProfile;
    input: 'raw' | 'model-normalized';
    obligation: 'value-domain' | 'exact-input';
    author?: CoreFacetDeclaration;
}
type Outcome = 'exact' | 'approximated' | 'not-expressible' | 'unknown';
type Concept = 'length' | 'decimal' | 'integerWidth' | 'conversion' | 'native';
interface Observation {
    concept: Concept;
    idealPath: string;
    nativePath: string;
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
export interface TableSpecFacetClassification {
    operation: 'classify-tablespec-facets';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    outcome: Outcome;
    source: Document;
    target?: Document;
    request: TableSpecFacetRequest;
    binding: typeof binding;
    mapping: {
        origin: 'classified';
        idealPath: string;
        nativePath: string;
        nativeFragment: NativeJson;
        facets: CoreFacetPatch;
        observations: Observation[];
    };
    residuals: {
        path: string;
        targetPath: string | null;
        value: Json;
        reason: string;
        outcome: Exclude<Outcome, 'exact'>;
        binding: typeof binding;
        recovery: typeof recovery;
    }[];
    diagnostics: Diagnostic[];
}
/** Qualified interpretation, never native validation or execution. No implicit migration. */
export declare function classifyTableSpecFacets(input: Document, options: TableSpecFacetRequest): TableSpecFacetClassification;
/** Receipt consistency with retained input and current target, not source authentication. */
export declare function verifyTableSpecFacetClassification(input: TableSpecFacetClassification, current: Document): TableSpecFacetClassification;
export declare function recoverTableSpecFacetSource(input: TableSpecFacetClassification, current: Document): string | Record<string, string>;
