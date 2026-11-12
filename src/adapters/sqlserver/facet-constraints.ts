// SPDX-License-Identifier: MIT OR Apache-2.0
import type {NativeJson} from '../../model/native-json';
import type {SqlServerFacetTypeInspection} from './facet-type';
import type {SqlServerFacetPredicateCandidate} from './facet-predicate-types';
export type SqlServerFacetConstraintScope='stored-and-ordinary-checked-write-non-null'|'ordinary-checked-write-non-null';
export type SqlServerFacetConstraintFact=
 |{kind:'integer-bound';operator:'>='|'<=';literal:string}
 |{kind:'binary-byte-bound';maximum:string}
 |{kind:'unicode-empty'}
 |{kind:'decimal-stored-scale';scale:string;inputExactness:false};
export interface SqlServerFacetConstraintObservation {
 path:string;native:NativeJson;state:'interpreted'|'residual';reason:string;
 candidates:SqlServerFacetPredicateCandidate[];facts:SqlServerFacetConstraintFact[];
 scope?:SqlServerFacetConstraintScope;
}
export interface SqlServerFacetConstraintsInspection {
 nativeColumn:NativeJson;type:SqlServerFacetTypeInspection;observations:SqlServerFacetConstraintObservation[];
 checksAvailable:boolean;complete:false;sourceAuthenticity:'unverified';
}
