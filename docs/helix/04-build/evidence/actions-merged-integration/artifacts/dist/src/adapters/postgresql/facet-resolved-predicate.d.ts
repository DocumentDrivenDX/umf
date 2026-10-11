import type { Json } from '../../model/types';
export type ResolvedFacetTerm = {
    kind: 'bound';
    operator: '>=' | '<=';
    literal: string;
} | {
    kind: 'length';
    unit: 'unicode-scalar' | 'byte';
    max: string;
} | {
    kind: 'scale';
    scale: string;
};
export interface ResolvedFacetInspection {
    native: Json;
    state: 'verified-expression' | 'unsupported';
    terms: ResolvedFacetTerm[];
    nonNullValuesOnly: true;
    valueScope?: 'stored-and-new-values' | 'new-values-only';
    requires: 'retained-catalog-correspondence-and-projection-scope';
}
/** Internal qualification of one analyzed table CHECK. Input must come from the
 * explicit PostgreSQL 17.4 / UTF8 / little-endian Datum64 capture profile.
 * A verified predicate is not a core facet, an exact-input guarantee, or proof
 * that the capture corresponds to a separately retained schema. */
export declare function inspectResolvedFacetPredicate(input: unknown, profile: {
    serverVersion: number;
    encoding: string;
    datumFormat: string;
}): ResolvedFacetInspection;
