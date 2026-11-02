// SPDX-License-Identifier: MIT OR Apache-2.0
import {test, expect} from 'bun:test';
import {evaluateSecurityPolicyV2LegacyAccess} from '../../src/index-node-v4';
import {ref} from './fixture';
import {evaluationFixture} from './evaluation-fixture';

test('Node V4 Rust Security V2 legacy access preserves source and delegates body decisions to the native evaluator', () => {
  const f = evaluationFixture();
  const source = {...f.policy, version: '0.2.0'};
  const result = evaluateSecurityPolicyV2LegacyAccess(
    source,
    f.resolution,
    f.cut,
    {action: 'read', output: [ref('salary')]},
    f.resource,
  ) as {source: unknown; subset: string; authority: boolean; result: {decision: string}};
  expect(result.source).toEqual(source);
  expect(result.subset).toBe('legacy-body-0.1');
  expect(result.authority).toBe(false);
  expect(result.result.decision).toBe('permit');

  const refused = evaluateSecurityPolicyV2LegacyAccess(
    f.policy,
    f.resolution,
    f.cut,
    {action: 'read', output: [ref('salary')]},
    f.resource,
  ) as {result: {decision: string}};
  expect(refused.result.decision).toBe('indeterminate');
});
