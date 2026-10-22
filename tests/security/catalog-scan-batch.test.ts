// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {runCatalogScanBatchCorpus} from './catalog-scan-batch-corpus';
test('complete multi-scan logical preparation is atomic with one operation budget',()=>{for(const row of runCatalogScanBatchCorpus())expect(row.passed,row.id+': '+JSON.stringify(row.observed)).toBe(true);});
