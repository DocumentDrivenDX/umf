// SPDX-License-Identifier: MIT OR Apache-2.0
// Registered security reads are implemented by the Rust V4 roots.
import type {SecurityCollectionResult,SecurityEvaluationRequest,SecurityFactCut} from './evaluate';
import type {SecurityPolicy,SecurityResolution} from './types';

export interface SecurityReadHandle {readonly kind:'registered-security-read'}
export interface SecurityReadRegistration {
 register(policy:unknown,resolution:SecurityResolution):SecurityReadHandle;
 evaluate(handle:SecurityReadHandle,cut:SecurityFactCut,request:SecurityEvaluationRequest):SecurityCollectionResult;
}
