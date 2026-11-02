import {encodeRequestWire, fromWire, resultError} from './wire.js';

export const SECURITY_PROTECTION_SOURCE_PROFILE = 'umf.security-protection-source/1';

/** Create an opt-in Rust engine for exact protection source and transform-reference resolution. */
export function createSecurityProtectionSourceEngine(execute, ErrorType = Error) {
  if (typeof execute !== 'function') throw new Error('RUST_BINDING_MISSING');
  const run = (op, fields) => {
    const response = JSON.parse(execute(encodeRequestWire({profile: SECURITY_PROTECTION_SOURCE_PROFILE, op, ...fields})));
    const failure = resultError(response);
    if (failure) throw new ErrorType(failure.code, failure.message, failure.path);
    return fromWire(JSON.parse(response.wire));
  };
  return Object.freeze({
    resolveSecurityProtectionSources(policy, catalog) { return run('resolveSecurityProtectionSources', {policy, catalog}); },
    inspectProtectionCatalog(input) { return run('inspectProtectionCatalog', {input}); },
    requireProtectionInterpretation(input) { return run('requireProtectionInterpretation', {input}); },
  });
}
