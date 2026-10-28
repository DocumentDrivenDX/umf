// SPDX-License-Identifier: MIT OR Apache-2.0
export const ACCESS_TEMPORAL_PROFILE = 'umf-access-temporal/0.1.0';

/** Opt-in CONTRACT-075 facade. Host type and refusal precedence stay in JS. */
export function createAccessTemporalOperations(call) {
  return Object.freeze({
    profile: ACCESS_TEMPORAL_PROFILE,
    parseAccessTemporal(kind, token) {
      if (typeof token !== 'string') throw new TypeError('Access temporal requires text');
      if (typeof kind !== 'string') throw new RangeError('Access temporal kind');
      return Object.freeze({...call({profile: ACCESS_TEMPORAL_PROFILE, op: 'parseAccessTemporal', args: {kind, token}})});
    },
  });
}
