// SPDX-License-Identifier: MIT OR Apache-2.0
/** Host-only verification of a complete producer/package payload. */
import {readdir} from 'node:fs/promises';
import {join} from 'node:path';

type Hashes = Record<string, string>;
export type Provenance = {
 version: 1; packageVersion: string; revision: string; bun: string;
 lockfileSha256: string; inputs: Hashes; assets: Hashes;
};
export type VerifiedPackage = {payload: Hashes; provenance: Provenance};
const digest = /^[a-f0-9]{64}$/;
const object = (value: unknown): value is Record<string, unknown> =>
 value !== null && typeof value === 'object' && !Array.isArray(value);
const pathSafe = (path: string) => path.length > 0 && !path.includes('\\') &&
 !path.includes('\0') && path.split('/').every(part => part !== '' && part !== '.' && part !== '..');
const canonical = (value: Hashes) => JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
function hashes(value: unknown, label: string): Hashes {
 if (!object(value) || !Object.keys(value).length || Object.entries(value).some(([path, hash]) =>
  !pathSafe(path) || typeof hash !== 'string' || !digest.test(hash))) throw Error('Invalid '+label+' inventory');
 return value as Hashes;
}
async function inventory(root: string, prefix = ''): Promise<string[]> {
 const files: string[] = [];
 for (const entry of await readdir(join(root, prefix), {withFileTypes: true})) {
  const path = prefix + entry.name;
  if (entry.isDirectory()) files.push(...await inventory(root, path + '/'));
  else if (entry.isFile()) files.push(path);
  else throw Error('Non-regular package entry: '+path);
 }
 return files.sort();
}
function sameInventory(actual: string[], expected: string[], label: string): void {
 if (JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort())) throw Error(label+' inventory differs');
}
function sameHashes(actual: Hashes, expected: Hashes, label: string): void {
 if (canonical(actual) !== canonical(expected)) throw Error(label+' hashes differ');
}

export async function verifyPackage(root: string): Promise<VerifiedPackage> {
 const manifest: unknown = await Bun.file(join(root, 'release-manifest.json')).json();
 if (!object(manifest) || manifest.version !== 1) throw Error('Unsupported release manifest');
 const payload = hashes(manifest.sha256, 'release');
 if ('release-manifest.json' in payload || 'SHA256SUMS' in payload) throw Error('Recursive release inventory');
 sameInventory(await inventory(root), [...Object.keys(payload), 'release-manifest.json', 'SHA256SUMS'], 'Complete package');
 for (const required of ['package.json', 'index.js', 'types/index.d.ts', 'provenance.json', 'asset-manifest.json', 'README.md', 'HOST_CONTRACT.md', 'catalog.schema.json']) {
  if (!(required in payload)) throw Error('Missing required package file: '+required);
 }
 for (const [name, hash] of Object.entries(payload)) {
  if (new Bun.CryptoHasher('sha256').update(await Bun.file(join(root, name)).bytes()).digest('hex') !== hash) throw Error('Package payload hash differs: '+name);
 }
 const sums = Object.entries(payload).sort().map(([name, hash]) => hash+'  '+name).join('\n')+'\n';
 if (await Bun.file(join(root, 'SHA256SUMS')).text() !== sums) throw Error('SHA256SUMS differs from complete release manifest');
 const assets: unknown = await Bun.file(join(root, 'asset-manifest.json')).json();
 if (!object(assets) || assets.version !== 1) throw Error('Unsupported asset manifest');
 const assetHashes = hashes(assets.assets, 'assets');
 sameHashes(assetHashes, Object.fromEntries(Object.entries(payload).filter(([name]) => name.startsWith('assets/')).map(([name, hash]) => [name.slice(7), hash])), 'Assets');
 const provenance: unknown = await Bun.file(join(root, 'provenance.json')).json();
 if (!object(provenance) || provenance.version !== 1 || typeof provenance.packageVersion !== 'string' ||
  typeof provenance.revision !== 'string' || !/^[a-f0-9]{40}$/.test(provenance.revision) ||
  typeof provenance.bun !== 'string' || !provenance.bun || typeof provenance.lockfileSha256 !== 'string' || !digest.test(provenance.lockfileSha256)) throw Error('Invalid producer provenance');
 hashes(provenance.inputs, 'producer inputs');
 sameHashes(hashes(provenance.assets, 'provenance assets'), assetHashes, 'Provenance assets');
 const pkg: unknown = await Bun.file(join(root, 'package.json')).json();
 if (!object(pkg) || pkg.name !== '@documentdrivendx/umf-schema-browser' || pkg.version !== provenance.packageVersion || !object(pkg.exports)) throw Error('Package identity/exports differ');
 const checkExport = (value: unknown): void => {
  if (object(value)) {for (const entry of Object.values(value)) checkExport(entry); return;}
  if (typeof value !== 'string' || !value.startsWith('./') || !pathSafe(value.slice(2))) throw Error('Unsupported package export');
  const path = value.slice(2);
  if (path.endsWith('/*')) {
   if (path.slice(0, -1).includes('*') || !Object.keys(payload).some(name => name.startsWith(path.slice(0, -1)))) throw Error('Missing exported asset inventory');
  } else if (path.includes('*') || !(path in payload)) throw Error('Missing exported API file: '+path);
 };
 checkExport(pkg.exports);
 return {payload, provenance: provenance as Provenance};
}

export function verifyCleanBuilds(first: VerifiedPackage, second: VerifiedPackage): void {
 sameHashes(first.payload, second.payload, 'Clean producer payload');
}

/** v1 input maps are renderer inventories, not proof of every producer input.
 * A clean exact producer revision is a conservative extra prerequisite. Never
 * infer equivalent input closure merely from equal output or package versions.
 */
export function releaseParity(candidate: VerifiedPackage, released: VerifiedPackage,
 checkout: {revision: string; clean: boolean}, required = false): {compared: boolean; reasons: string[]} {
 const a = candidate.provenance, b = released.provenance, reasons: string[] = [];
 if (!checkout.clean || checkout.revision !== a.revision || a.revision !== b.revision) reasons.push('exact clean producer revision differs');
 if (a.bun !== b.bun) reasons.push('Bun version differs');
 if (a.lockfileSha256 !== b.lockfileSha256) reasons.push('dependency lock differs');
 if (a.packageVersion !== b.packageVersion) reasons.push('package profile version differs');
 if (canonical(a.inputs) !== canonical(b.inputs)) reasons.push('recorded producer input closure differs');
 if (reasons.length) {
  if (required) throw Error('Release parity is unqualified: '+reasons.join('; '));
  return {compared: false, reasons};
 }
 sameHashes(candidate.payload, released.payload, 'Published release payload');
 return {compared: true, reasons: []};
}
