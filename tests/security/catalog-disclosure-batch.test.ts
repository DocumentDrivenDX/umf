// SPDX-License-Identifier: MIT OR Apache-2.0
/** @covers US-056-AC6 @covers US-056-AC10 */
import {test,expect} from 'bun:test';
import {runCatalogDisclosureBatchCorpus} from './catalog-disclosure-batch-corpus';
test('canonical atomic disclosure batch retains fold provenance through actual recipes and original codecs',()=>{for(const c of runCatalogDisclosureBatchCorpus())expect(c.passed,c.id).toBe(true);});
