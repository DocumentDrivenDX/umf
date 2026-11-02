// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import predecessor from '../../tests/rust-core/fixtures/r5-actions/evaluate-action-rule/predecessor-results.json';
import predecessorCases from '../../tests/rust-core/fixtures/r5-actions/evaluate-action-rule/predecessor-cases.json';
import {capture,cases} from './evaluate-rule-predecessor';

test('R5 Gate0 evaluateActionRule matches the frozen TypeScript predecessor packet',()=>{
 expect(JSON.stringify(predecessorCases.cases)).toBe(JSON.stringify(cases));
 expect(capture()).toEqual(predecessor);
});
