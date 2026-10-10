import { type Document, type Json, type Diagnostic, type ExtensionPackage } from '../model/types';
import { type NativeJson } from '../model/native-json';
import { type CoreFacetDeclaration, type CoreFacetPatch } from '../model/facets';
import type { PostgresqlBackend } from '../adapters/postgresql';
export declare const POSTGRESQL_FACETS_EXTENSION = "umf.postgresql.facets";
export declare const postgresqlFacetsPackage: ExtensionPackage;
export { default as postgresqlFacetClassificationSchema } from '../../spec/core/postgresql-facet-classification.schema.json';
export type PostgresqlFacetProfile = 'stored-value' | 'new-value' | 'unresolved';
export interface PostgresqlFacetRequest {
    column: string;
    nativeSource: string;
    supplement: string;
    mode: 'strict' | 'report';
    profile: PostgresqlFacetProfile;
    datumFormat: 'little-endian-datum64' | 'unresolved';
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
export interface PostgresqlFacetClassification {
    operation: 'classify-postgresql-facets';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    outcome: Outcome;
    source: Document;
    target?: Document;
    request: PostgresqlFacetRequest;
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
export declare function classifyPostgresqlFacets(input: Document, options: PostgresqlFacetRequest, backend: PostgresqlBackend): Promise<PostgresqlFacetClassification>;
/** Receipt consistency with retained input and current target, not source authentication. */
export declare function verifyPostgresqlFacetClassification(input: PostgresqlFacetClassification, current: Document, backend: PostgresqlBackend): Promise<PostgresqlFacetClassification>;
export declare function recoverPostgresqlFacetSource(input: PostgresqlFacetClassification, current: Document, backend: PostgresqlBackend): Promise<{
    nativeSource: string;
    supplement: string;
}>;
