import {test,expect} from 'bun:test';
import * as api from '../../src/index';
import {runActionCaseCorpus} from './case-corpus';
import vectors from '../../fixtures/actions/cases.json';
test('@covers US-078-AC1 @covers US-078-AC3 @covers US-078-AC4 @covers US-078-AC6 @covers US-078-AC8 @covers US-078-AC9: language-neutral declaration corpus checks independent expected decisions',()=>{
 const results=runActionCaseCorpus(api);expect(results.map(r=>r.id)).toEqual(vectors.cases.map(v=>v.id));expect(results.length).toBe(44);
});
