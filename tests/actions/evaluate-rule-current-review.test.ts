// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import casesPacket from '../../tests/rust-core/fixtures/r5-actions/evaluate-action-rule/current-source-review-cases.json';
import results from '../../tests/rust-core/fixtures/r5-actions/evaluate-action-rule/current-source-review-results.json';
import sourceHashes from '../../tests/rust-core/fixtures/r5-actions/evaluate-action-rule/current-source-review-hashes.json';
import {capture,cases} from './evaluate-rule-current-review';

test('current-source evaluator review cases retain exact refusal envelopes',()=>{
 expect(cases as unknown[]).toEqual(casesPacket.cases as unknown[]);
 expect(capture()).toEqual(results);
});

test('current-source capture verifies its transitive source/resource closure',()=>{
 expect(Bun.version).toBe(sourceHashes.runtime.bun);
 for(const [path,expected] of Object.entries(sourceHashes.sha256)){
  expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(expected);
 }
});
