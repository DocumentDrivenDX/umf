import {test,expect} from 'bun:test';
import {runReadProjectionCorpus} from './read-projection-corpus';
test('operator-free original read projection alternatives preserve meaning without query grants',()=>{for(const row of runReadProjectionCorpus())expect(row.observed,row.id).toEqual(row.expected);});
