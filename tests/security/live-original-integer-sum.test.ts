import {test,expect} from 'bun:test';
import {runLiveOriginalIntegerSumCorpus} from './live-original-integer-sum-corpus';
test('distinct live-original SUM source retains read mask and independent membership/action controls',()=>{for(const row of runLiveOriginalIntegerSumCorpus().checks)expect(row.observed,row.id).toEqual(row.expected);});
