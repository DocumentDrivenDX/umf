import {createHash} from 'node:crypto';
import {test, expect} from 'bun:test';
import {facetSystems, verifyFacetEvidence} from '../../scripts/core-ideals/facets-evidence';
const read = async (path: string) => new Uint8Array(await Bun.file(path).arrayBuffer());
test('facet evidence requires all five accepted bindings without granting ideal admission', async () => {
 const requested:string[]=[];
 const result = await verifyFacetEvidence(path=>{requested.push(path);return read(path);});
 expect(result.systems).toEqual([...facetSystems]); expect(result.records).toHaveLength(6);
 expect(result.fingerprints).toBeGreaterThan(0); expect(result.idealAdmitted).toBe(false); expect(result.nativeEquivalence).toBe(false);
 expect(requested.every(path=>!path.startsWith('/home/erik/Projects/umf/'))).toBe(true);
 const replay=await Bun.file('fixtures/validation/facets-worktree-revalidation.json').json();
 expect(result.revalidated).toHaveLength(Object.keys(replay.changes).length);
 expect(Object.values(replay.driftGroups).flat().sort()).toEqual(Object.keys(replay.changes).sort());
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
  ['facets-parquet-browser', r => r.sha256['/home/erik/Projects/umf/../../outside'] = '0'.repeat(64), 'unsafe evidence path'],
 ];
 for (const [name, change, message] of cases) {
  const path = `fixtures/validation/${name}.json`;
  const value = JSON.parse(new TextDecoder().decode(await read(path))); change(value);
  await expect(verifyFacetEvidence(p => p === path ? Promise.resolve(new TextEncoder().encode(JSON.stringify(value))) : read(p))).rejects.toThrow(message);
 }
 await expect(verifyFacetEvidence(p => p === 'src/model/facets.ts' ? Promise.resolve(new TextEncoder().encode('changed')) : read(p))).rejects.toThrow('stale');
 await expect(verifyFacetEvidence(p => p === 'src/index.ts' ? Promise.resolve(new TextEncoder().encode('changed')) : read(p))).rejects.toThrow('stale');
 await expect(verifyFacetEvidence(p => p.endsWith('parquet-facets-acceptance-evidence.json') ? Promise.reject(Error('missing binding')) : read(p))).rejects.toThrow('missing binding');
}, 120000);

// Exercise the historical-revalidation branch without tying the current proof
// matrix to an obsolete fixed number of changed files.
test('facet evidence validates exact historical-to-current revalidation and rejects unused or forged entries',async()=>{
 const replayPath='fixtures/validation/facets-worktree-revalidation.json';
 const proofPath='fixtures/validation/parquet-facets-acceptance-evidence.json';
 const replay=JSON.parse(new TextDecoder().decode(await read(replayPath)));
 const proof=JSON.parse(new TextDecoder().decode(await read(proofPath)));
 const current=createHash('sha256').update(await read('src/index.ts')).digest('hex');
 const historical='0'.repeat(64);
 proof.sha256['src/index.ts']=historical;
 replay.changes['src/index.ts']={historicalSha256:historical,currentSha256:current};
 replay.driftGroups['synthetic retained checkpoint']=['src/index.ts'];
 const encode=(r:unknown)=>new TextEncoder().encode(JSON.stringify(r));
 const reader=async(p:string)=>p===replayPath?encode(replay):p===proofPath?encode(proof):read(p);
 expect((await verifyFacetEvidence(reader)).revalidated).toEqual(Object.keys(replay.changes).sort());
 replay.changes['src/index.ts'].currentSha256='1'.repeat(64);
 await expect(verifyFacetEvidence(reader)).rejects.toThrow('stale revalidated');
 replay.changes['src/index.ts'].currentSha256=current;
 replay.changes['src/index.ts'].historicalSha256='2'.repeat(64);
 await expect(verifyFacetEvidence(reader)).rejects.toThrow('unapproved historical hash');
 replay.changes['src/index.ts'].historicalSha256=historical;
 proof.sha256['src/index.ts']=current;
 await expect(verifyFacetEvidence(reader)).rejects.toThrow('Unused or missing revalidation entry');
},120000);
