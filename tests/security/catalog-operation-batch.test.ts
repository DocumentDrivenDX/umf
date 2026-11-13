// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {runCatalogOperationBatchCorpus} from './catalog-operation-batch-corpus';
// This corpus executes 50 cases. Shared CI runners have taken over three minutes.
test('mixed reads and action checks share one atomic logical operation', () => {
  for (const row of runCatalogOperationBatchCorpus()) {
    expect(row.passed, row.id + ': ' + JSON.stringify(row.observed)).toBe(true);
  }
}, 300_000);
