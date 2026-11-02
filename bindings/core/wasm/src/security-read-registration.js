// SPDX-License-Identifier: MIT OR Apache-2.0
import {encodeRequestWire, fromWire, resultError} from './wire.js';

export const SECURITY_READ_REGISTRATION_PROFILE = 'umf.security-read-registration/1';

export function createSecurityReadRegistrationEngine(createExecutor, ErrorType = Error) {
  if (typeof createExecutor !== 'function') throw new Error('RUST_BINDING_MISSING');
  return Object.freeze({
    createSession() {
      const execute = createExecutor();
      if (typeof execute !== 'function') throw new Error('RUST_BINDING_MISSING');
      const run = (op, fields) => {
        const envelope = JSON.parse(execute(encodeRequestWire({profile: SECURITY_READ_REGISTRATION_PROFILE, op, ...fields})));
        const failure = resultError(envelope);
        if (failure) throw new ErrorType(failure.code, failure.message, failure.path);
        return fromWire(JSON.parse(envelope.wire));
      };
      return Object.freeze({
        registerSecurityRead(policy, resolution) { return run('register', {policy, resolution}).handle; },
        evaluateSecurityRead(handle, cut, request) { return run('evaluate', {handle, cut, request}); },
      });
    },
  });
}
