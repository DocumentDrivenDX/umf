// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import casesPacket from '../../tests/rust-core/fixtures/r5-actions/evaluate-action-rule/numeric-source-review-cases.json';
import results from '../../tests/rust-core/fixtures/r5-actions/evaluate-action-rule/numeric-source-review-results.json';
import sourceHashes from '../../tests/rust-core/fixtures/r5-actions/evaluate-action-rule/numeric-source-review-hashes.json';
import {capture,cases} from './evaluate-rule-numeric-review';

test('numeric current-source cases preserve exact values and refusals',()=>{
 expect(cases as unknown[]).toEqual(casesPacket.cases as unknown[]);
 expect(capture()).toEqual(results);
});
test('numeric current-source receipt verifies source closure',()=>{
 expect(Bun.version).toBe(sourceHashes.runtime.bun);
 for(const [path,expected] of Object.entries(sourceHashes.sha256))expect(createHash('sha256').update(readFileSync(path as string)).digest('hex')).toBe(expected as string);
});
