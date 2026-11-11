// SPDX-License-Identifier: MIT OR Apache-2.0
// Write authorization semantics are owned by the Rust V4 roots.
import type {SecurityFact,SecurityFactCut} from './evaluate';
import type {SecurityDecision} from './logic';
import type {SecurityRef} from './types';

export interface SecurityWriteProfile {
 readProtection:{version:'umf.security.write-read/0.1.0';readAction:string;blindWriteActions:{field:SecurityRef;action:string}[]};
 type:SecurityRef;createAction:string;updateAction:string;deleteAction:string;
 fieldActions:{field:SecurityRef;action:string}[];
 policyAction:string;policyFields:SecurityRef[];
 ownershipAction:string;ownershipFields:SecurityRef[];ownershipAssociations:SecurityRef[];
}
export interface SecurityWriteState {resource:SecurityFact;cut:SecurityFactCut}
export interface SecurityWriteRequest {operation:'create'|'update'|'delete';original?:SecurityWriteState;proposed?:SecurityWriteState}
export interface SecurityWriteResult {decision:SecurityDecision}
