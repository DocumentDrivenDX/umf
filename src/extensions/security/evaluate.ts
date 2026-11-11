// SPDX-License-Identifier: MIT OR Apache-2.0
// Access and collection semantics are owned by the Rust V4 roots.
import type {CoreKeyTupleValue} from '../../model/key-tuple';
import type {CoreLiteral} from '../../model/schema-literals';
import type {SecurityDecision} from './logic';
import type {SecurityQueryOperator,SecurityRef as SecurityTypeRef} from './types';

export interface SecurityFact {
 type:SecurityTypeRef;key:CoreKeyTupleValue[];
 fields:{field:SecurityTypeRef;value:CoreLiteral}[];
 absent:SecurityTypeRef[];
}
/** Host attestation, not a credential: never construct this from policy or client input. */
export interface SecurityFactCut {
 trusted:boolean;generation:string;expectedGeneration:string;
 policyId:string;policyRevision:string;ontologyDocumentId:string;ontologyRevision:string;
 subjects:SecurityFact[];facts:SecurityFact[];
 coverage:{type:SecurityTypeRef;complete:boolean;fields:SecurityTypeRef[]}[];
 context:{field:SecurityTypeRef;value:CoreLiteral}[];
 maxFacts:number;maxSteps:number;
}
export interface SecurityEvaluationRequest {
 action:string;resources:SecurityFact[];output:SecurityTypeRef[];
 targets?:SecurityTypeRef[];
 queryUses?:{field:SecurityTypeRef;operator:SecurityQueryOperator;originalAction?:string}[];
}
export type SecurityOutput={field:SecurityTypeRef;disposition:'withheld'|'absent'}|
 {field:SecurityTypeRef;disposition:'original';value:CoreLiteral}|
 {field:SecurityTypeRef;disposition:'transformed';outputType:SecurityTypeRef;value:CoreLiteral};
export interface SecurityAccessResult {decision:SecurityDecision;output:SecurityOutput[]}
export interface SecurityCollectionResult {status:'evaluated'|'refused';rows:SecurityOutput[][]}
