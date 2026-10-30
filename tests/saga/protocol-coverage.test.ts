// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';

test('US-905 protocol coverage manifest is complete and never overstates qualification',async()=>{
 const manifest=JSON.parse(await Bun.file('tests/saga/protocol-coverage.json').text()) as {profile:string;story:string;qualification:string;criteria:Array<{id:string;status:string;testcases:string[];observations:string[];limits:string[]}>};
 expect(manifest.profile).toBe('umf.saga.acceptance-coverage/1');expect(manifest.story).toBe('US-905');expect(manifest.qualification).toContain('inventory-only');
 expect(manifest.criteria.map(row=>row.id)).toEqual(Array.from({length:29},(_,i)=>`US-905-AC${i+1}`));
 for(const row of manifest.criteria){
  expect(['partial','missing','unverified']).toContain(row.status);
  if(row.status==='missing'){expect(row.testcases).toHaveLength(0);expect(row.observations).toHaveLength(0);}
  else expect(row.observations.length).toBeGreaterThan(0);
  expect(row.limits.length).toBeGreaterThan(0);
  for(const testcase of row.testcases){
   const path=testcase.split('::')[0]!;
   expect(await Bun.file(path).exists()).toBe(true);
  }
 }
});
