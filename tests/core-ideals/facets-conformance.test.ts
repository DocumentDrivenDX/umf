import {test, expect} from 'bun:test';
import {facetSystems, verifyFacetEvidence} from '../../scripts/core-ideals/facets-evidence';
import {facetConformanceStatus} from '../../scripts/core-ideals/facets-conformance';
import {verifyFacetRoundTrips} from '../../scripts/core-ideals/facets-roundtrips';

test('facet status emitter cannot promote partial historical evidence to native admission', async () => {
 const evidence=await verifyFacetEvidence(undefined,{allowUnqualifiedHistorical:true});
 expect(facetConformanceStatus(evidence,facetSystems)).toMatchObject({idealAdmitted:false,sourceOperationsVerified:true,currentNativeQualification:'UNQUALIFIED',historicalQualification:'PARTIALLY_REVALIDATED',priorityDelivery:false,qualifiedBindings:0,nativeEquivalence:false});
});

test('all five facet bindings preserve authored ideals, native refinements and explicit losses', async () => {
 // Require current independent native/browser qualification before interpreting
 // the captured SQL catalogs as observations of emitted targets.
 const historical=await verifyFacetEvidence(undefined,{allowUnqualifiedHistorical:true});
 expect(historical.historicalQualification).toBe('PARTIALLY_REVALIDATED');
 expect(historical.currentCoreQualification).toBe('UNQUALIFIED');
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
}, 1800000);
