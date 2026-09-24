import {test, expect} from 'bun:test';
import {facetSystems, verifyFacetEvidence} from '../../scripts/core-ideals/facets-evidence';
import {verifyFacetRoundTrips} from '../../scripts/core-ideals/facets-roundtrips';

test('all five facet bindings preserve authored ideals, native refinements and explicit losses', async () => {
 // Require current independent native/browser qualification before interpreting
 // the captured SQL catalogs as observations of emitted targets.
 await verifyFacetEvidence();
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
