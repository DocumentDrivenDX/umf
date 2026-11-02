// SPDX-License-Identifier: MIT OR Apache-2.0
import {test, expect} from 'bun:test';
import {evaluateSecurityWrite} from '../../src/index-node-v4';
import {writeFixture} from './write-fixture';

test('Node V4 Rust Security write admission authorizes permitted updates and refuses missing field authority', () => {
  const f = writeFixture();
  const request = {operation: 'update', original: f.original, proposed: f.proposed};
  expect(evaluateSecurityWrite(f.policy, f.resolution, f.profile, request)).toEqual({decision: 'permit'});

  const denied = writeFixture();
  denied.policy.rules.find(rule => rule.id === 'writer')!.actions = ['create', 'update', 'delete'];
  expect(evaluateSecurityWrite(denied.policy, denied.resolution, denied.profile, {
    operation: 'update', original: denied.original, proposed: denied.proposed,
  })).toEqual({decision: 'deny'});

  const refused = writeFixture();
  refused.profile.fieldActions = [];
  expect(evaluateSecurityWrite(refused.policy, refused.resolution, refused.profile, {
    operation: 'update', original: refused.original, proposed: refused.proposed,
  })).toEqual({decision: 'indeterminate'});
});
