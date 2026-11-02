import {encodeRequestWire, fromWire, resultError} from './wire.js';

export const SECURITY_PROTECTION_PARAMETERS_PROFILE = 'umf.security-parameters/1';

/** Create an opt-in engine for bounded CONTRACT-062 typed literal admission. */
export function createSecurityProtectionParametersEngine(execute, ErrorType = Error) {
  if (typeof execute !== 'function') throw new Error('RUST_BINDING_MISSING');
  return Object.freeze({
    validateProtectionParameters(policy, catalog, closure) {
      const wire = encodeRequestWire({
        profile: SECURITY_PROTECTION_PARAMETERS_PROFILE,
        op: 'validateProtectionParameters',
        policy,
        catalog,
        closure,
      });
      const response = JSON.parse(execute(wire));
      const failure = resultError(response);
      if (failure) throw new ErrorType(failure.code, failure.message, failure.path);
      return fromWire(JSON.parse(response.wire));
    },
  });
}
