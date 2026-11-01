// SPDX-License-Identifier: MIT OR Apache-2.0
import {encodeRequestWire, fromWire, resultError} from './wire.js';

export const SECURITY_POLICY_SOURCE_PROFILE = 'umf.security-policy-source/1';

export function createSecurityPolicySourceEngine(execute, ErrorType = Error) {
  if (typeof execute !== 'function') throw new Error('RUST_BINDING_MISSING');
  const run = (op, fields) => {
    const envelope = JSON.parse(execute(encodeRequestWire({profile: SECURITY_POLICY_SOURCE_PROFILE, op, ...fields})));
    const failure = resultError(envelope);
    if (failure) throw new ErrorType(failure.code, failure.message, failure.path);
    return fromWire(JSON.parse(envelope.wire));
  };
  return Object.freeze({
    inspectSecurityPolicyV2Source(source) { return run('inspectV2', {source}); },
    upgradeSecurityPolicySource(source, revision) { return run('upgrade', {source, revision}); },
    downgradeSecurityPolicySource(source, revision) { return run('downgrade', {source, revision}); },
    readSecuritySource(source, format = 'json') { return run('read', {source, format}).value; },
    writeSecuritySource(value, format = 'json') { return run('write', {value, format}).text; },
  });
}
