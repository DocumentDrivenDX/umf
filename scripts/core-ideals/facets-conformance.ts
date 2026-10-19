// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {facetSystems, verifyFacetEvidence} from './facets-evidence';
import {verifyFacetRoundTrips} from './facets-roundtrips';

export function facetConformanceStatus(evidence: {historicalQualification: string; currentCoreQualification: string}, usefulSystems: readonly string[]) {
 return {scope: 'Current source round trips verified; historical native evidence is partially revalidated and current-core native qualification is unavailable',
  idealAdmitted: false, sourceOperationsVerified: true, sourceUsefulSystems: [...usefulSystems],
  historicalQualification: evidence.historicalQualification, currentNativeQualification: evidence.currentCoreQualification,
  priorityDelivery: false, qualifiedBindings: 0, nativeEquivalence: false};
}

if (import.meta.main) {
 const evidence = await verifyFacetEvidence(undefined, {allowUnqualifiedHistorical: true});
 const coverage = await verifyFacetRoundTrips((system, index) => console.log(JSON.stringify({system, index})));
 assert.deepEqual(await verifyFacetEvidence(undefined, {allowUnqualifiedHistorical: true}), evidence, 'Qualification evidence changed during conformance');
 const exactInputPath = 'fixtures/validation/facets-avro-exact-input-browser.json';
 const exactInput = await Bun.file(exactInputPath).json();
 assert.equal(exactInput.browser,(await Bun.file('fixtures/validation/field-gate-refresh-evidence.json').json()).browser??'148.0.7778.0'); assert.deepEqual(exactInput.externalRequests, []);
 assert.deepEqual(exactInput.checks, {cases:18,projected:9,blocked:9,idealRecoveries:18,nativeRecoveries:18,exactFacetRecoveries:9,explicitResiduals:0,forgedRejected:true,getterCalls:0});
 for (const [p, h] of Object.entries(exactInput.sha256)) assert.equal(createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex'), h, `Stale additional browser proof: ${p}`);
 const usefulSystems = facetSystems.filter(s => coverage[s].usefulExactMappings > 0);
 const paths = ['scripts/core-ideals/facets-conformance.ts', 'scripts/core-ideals/facets-evidence.ts', 'scripts/core-ideals/facets-roundtrips.ts', 'tests/core-ideals/facets-conformance.test.ts', 'tests/core-ideals/facets-evidence.test.ts', 'fixtures/validation/facets-worktree-revalidation.json', exactInputPath, ...Object.keys(exactInput.sha256), ...evidence.records.map(r => r.path), 'fixtures/validation/field-gate-refresh-evidence.json'];
 const sha256 = Object.fromEntries(await Promise.all(paths.map(async p => [p, createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 const status = facetConformanceStatus(evidence, usefulSystems);
 const result = {...status, nativeEvidenceSystems: facetSystems, evidence, coverage, limits: ['Source round trips preserve authored meanings but do not establish current native qualification', 'Profiles and native versions remain bounded by each historical binding acceptance record', 'Matching facets do not erase native refinements, execution differences or other residuals', 'SQL recovery preserves captured catalogs; arbitrary DDL or live database discovery is not claimed', 'Unknown extension content remains attached; no native concept is replaced'], sha256};
 await Bun.write('fixtures/validation/facets-conformance.json', JSON.stringify(result, null, 2) + '\n');
 console.log(JSON.stringify({...status, coverage}));
}
