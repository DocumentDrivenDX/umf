// SPDX-License-Identifier: MIT OR Apache-2.0
import {test, expect} from 'bun:test';
import sourcePacket from '../rust-core/fixtures/r8-security-protection-resolution/predecessor.json';
import parameterPacket from '../rust-core/fixtures/r8-security-protection-parameters/predecessor.json';
import {resolveSecurityProtectionSources, resolveSecurityProtectionDomains, validateProtectionParameters} from '../../src/index-node-v4';

const sourceCase = sourcePacket.cases[0]!.sources;
const parameterCase = parameterPacket.cases[0]!.sources;

test('V4 source resolver uses Rust for exact policy and catalog pins', () => {
  const result = resolveSecurityProtectionSources(sourceCase.policy, sourceCase.catalog);
  expect(result.status).toBe('resolved-source');
  expect(result.references).toEqual([{ruleIndex: 0, disclosureIndex: 0, transformIndex: 0}]);
  expect(result.authority).toBe(false);
});

test('V4 source resolver refuses a mismatched catalog revision', () => {
  const policy = structuredClone(sourceCase.policy);
  policy.protection.revision = 'stale';
  const result = resolveSecurityProtectionSources(policy, sourceCase.catalog);
  expect(result.status).toBe('refused');
  expect(result.diagnostics.some(item => item.code === 'SECURITY_PROTECTION_PIN')).toBe(true);
});

test('V4 parameter validator admits typed values and refuses a field mismatch', () => {
  const valid = validateProtectionParameters(parameterCase.policy, parameterCase.catalog, parameterCase.closure);
  expect(valid.status).toBe('validated-parameters');
  expect(valid.validated).toHaveLength(2);

  const catalog = structuredClone(parameterCase.catalog);
  catalog.transforms[0]!.parameters[0]!.field.elementId = 'missing';
  const refused = validateProtectionParameters(parameterCase.policy, catalog, parameterCase.closure);
  expect(refused.status).toBe('refused');
  expect(refused.validated).toEqual([]);
  expect(refused.diagnostics.some(item => item.code === 'PROTECTION_DOMAIN_REFERENCE')).toBe(true);
});


test('V4 domain resolver resolves exact pinned core fields and refuses a missing reference', () => {
  const valid = resolveSecurityProtectionDomains(parameterCase.policy, parameterCase.catalog, parameterCase.closure);
  expect(valid.status).toBe('resolved-domains');
  expect(valid.domains.length).toBeGreaterThan(0);
  const closure = structuredClone(parameterCase.closure);
  closure.documents[0]!.document.modules[0]!.elements = [];
  const refused = resolveSecurityProtectionDomains(parameterCase.policy, parameterCase.catalog, closure);
  expect(refused.status).toBe('refused');
  expect(refused.domains).toEqual([]);
  expect(refused.diagnostics.some(item => item.code === 'PROTECTION_DOMAIN_DOCUMENT' || item.code === 'PROTECTION_DOMAIN_REFERENCE')).toBe(true);
});
