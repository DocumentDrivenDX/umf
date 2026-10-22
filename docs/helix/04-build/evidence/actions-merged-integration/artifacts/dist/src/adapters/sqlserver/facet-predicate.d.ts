import type { Json } from '../../model/types';
/** Closed T-SQL expression subset. Syntax alone never proves enforcement. */
export type SqlServerFacetPredicateCandidate = {
    kind: 'bound';
    operator: '>=' | '<=';
    literal: string;
} | {
    kind: 'length';
    measure: 'len' | 'datalength' | 'len-with-sentinel';
    operator: '<=' | '=';
    limit: string;
} | {
    kind: 'scale';
    functionName: 'round';
    scale: string;
    truncate: true;
};
export interface SqlServerFacetPredicateInspection {
    native: Json;
    state: 'candidate' | 'unsupported';
    candidates: SqlServerFacetPredicateCandidate[];
    requires: 'catalog-type-association-enforcement-and-collation-evidence';
}
export declare function inspectSqlServerFacetPredicate(input: unknown, columnName: string): SqlServerFacetPredicateInspection;
