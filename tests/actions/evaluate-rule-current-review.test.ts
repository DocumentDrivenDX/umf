// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import casesPacket from '../../tests/rust-core/fixtures/r5-actions/evaluate-action-rule/current-source-review-cases.json';
import results from '../../tests/rust-core/fixtures/r5-actions/evaluate-action-rule/current-source-review-results.json';
import {capture,cases} from './evaluate-rule-current-review';

test('current-source evaluator review cases retain exact refusal envelopes',()=>{
 expect(cases as unknown[]).toEqual(casesPacket.cases as unknown[]);
 expect(capture()).toEqual(results);
});
