// SPDX-License-Identifier: MIT OR Apache-2.0
export const ACCESS_TEMPORAL_PROFILE='umf-access-temporal/0.1.0' as const;
export type AccessTemporalKind='date'|'instant'|'local';
interface AccessTemporalBase {
 readonly profile:typeof ACCESS_TEMPORAL_PROFILE;
 readonly originalText:string;
 readonly canonicalText:string;
}
export interface AccessDate extends AccessTemporalBase {readonly kind:'date'}
export interface AccessLocal extends AccessTemporalBase {readonly kind:'local';readonly microsecond:number}
export interface AccessInstant extends AccessTemporalBase {
 readonly kind:'instant'; readonly microsecond:number;
 /** Whole UTC seconds since Unix epoch, rounding toward negative infinity. */
 readonly utcSeconds:string;
 readonly originalOffset:string;
}
export type AccessTemporal=AccessDate|AccessLocal|AccessInstant;
