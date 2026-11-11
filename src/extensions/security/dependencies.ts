// SPDX-License-Identifier: MIT OR Apache-2.0
// Security dependency reports are computed by the Rust V4 roots.
import type {SecurityRef} from './types';

export interface SecurityDependencies {fields:SecurityRef[];associations:SecurityRef[]}
export interface SecurityIdentityTransportDependencies extends SecurityDependencies {
 policyFields:SecurityRef[];
 records:{type:SecurityRef;keyId:string;keyFields:SecurityRef[];endpoints:{role:string;target:SecurityRef;fields:SecurityRef[]}[]}[];
}
