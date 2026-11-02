// SPDX-License-Identifier: MIT OR Apache-2.0
import {test, expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {validateBulkOutcome} from '../src/index-node-v4';
import type {ActionPlanArtifact} from '../src/extensions/actions/plan-types';
const artifact = (value: unknown): ActionPlanArtifact => {
  const utf8 = JSON.stringify(value);
  return {mediaType: 'application/json', utf8, sha256: createHash('sha256').update(utf8).digest('hex')};
};
test('Node V4 bulk result public root validates a complete not-found union through Rust', () => {
  const source = artifact({status: 'not-found'});
  const result = validateBulkOutcome(source);
  expect(result.valid).toBe(true);
  expect(result.source).toEqual(source);
  expect(result.diagnostics).toEqual([]);
});
test('Node V4 bulk result public root refuses incomplete control-failure meaning', () => {
  const result = validateBulkOutcome(artifact({status: 'failed', code: 'PAP_CONTROL_NONCOMMIT'}));
  expect(result.valid).toBe(false);
  expect(result.diagnostics[0]?.code).toBe('PAP_INVALID');
});
