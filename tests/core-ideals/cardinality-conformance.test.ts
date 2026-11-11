// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {cardinalitySystems,replayCurrentCardinalityAuthor,verifyCardinalityRoundTrips} from '../../scripts/core-ideals/cardinality-conformance';
import {CURRENT_CORE_VERSION} from '../../src';
import postgresqlEvidence from '../../fixtures/validation/cardinality-postgresql-projection-native.json';
import sqlServerEvidence from '../../fixtures/validation/cardinality-sqlserver-projection-native.json';
test('current authored receipts verify in place while historical receipts are re-authored without native inference',()=>{
 let checked=0;
 for(const evidence of [postgresqlEvidence,sqlServerEvidence])for(const row of evidence.rows as any[]){
  const current=replayCurrentCardinalityAuthor(row).target,expected=structuredClone(row.author.target);expected.umf=current.umf;
  expect(current).toEqual(expected);checked++;
  const historical=structuredClone(row);historical.author.source.umf='0.9.0';
  expect(replayCurrentCardinalityAuthor(historical).target).toEqual(expected);
 }
 expect(checked).toBe((postgresqlEvidence.rows as any[]).length+(sqlServerEvidence.rows as any[]).length);
});
test('five Cardinality bindings preserve ideals, native refinements and qualified strict/report outcomes',async()=>{
 const result=await verifyCardinalityRoundTrips();expect(Object.keys(result)).toEqual([...cardinalitySystems]);
 const expected={tablespec:[86,38,336,110],postgresql:[56,26,104,34],sqlserver:[112,40,56,20],avro:[86,30,80,22],parquet:[168,32,120,44]};
 for(const system of cardinalitySystems){
  const r=result[system];expect([r.authoredCases,r.strictBlocks,r.nativeCases,r.nativeBlocks]).toEqual(expected[system]);expect(r.compositions).toBeGreaterThan(0);expect(r.labels).toEqual(['array','map','one','unspecified']);
  expect(r.strictBlocks).toBeGreaterThan(0);expect(r.reportResiduals).toBeGreaterThan(0);
  expect(r.idealRecoveries).toBe((r.authoredCases-r.strictBlocks)*2);
  expect(r.nativeBlocks).toBeGreaterThan(0);expect(r.nativeRecoveries).toBe((r.nativeCases-r.nativeBlocks)*2);
  if(system==='postgresql'||system==='sqlserver'){
   const rows=((system==='postgresql'?postgresqlEvidence:sqlServerEvidence).rows as any[]).filter(row=>row.result.status!=='blocked'),current=rows.filter(row=>row.author.source.umf===CURRENT_CORE_VERSION).length,historical=rows.length-current;
   expect(r.currentReplayCases).toBe(current);expect(r.currentReplayInputsEqual).toBe(current);
   expect(r.historicalReplayCases).toBe(historical);expect(r.historicalReplayInputsEqual).toBe(historical);
  }
 }
},600000);