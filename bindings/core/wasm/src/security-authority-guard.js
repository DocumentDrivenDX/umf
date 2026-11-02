// SPDX-License-Identifier: MIT OR Apache-2.0
import {encodeRequestWire, fromWire, resultError} from './wire.js';

export const SECURITY_AUTHORITY_GUARD_PROFILE = 'umf.security-authority-guard/1';

export function createSecurityAuthorityGuardEngine(createExecutor, ErrorType = Error) {
  if (typeof createExecutor !== 'function') throw new Error('RUST_BINDING_MISSING');
  return Object.freeze({
    createSession(generation) {
      const execute = createExecutor();
      if (typeof execute !== 'function') throw new Error('RUST_BINDING_MISSING');
      const run = (op, fields = {}) => {
        const envelope = JSON.parse(execute(encodeRequestWire({profile: SECURITY_AUTHORITY_GUARD_PROFILE, op, ...fields})));
        const failure = resultError(envelope);
        if (failure) throw new ErrorType(failure.code, failure.message, failure.path);
        return fromWire(JSON.parse(envelope.wire));
      };
      run('initialize', {generation});
      return Object.freeze({
        beginRead() { return run('beginRead').generation; },
        beginChange(next) { return run('beginChange', {generation: next}).token; },
        completeChange(token, committed) { run('completeChange', {token, committed}); },
        close() { run('close'); },
      });
    },
  });
}
