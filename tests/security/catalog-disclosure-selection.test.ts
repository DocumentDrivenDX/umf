// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {runCatalogDisclosureSelectionCorpus} from './catalog-disclosure-selection-corpus';
test('canonical disclosure selection retains exact source occurrences without granting native authority',()=>{for(const c of runCatalogDisclosureSelectionCorpus())expect(c.passed,c.id).toBe(true);});
