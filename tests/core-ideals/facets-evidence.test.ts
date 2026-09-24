import {test, expect} from 'bun:test';
import {facetSystems, verifyFacetEvidence} from '../../scripts/core-ideals/facets-evidence';
const read = async (path: string) => new Uint8Array(await Bun.file(path).arrayBuffer());
test('facet evidence requires all five accepted bindings without granting ideal admission', async () => {
 const result = await verifyFacetEvidence();
 expect(result.systems).toEqual([...facetSystems]); expect(result.records).toHaveLength(6);
 expect(result.fingerprints).toBeGreaterThan(0); expect(result.idealAdmitted).toBe(false); expect(result.nativeEquivalence).toBe(false);
}, 120000);
test('facet evidence refuses missing, stale, failed, unsafe and incompatible proofs', async () => {
 const cases: [string, (r: any) => void, string][] = [
  ['facet-core-acceptance-evidence', r => delete r.sha256['spec/core/facet-operation.schema.json'], 'missing required proof'],
  ['parquet-facets-acceptance-evidence', r => delete r.sha256['fixtures/validation/facets-parquet-native.json'], 'missing required proof'],
  ['avro-facets-acceptance-evidence', r => r.bindingAccepted = false, 'not accepted'],
  ['sqlserver-facets-acceptance-evidence', r => r.nativeEquivalence = true, 'unexpected equivalence claim'],
  ['field-gate-refresh-evidence', r => r.runs[0].exitCode = 1, 'failed command'],
  ['field-gate-refresh-evidence', r => r.runs = r.runs.filter((x: any) => !x.command.includes('scripts/core-ideals/facets-parquet-oracle.ts')), 'missing refresh command'],
  ['facets-postgresql-native', r => r.serverVersion = 170005, '170004'],
  ['facets-avro-native', r => r.runs.pop(), 'incomplete command matrix'],
  ['facets-tablespec-browser', r => r.externalRequests = ['https://example.invalid'], 'external browser requests'],
  ['facets-parquet-browser', r => r.sha256['../../outside'] = '0'.repeat(64), 'unsafe evidence path'],
  ['facets-parquet-browser', r => r.sha256['/etc/passwd'] = '0'.repeat(64), 'unsafe evidence path'],
 ];
 for (const [name, change, message] of cases) {
  const path = `fixtures/validation/${name}.json`;
  const value = JSON.parse(new TextDecoder().decode(await read(path))); change(value);
  await expect(verifyFacetEvidence(p => p === path ? Promise.resolve(new TextEncoder().encode(JSON.stringify(value))) : read(p))).rejects.toThrow(message);
 }
 await expect(verifyFacetEvidence(p => p === 'src/model/facets.ts' ? Promise.resolve(new TextEncoder().encode('changed')) : read(p))).rejects.toThrow('stale');
 await expect(verifyFacetEvidence(p => p.endsWith('parquet-facets-acceptance-evidence.json') ? Promise.reject(Error('missing binding')) : read(p))).rejects.toThrow('missing binding');
}, 120000);
