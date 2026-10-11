import { type Document, type Json, type Diagnostic, type ExtensionPackage } from '../model/types';
import { type NativeJson } from '../model/native-json';
import { type CoreFacetDeclaration, type CoreFacetPatch } from '../model/facets';
export declare const SQLSERVER_FACETS_EXTENSION = "umf.sqlserver.facets";
export declare const sqlserverFacetsPackage: ExtensionPackage;
export { default as sqlserverFacetClassificationSchema } from '../../spec/core/sqlserver-facet-classification.schema.json';
export interface SqlServerFacetRequest {
    column: string;
    nativeSource: string;
    identity: {
        module: string;
        element: string;
    };
    mode: 'strict' | 'report';
    profile: 'stored-value' | 'ordinary-checked-write' | 'unresolved';
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
export interface SqlServerFacetClassification {
    operation: 'classify-sqlserver-facets';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    outcome: Outcome;
    source: Document;
    target?: Document;
    request: SqlServerFacetRequest;
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
/** Interpret a selected physical column onto an explicitly selected logical Field.
 * Native columns are never relabeled. Results are scoped observations, not authorship. */
export declare function classifySqlServerFacets(input: Document, options: SqlServerFacetRequest): SqlServerFacetClassification;
/** Receipt consistency with retained input and current target, not source authentication. */
export declare function verifySqlServerFacetClassification(input: SqlServerFacetClassification, current: Document): SqlServerFacetClassification;
export declare function recoverSqlServerFacetSource(input: SqlServerFacetClassification, current: Document): string;
