import {encodeRequestWire, fromWire, resultError} from './wire.js';

export const SECURITY_PROTECTION_SOURCE_PROFILE = 'umf.security-protection-source/1';

/** Create an opt-in Rust engine for exact protection source and transform-reference resolution. */
export function createSecurityProtectionSourceEngine(execute, ErrorType = Error) {
  if (typeof execute !== 'function') throw new Error('RUST_BINDING_MISSING');
  return Object.freeze({
    resolveSecurityProtectionSources(policy, catalog) {
      const wire = encodeRequestWire({
        profile: SECURITY_PROTECTION_SOURCE_PROFILE,
        op: 'resolveSecurityProtectionSources',
        policy,
        catalog,
      });
      const response = JSON.parse(execute(wire));
      const failure = resultError(response);
      if (failure) throw new ErrorType(failure.code, failure.message, failure.path);
      return fromWire(JSON.parse(response.wire));
    },
  });
}
