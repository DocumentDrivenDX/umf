import type { Json } from '../../model/types';
/** Syntax candidates only. Names here do not establish native resolution, CHECK
 * enforcement, validation scope, input coercion, or a core facet assertion. */
export type PostgresqlFacetPredicateCandidate = {
    kind: 'bound';
    operator: '>=' | '<=';
    literal: string;
    cast?: string;
} | {
    kind: 'length';
    functionName: string[];
    max: string;
} | {
    kind: 'scale';
    functionName: string[];
    scale: string;
};
export interface PostgresqlFacetPredicateInspection {
    native: Json;
    state: 'candidate' | 'unsupported';
    candidates: PostgresqlFacetPredicateCandidate[];
    requires: 'catalog-resolution-and-enforcement-evidence';
}
/** Inspect a pinned parser SELECT-expression tree, retaining every native node.
 * This intentionally has no Document input/output and cannot promote a facet.
 * Unknown syntax rejects the entire expression, including known conjuncts. */
export declare function inspectPostgresqlFacetPredicate(input: unknown, columnName: string): PostgresqlFacetPredicateInspection;
