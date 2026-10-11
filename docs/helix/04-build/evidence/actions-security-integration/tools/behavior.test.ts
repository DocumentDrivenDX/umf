import {test,expect} from 'bun:test';
import assert from 'node:assert/strict';
import {facetSystems} from '/work/scripts/core-ideals/facets-evidence';
import {verifyFacetRoundTrips} from '/work/scripts/core-ideals/facets-roundtrips';
import {keySystems} from '/work/scripts/core-ideals/key-evidence';
import {verifyKeyAuthoredRoundTrips,verifyKeyIdentityConflicts} from '/work/scripts/core-ideals/key-roundtrips';
import {verifyKeyNativeRoundTrips} from '/work/scripts/core-ideals/key-native-roundtrips';
import {verifyRelationshipBindingRoundTrips} from '/work/scripts/core-ideals/relationship-conformance';
import {relationshipTests} from '/work/scripts/core-ideals/relationship-gate-inputs';
test('merged facet behavioral assertions; admission remains baseline scoped',async()=>{
 const coverage = await verifyFacetRoundTrips((system, index) => console.log(`facets ${system} ${index}`));
 const expected = {tablespec: [540, 331], postgresql: [232, 145], sqlserver: [238, 145], avro: [576, 397], parquet: [216, 177]};
 expect(Object.keys(coverage)).toEqual([...facetSystems]);
 for (const system of facetSystems) {
  const c = coverage[system];
  expect([c.authoredCases, c.projected]).toEqual(expected[system]);
  expect(c.strictBlocks + c.reportBlocks + c.projected).toBe(c.authoredCases);
  expect(c.idealRecoveries).toBe(c.projected * 2);
  expect(c.nativeRecoveries).toBe((c.projected * 2 - c.classificationBlocks) * 2);
  expect(c.reportResiduals).toBeGreaterThan(0); expect(c.floatNarrowing).toBeGreaterThan(0);
  expect(c.nonemptyMatches).toBeGreaterThan(0); expect(c.residualComparisons).toBeGreaterThan(0);
 }
 expect(facetSystems.filter(s => coverage[s].usefulExactMappings > 0).length).toBeGreaterThanOrEqual(2);
},1800000);
test('merged Key recoveries and identity conflicts; admission remains baseline scoped',async()=>{
 const authored=await verifyKeyAuthoredRoundTrips();
 const conflicts=await verifyKeyIdentityConflicts();
 const native=await verifyKeyNativeRoundTrips();
 const usefulSystems=keySystems.filter(s=>authored[s]!.usefulStoredValueMappings>0);
 assert.deepEqual(usefulSystems,['postgresql','sqlserver'],'two useful enforced down-projections required');
 for(const system of keySystems){
  assert.ok(authored[system]!.recoveries>0 && native[system]!.recoveries>0);
  assert.equal(conflicts[system],4);
 }
 expect(Object.keys(native)).toHaveLength(5);
},120000);
test('merged relationship binding replay launches the complete nine-file suite',async()=>{
 const result=await verifyRelationshipBindingRoundTrips();
 expect(relationshipTests).toHaveLength(9);expect(result.command).toEqual(['bun','test',...relationshipTests]);expect(result.failed).toBe(0);expect(result.passed).toBeGreaterThan(0);
 console.log(JSON.stringify({mergedRelationshipBindingReplay:result}));
},300000);
