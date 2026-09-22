import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
test('native emitted schemas recover authored facets or explicit residuals and retain native refinements',async()=>{
 const proof=await Bun.file('fixtures/validation/facets-postgresql-composition.json').json();
 expect(proof.serverVersion).toBe(170004);expect(proof.bindingAccepted).toBe(false);
 expect(proof.counts.cases).toBe(145);expect(proof.counts.idealRecoveries).toBe(145);expect(proof.counts.nativeRecoveries).toBe(145);
 expect(proof.counts.exactFacetRecoveries+proof.counts.explicitResiduals).toBe(145);
 for(const [path,sha] of Object.entries(proof.sha256 as Record<string,string>))expect(createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex'),path).toBe(sha);
 for(const row of proof.results)if(!row.recoversAuthoredFacets)expect(row.residuals.length).toBeGreaterThan(0);
 for(const signed of [true,false]){
  const row=proof.results.find((r:any)=>r.name===`bigint-32-${signed}`&&r.encoding==='checked'&&r.mode==='strict');
  expect(row.classified).toEqual({integerWidth:{bits:32,signed}});expect(row.recoversAuthoredFacets).toBe(true);expect(row.residuals).toEqual([]);
 }
 const carrier=proof.results.find((r:any)=>r.name==='facetless-integer'&&r.obligation==='value-domain'&&r.mode==='strict');
 expect(carrier.authored).toEqual({});expect(carrier.nativeRefinements).toEqual({integerWidth:{bits:32,signed:true}});
 const narrowed=proof.results.find((r:any)=>r.name==='facetless-real'&&r.obligation==='exact-input');
 expect(narrowed.residuals.some((r:any)=>r.outcome==='approximated'&&r.reason.includes('1.0000000000000002'))).toBe(true);
});
