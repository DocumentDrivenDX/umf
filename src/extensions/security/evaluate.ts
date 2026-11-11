// SPDX-License-Identifier: MIT OR Apache-2.0
// Access and collection semantics are owned by the Rust V4 roots.
import type {CoreKeyTupleValue} from '../../model/key-tuple';
import type {CoreLiteral} from '../../model/schema-literals';
import type {SecurityDecision,SecurityQueryOperator,SecurityRef} from './types';

export interface SecurityFact {
 type:SecurityRef;key:CoreKeyTupleValue[];
 fields:{field:SecurityRef;value:CoreLiteral}[];
 absent:SecurityRef[];
}
/** Host attestation, not a credential: never construct this from policy or client input. */
export interface SecurityFactCut {
 trusted:boolean;generation:string;expectedGeneration:string;
 policyId:string;policyRevision:string;ontologyDocumentId:string;ontologyRevision:string;
 subjects:SecurityFact[];facts:SecurityFact[];
 coverage:{type:SecurityRef;complete:boolean;fields:SecurityRef[]}[];
 context:{field:SecurityRef;value:CoreLiteral}[];
 maxFacts:number;maxSteps:number;
}
export interface SecurityEvaluationRequest {
 action:string;resources:SecurityFact[];output:SecurityRef[];
 targets?:SecurityRef[];
 queryUses?:{field:SecurityRef;operator:SecurityQueryOperator;originalAction?:string}[];
}
export type SecurityOutput={field:SecurityRef;disposition:'withheld'|'absent'}|
 {field:SecurityRef;disposition:'original';value:CoreLiteral}|
 {field:SecurityRef;disposition:'transformed';outputType:SecurityRef;value:CoreLiteral};
export interface SecurityAccessResult {decision:SecurityDecision;output:SecurityOutput[]}
export interface SecurityCollectionResult {status:'evaluated'|'refused';rows:SecurityOutput[][]}
