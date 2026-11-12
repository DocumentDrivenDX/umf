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
    inspectSecurityActionPurposes(ontology, documents) { return run('inspectActionPurposes', {ontology, documents}); },
    inspectProtectionObligations(policy, catalog, closure, ontology) { return run('inspectProtectionObligations', {policy, catalog, closure, ontology}); },
    inspectCandidateCatalogObligations(policy, catalog, closure, ontology) { return run('inspectCandidateCatalogObligations', {policy, catalog, closure, ontology}); },
    inspectSecurityPolicy(source, resolution) { return run('inspectV1', {source, ...(resolution === undefined ? {} : {resolution})}); },
    inspectSecurityPolicyPayload(payload, path) { return run('inspectPayload', {payload, path}); },
    requireSecurityInterpretation(source, resolution) { return run('requireV1', {source, resolution}); },
    securityPolicyDependencies(source, resolution) { return run('dependencies', {source, resolution}); },
    securityIdentityTransportDependencies(source, resolution) { return run('identityTransportDependencies', {source, resolution}); },
    evaluateSecurityAccess(policy, resolution, cut, request, resource) { return run('evaluateAccess', {policy, resolution, cut, request, resource}); },
    evaluateSecurityCollection(policy, resolution, cut, request) { return run('evaluateCollection', {policy, resolution, cut, request}); },
    evaluateSecurityWrite(policy, resolution, writeProfile, request) { return run('evaluateWrite', {policy, resolution, writeProfile, request}); },
    evaluateSecurityPolicyV2LegacyAccess(source, resolution, cut, request, resource) { return run('evaluateV2LegacyAccess', {source, resolution, cut, request, resource}); },
    validateSecurityDisclosure(batch, policy, resolution) { return run('validateDisclosure', {batch, policy, resolution}); },
    encodeSecurityDisclosure(batch, policy, resolution) { return run('encodeDisclosure', {batch, policy, resolution}).text; },
    decodeSecurityDisclosure(source, policy, resolution) { return run('decodeDisclosure', {source, policy, resolution}); },
    inspectSecurityDisclosureV2(source, policy, catalog, closure) { return run('inspectDisclosureV2', {source, policy, catalog, closure}); },
    encodeSecurityDisclosureV2(source, policy, catalog, closure, format = 'json') { return run('encodeDisclosureV2', {source, policy, catalog, closure, format}).text; },
    decodeSecurityDisclosureV2(source, policy, catalog, closure, format = 'json') { return run('decodeDisclosureV2', {source, policy, catalog, closure, format}); },
    inspectSecurityPolicyV2Source(source) { return run('inspectV2', {source}); },
    upgradeSecurityPolicySource(source, revision) { return run('upgrade', {source, revision}); },
    downgradeSecurityPolicySource(source, revision) { return run('downgrade', {source, revision}); },
    readSecuritySource(source, format = 'json') { return run('read', {source, format}).value; },
    writeSecuritySource(value, format = 'json') { return run('write', {value, format}).text; },
  });
}
