// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import predecessor from '../../docs/helix/04-build/evidence/rust-migration/r5-actions/evaluate-action-rule/predecessor-results.json';
import predecessorCases from '../../docs/helix/04-build/evidence/rust-migration/r5-actions/evaluate-action-rule/predecessor-cases.json';
import sourceHashes from '../../docs/helix/04-build/evidence/rust-migration/r5-actions/evaluate-action-rule/source-hashes.json';
import {capture,cases} from './evaluate-rule-predecessor';

test('R5 Gate0 evaluateActionRule matches the frozen TypeScript predecessor packet',()=>{
 expect(JSON.stringify(predecessorCases.cases)).toBe(JSON.stringify(cases));
 expect(capture()).toEqual(predecessor);
});

test('R5 Gate0 packet verifies every recorded predecessor and fixture source hash',()=>{
 expect(Bun.version).toBe(sourceHashes.runtime.bun);
 for(const [path,expected] of Object.entries(sourceHashes.sha256)){
  const actual=createHash('sha256').update(readFileSync(path)).digest('hex');
  expect(actual).toBe(expected);
 }
});
