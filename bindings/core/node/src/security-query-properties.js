import {encodeRequestWire, fromWire, resultError} from './wire.js';

export const SECURITY_QUERY_PROPERTIES_PROFILE = 'umf.security-queries/1';

/** Create an opt-in Rust engine for bounded conditional protection-query property checks. */
export function createSecurityQueryPropertiesEngine(execute, ErrorType = Error) {
  if (typeof execute !== 'function') throw new Error('RUST_BINDING_MISSING');
  return Object.freeze({
    inspectProtectionQueryProperties(policy, catalog, closure, use) {
      const wire = encodeRequestWire({
        profile: SECURITY_QUERY_PROPERTIES_PROFILE,
        op: 'inspectProtectionQueryProperties',
        policy,
        catalog,
        closure,
        use,
      });
      const response = JSON.parse(execute(wire));
      const failure = resultError(response);
      if (failure) throw new ErrorType(failure.code, failure.message, failure.path);
      return fromWire(JSON.parse(response.wire));
    },
  });
}
