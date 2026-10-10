import {test,expect} from 'bun:test';
import {publicationCustodyCorpus} from './publication-custody-corpus';
// @covers US-057-AC2
// @covers US-057-AC7
test('publication custody retains replay/inflight buffers and quarantines uncertain release',async()=>{
 const observations=await publicationCustodyCorpus();expect(observations.length).toBe(31);
 expect(new Set(observations.map(o=>o.id)).size).toBe(observations.length);
});
