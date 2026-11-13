// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {runCatalogRuleDutyBatchCorpus} from './catalog-rule-duty-batch-corpus';
// This corpus executes 47 cases. Shared CI runners have taken over three minutes.
test('field-free original rule evidence and action duties share one atomic operation', () => {
  for (const c of runCatalogRuleDutyBatchCorpus()) {
    expect(c.observed, c.id).toEqual(c.expected);
  }
}, 300_000);
