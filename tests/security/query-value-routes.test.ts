import {test,expect} from 'bun:test';
import {runQueryValueRoutesCorpus} from './query-value-routes-corpus';
test('original source modes and guarded value-domain alternatives remain distinct',()=>{for(const row of runQueryValueRoutesCorpus())expect(row.passed,row.id+': '+JSON.stringify(row.observed)).toBe(true);});
