// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {runCurrentQuerySourceCorpus} from './current-query-source-corpus';
test('named current query sources resolve coherently and reject stale or substituted owner sources',()=>{
 for(const row of runCurrentQuerySourceCorpus())expect(row.passed,row.id).toBe(true);
});
