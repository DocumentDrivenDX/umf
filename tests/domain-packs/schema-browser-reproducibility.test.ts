import {afterEach, expect, test} from 'bun:test';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyPackage, verifyCleanBuilds, releaseParity, type VerifiedPackage} from '../../scripts/schema-browser-integrity';

const roots: string[] = [];
const hash = (text: string) => new Bun.CryptoHasher('sha256').update(text).digest('hex');
const revision = 'a'.repeat(40);
afterEach(async () => {for (const root of roots.splice(0)) await rm(root, {recursive: true, force: true});});

async function fixture(): Promise<string> {
 const root = await mkdtemp(join(tmpdir(), 'browser-integrity-test-')); roots.push(root);
 const asset = 'export const asset = true;\n', assets = {'main.js': hash(asset)};
 const payload: Record<string, string> = {
  'index.js': 'export const mount = () => {};\n', 'types/index.d.ts': 'export declare const mount: () => void;\n',
  'assets/main.js': asset, 'README.md': 'test', 'HOST_CONTRACT.md': 'test', 'catalog.schema.json': '{}',
  'asset-manifest.json': JSON.stringify({version: 1, assets}),
  'package.json': JSON.stringify({name: '@documentdrivendx/umf-schema-browser', version: '1.1.2', exports: {'.': {types: './types/index.d.ts', import: './index.js'}, './assets/*': './assets/*'}}),
  'provenance.json': JSON.stringify({version: 1, packageVersion: '1.1.2', revision, bun: '1.3.14', lockfileSha256: hash('lock'), inputs: {'producer.ts': hash('producer')}, assets}),
 };
 for (const [name, text] of Object.entries(payload)) await Bun.write(join(root, name), text);
 await reseal(root, Object.keys(payload));
 return root;
}
async function reseal(root: string, names: string[]): Promise<void> {
 const sha256: Record<string, string> = {};
 for (const name of names.sort()) sha256[name] = hash(await Bun.file(join(root, name)).text());
 await Bun.write(join(root, 'release-manifest.json'), JSON.stringify({version: 1, sha256}));
 await Bun.write(join(root, 'SHA256SUMS'), Object.entries(sha256).sort().map(([name, value]) => value+'  '+name).join('\n')+'\n');
}
const copy = (value: VerifiedPackage) => structuredClone(value);

test('complete installed payload, asset and exported API inventories verify', async () => {
 const p = await verifyPackage(await fixture());
 verifyCleanBuilds(p, copy(p));
 expect(releaseParity(p, copy(p), {revision, clean: true})).toEqual({compared: true, reasons: []});
});

test('runtime, API and declaration tampering refuse independently of parity', async () => {
 for (const name of ['assets/main.js', 'index.js', 'types/index.d.ts']) {
  const root = await fixture(); await Bun.write(join(root, name), 'tampered');
  await expect(verifyPackage(root)).rejects.toThrow('payload hash differs');
 }
});

test('missing or unlisted files and checksum-manifest drift refuse', async () => {
 const extra = await fixture(); await Bun.write(join(extra, 'unlisted.js'), 'extra');
 await expect(verifyPackage(extra)).rejects.toThrow('inventory differs');
 const missing = await fixture(); await rm(join(missing, 'types/index.d.ts'));
 await expect(verifyPackage(missing)).rejects.toThrow('inventory differs');
 const sums = await fixture(); await Bun.write(join(sums, 'SHA256SUMS'), '');
 await expect(verifyPackage(sums)).rejects.toThrow('SHA256SUMS');
});

test('asset inventories and API export targets cannot evade checks by resealing release hashes', async () => {
 const asset = await fixture(), verified = await verifyPackage(asset);
 await Bun.write(join(asset, 'asset-manifest.json'), JSON.stringify({version: 1, assets: {'different.js': hash('different')}}));
 await reseal(asset, Object.keys(verified.payload));
 await expect(verifyPackage(asset)).rejects.toThrow('Assets hashes differ');
 const api = await fixture(), original = await verifyPackage(api);
 const pkg = await Bun.file(join(api, 'package.json')).json(); pkg.exports['.'].types = './types/missing.d.ts';
 await Bun.write(join(api, 'package.json'), JSON.stringify(pkg)); await reseal(api, Object.keys(original.payload));
 await expect(verifyPackage(api)).rejects.toThrow('Missing exported API file');
});

test('clean-build mismatch fails even when each candidate is internally consistent', async () => {
 const a = await verifyPackage(await fixture()), b = copy(a); b.payload['index.js'] = hash('changed');
 expect(() => verifyCleanBuilds(a, b)).toThrow('Clean producer payload');
});

test('unqualified source, toolchain or profile cannot claim release parity', async () => {
 const a = await verifyPackage(await fixture());
 for (const change of [
  (b: VerifiedPackage) => {b.provenance.inputs['new-input.ts'] = hash('new');},
  (b: VerifiedPackage) => {b.provenance.bun = '1.4.2';},
  (b: VerifiedPackage) => {b.provenance.lockfileSha256 = hash('other lock');},
  (b: VerifiedPackage) => {b.provenance.packageVersion = '1.1.3';},
  (b: VerifiedPackage) => {b.provenance.revision = 'b'.repeat(40);},
 ]) {
  const b = copy(a); change(b);
  expect(releaseParity(a, b, {revision, clean: true}).compared).toBe(false);
  expect(() => releaseParity(a, b, {revision, clean: true}, true)).toThrow('unqualified');
 }
 expect(() => releaseParity(a, a, {revision, clean: false}, true)).toThrow('unqualified');
});

test('qualified release parity still refuses runtime and API drift', async () => {
 const a = await verifyPackage(await fixture());
 for (const name of ['assets/main.js', 'index.js', 'types/index.d.ts', 'provenance.json']) {
  const b = copy(a); b.payload[name] = hash('drift');
  expect(() => releaseParity(a, b, {revision, clean: true})).toThrow('Published release payload');
  expect(() => releaseParity(a, b, {revision, clean: true}, true)).toThrow('Published release payload');
 }
});

test('unsafe manifest paths refuse before reading outside the package', async () => {
 const root = await fixture();
 await Bun.write(join(root, 'release-manifest.json'), JSON.stringify({version: 1, sha256: {'../outside': hash('x')}}));
 await expect(verifyPackage(root)).rejects.toThrow('Invalid release inventory');
});
