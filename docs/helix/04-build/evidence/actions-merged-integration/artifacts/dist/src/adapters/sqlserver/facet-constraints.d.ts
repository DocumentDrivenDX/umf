import type { NativeJson } from '../../model/native-json';
import { type Document } from '../../model/types';
import { type SqlServerFacetTypeInspection } from './facet-type';
import { type SqlServerFacetPredicateCandidate } from './facet-predicate';
export type SqlServerFacetConstraintScope = 'stored-and-ordinary-checked-write-non-null' | 'ordinary-checked-write-non-null';
export type SqlServerFacetConstraintFact = {
    kind: 'integer-bound';
    operator: '>=' | '<=';
    literal: string;
} | {
    kind: 'binary-byte-bound';
    maximum: string;
} | {
    kind: 'unicode-empty';
} | {
    kind: 'decimal-stored-scale';
    scale: string;
    inputExactness: false;
};
export interface SqlServerFacetConstraintObservation {
    path: string;
    native: NativeJson;
    state: 'interpreted' | 'residual';
    reason: string;
    candidates: SqlServerFacetPredicateCandidate[];
    facts: SqlServerFacetConstraintFact[];
    scope?: SqlServerFacetConstraintScope;
}
export interface SqlServerFacetConstraintsInspection {
    nativeColumn: NativeJson;
    type: SqlServerFacetTypeInspection;
    observations: SqlServerFacetConstraintObservation[];
    checksAvailable: boolean;
    complete: false;
    sourceAuthenticity: 'unverified';
}
/** Internal interpretation of a validated catalog observation. No core assertion,
 * source authentication, complete constraint inventory or input-exactness proof.
 * Callers must retain the source document; returned observations do not replace it. */
export declare function inspectSqlServerFacetConstraints(input: Document, columnPath: string): SqlServerFacetConstraintsInspection;
