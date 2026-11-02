import {encodeRequestWire, fromWire, resultError} from './wire.js';

export const SECURITY_DOMAINS_PROFILE = 'umf.security-domains/1';

export function createSecurityProtectionDomainsEngine(execute, ErrorType = Error) {
  if (typeof execute !== 'function') throw new Error('RUST_BINDING_MISSING');
  return Object.freeze({
    resolveSecurityProtectionDomains(policy, catalog, closure) {
      const wire = encodeRequestWire({profile: SECURITY_DOMAINS_PROFILE, op: 'resolveSecurityProtectionDomains', policy, catalog, closure});
      const response = JSON.parse(execute(wire));
      const failure = resultError(response);
      if (failure) throw new ErrorType(failure.code, failure.message, failure.path);
      return fromWire(JSON.parse(response.wire));
    },
  });
}
