import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {isAbsolute, relative, resolve} from 'node:path';

export const facetSystems = ['tablespec', 'postgresql', 'sqlserver', 'avro', 'parquet'] as const;
export type FacetSystem = typeof facetSystems[number];
export type FacetEvidenceReader = (path: string) => Promise<Uint8Array>;
const read: FacetEvidenceReader = async path => new Uint8Array(await Bun.file(path).arrayBuffer());
const file = (name: string) => `fixtures/validation/${name}.json`;
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Checks retained proof consistency, not authentication or fresh native execution.
 * Passing this check alone does not admit the ideal: executable round trips and
 * useful nonempty authored mappings remain separate admission requirements.
 */
export async function verifyFacetEvidence(reader: FacetEvidenceReader = read) {
 const bytes = new Map<string, Uint8Array>();
 const proofs = new Map<string, any>();
 const pending: {path: string; record: any}[] = [];
 let fingerprints = 0;
 function local(path: string) {
  const p = relative(process.cwd(), resolve(path));
  assert.ok(path && !isAbsolute(p) && !p.split('/').includes('..'), `unsafe evidence path: ${path}`);
  return p;
 }
 async function content(path: string) {
  const p = local(path);
  if (!bytes.has(p)) bytes.set(p, await reader(p));
  return bytes.get(p)!;
 }
 async function load(path: string) {
  local(path);
  if (!proofs.has(path)) proofs.set(path, JSON.parse(new TextDecoder().decode(await content(path))));
  return proofs.get(path);
 }
 function required(record: any, path: string) {
  assert.ok(Object.hasOwn(record.sha256 ?? {}, path), `missing required proof: ${path}`);
 }
 function queue(path: string, record: any) {
  assert.ok(record.sha256 && Object.keys(record.sha256).length, `${path}: missing fingerprints`);
  for (const [p, h] of Object.entries(record.sha256)) { local(p); assert.match(String(h), /^[0-9a-f]{64}$/, `${path}: invalid fingerprint`); }
  pending.push({path, record});
 }
 function runs(record: any, label: string, expected?: number) {
  assert.ok(Array.isArray(record.runs) && record.runs.length, `${label}: missing commands`);
  if (expected !== undefined) assert.equal(record.runs.length, expected, `${label}: incomplete command matrix`);
  for (const run of record.runs) {
   assert.ok(Array.isArray(run.command) && run.command.length, `${label}: missing command`);
   assert.equal(run.exitCode, 0, `${label}: failed command`);
  }
 }
 const refreshPath = file('field-gate-refresh-evidence'), refresh = await load(refreshPath);
 assert.equal(refresh.typecheck, 'passed');
 assert.equal(refresh.regression.failures, 0, 'refresh: regression failures');
 assert.ok(refresh.regression.tests >= 531, 'refresh: missing priority coverage');
 assert.ok(refresh.schemas >= 277 && refresh.packages >= 47, 'refresh: incomplete schema/package audit');
 runs(refresh, 'refresh'); queue(refreshPath, refresh);
 const records: {path: string; sha256: string}[] = [];
 for (const name of ['facet-core-acceptance-evidence', ...facetSystems.map(s => `${s}-facets-acceptance-evidence`)]) {
  const path = file(name), r = await load(path), core = name === 'facet-core-acceptance-evidence';
  assert.equal(core ? r.coreTaskAccepted : r.bindingAccepted, true, `${name}: not accepted`);
  assert.equal(r.nativeEquivalence, false, `${name}: unexpected equivalence claim`);
  assert.equal(r.results.typecheck, 'passed'); assert.equal(r.results.regression.failures, 0, `${name}: regression failures`);
  if (Object.hasOwn(r.results, 'failures')) assert.equal(r.results.failures, 0, `${name}: failures`);
  for (const p of ['src/index.ts', 'src/model/facets.ts', 'spec/core/facet-document.schema.json', 'spec/core/facet-operation.schema.json']) required(r, p);
  if (core) {
   for (const p of ['spec/core/facet-transition.schema.json', 'spec/core/facet-selection.schema.json']) required(r, p);
   for (const name of ['core-facet-candidate-browser', 'core-facet-operations-browser']) {
    const p = file(name); required(r, p); const browser = await load(p);
    assert.match(browser.browser, /^148\./); assert.deepEqual(browser.externalRequests, []);
    assert.ok(Object.keys(browser.checks).length); queue(p, browser);
   }
  } else {
   const system = name.replace('-facets-acceptance-evidence', '') as FacetSystem;
   for (const p of [`spec/extensions/${system}-facets/package.json`, `spec/extensions/${system}-facets/schema.json`, `spec/core/${system}-facet-classification.schema.json`, `spec/core/facets-${system}-projection.schema.json`]) required(r, p);
   const manifest = await load(`spec/extensions/${system}-facets/package.json`);
   assert.deepEqual(manifest.capabilities.directions, ['import', 'export']);
   for (const part of ['native', 'browser'] as const) {
    const p = file(`facets-${system}-${part}`); required(r, p); required(refresh, p);
    const script = `scripts/core-ideals/facets-${system}-${part === 'native' ? 'oracle' : 'browser'}.ts`;
    assert.ok(refresh.runs.some((run: any) => run.command.includes(script)), `missing refresh command: ${script}`);
    const proof = await load(p);
    const counts = {tablespec: [7, 3], postgresql: [5, 6], sqlserver: [4, 6], avro: [4, 4], parquet: [4, 4]};
    runs(proof, p, counts[system][part === 'native' ? 0 : 1]);
    queue(p, proof);
    if (part === 'native') {
     assert.equal(proof.nativeEquivalence, false);
     if (system === 'tablespec') assert.equal(proof.nativeVersion, '647e8e566ad78b864282ec65c0b0b2237aa63084');
     if (system === 'postgresql') assert.equal(proof.serverVersion, 170004);
     if (system === 'sqlserver') assert.equal(proof.serverVersion, '16.0.4295.3');
     if (system === 'avro') assert.deepEqual(proof.versions, {apache: '1.12.0', fastavro: '1.12.2'});
     if (system === 'parquet') assert.equal(proof.runtime, 'PyArrow 21.0.0');
    } else {
     assert.match(proof.browser, /^148\./); assert.deepEqual(proof.externalRequests, [], `${p}: external browser requests`);
     const children = Object.keys(proof.sha256).filter(p => p.endsWith('-browser.json'));
     assert.ok(children.length, `${p}: missing browser children`);
     for (const child of children) {
      const browser = await load(child); assert.equal(browser.browser, proof.browser);
      assert.deepEqual(browser.externalRequests, []); assert.ok(Object.keys(browser.checks).length);
      queue(child, browser);
     }
    }
   }
  }
  queue(path, r); records.push({path, sha256: digest(await content(path))});
 }
 // Validate all structural requirements first so omitted proofs cannot hide behind
 // unrelated stale fingerprints. Every actual file is read once per verification.
 for (const {path, record} of pending) for (const [p, h] of Object.entries(record.sha256)) {
  assert.equal(digest(await content(p)), h, `${path}: stale ${p}`); fingerprints++;
 }
 return {systems: [...facetSystems], records, fingerprints, refreshSha256: digest(await content(refreshPath)), idealAdmitted: false, nativeEquivalence: false};
}
