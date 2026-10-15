import {test,expect} from 'bun:test';
import {runQueryValueSourceCorpus} from './query-value-source-corpus';
test('source value domains and authority paths remain distinct before native query admission',()=>{for(const row of runQueryValueSourceCorpus())expect(row.passed,row.id+': '+JSON.stringify(row.observed)).toBe(true);});
