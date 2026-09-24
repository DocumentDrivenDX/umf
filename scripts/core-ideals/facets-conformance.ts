import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {facetSystems, verifyFacetEvidence} from './facets-evidence';
import {verifyFacetRoundTrips} from './facets-roundtrips';

if (import.meta.main) {
 const evidence = await verifyFacetEvidence();
 const coverage = await verifyFacetRoundTrips((system, index) => console.log(JSON.stringify({system, index})));
 assert.deepEqual(await verifyFacetEvidence(), evidence, 'Qualification evidence changed during conformance');
 const exactInputPath = 'fixtures/validation/facets-avro-exact-input-browser.json';
 const exactInput = await Bun.file(exactInputPath).json();
 assert.match(exactInput.browser, /^148\./); assert.deepEqual(exactInput.externalRequests, []);
 assert.deepEqual(exactInput.checks, {cases:18,projected:9,blocked:9,idealRecoveries:18,nativeRecoveries:18,exactFacetRecoveries:9,explicitResiduals:0,forgedRejected:true,getterCalls:0});
 for (const [p, h] of Object.entries(exactInput.sha256)) assert.equal(createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex'), h, `Stale additional browser proof: ${p}`);
 const usefulSystems = facetSystems.filter(s => coverage[s].usefulExactMappings > 0);
 const paths = ['scripts/core-ideals/facets-conformance.ts', 'scripts/core-ideals/facets-evidence.ts', 'scripts/core-ideals/facets-roundtrips.ts', 'tests/core-ideals/facets-conformance.test.ts', 'tests/core-ideals/facets-evidence.test.ts', exactInputPath, ...Object.keys(exactInput.sha256), ...evidence.records.map(r => r.path), 'fixtures/validation/field-gate-refresh-evidence.json'];
 const sha256 = Object.fromEntries(await Promise.all(paths.map(async p => [p, createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 const result = {scope: 'Qualified scalar facet bindings across the five priority systems; retained recovery does not establish native equivalence', idealAdmitted: true, priorityDelivery: true, nativeEquivalence: false, usefulSystems, evidence, coverage, limits: ['Profiles and native versions remain bounded by each binding acceptance record', 'Matching facets do not erase native refinements, execution differences or other residuals', 'SQL recovery preserves captured catalogs; arbitrary DDL or live database discovery is not claimed', 'Unknown extension content remains attached; no native concept is replaced'], sha256};
 await Bun.write('fixtures/validation/facets-conformance.json', JSON.stringify(result, null, 2) + '\n');
 console.log(JSON.stringify({idealAdmitted: true, priorityDelivery: true, nativeEquivalence: false, usefulSystems, coverage}));
}
