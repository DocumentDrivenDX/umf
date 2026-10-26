import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {assertExactJsonNumber} from '../../../src/model/internal/json-number';
import {captureOutcome, makeRawHostCases} from './json-number-raw-host-cases.mjs';

const root = resolve(import.meta.dir, '../../..');
const out = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r8-json-number-predecessor/raw-host-predecessor.json');
const paths = [
  'src/model/internal/json-number.ts', 'src/model/errors.ts', 'src/model/serialization.ts',
  'scripts/rust-migration/r8/json-number-raw-host-cases.mjs',
  'scripts/rust-migration/r8/json-number-raw-host-cases.d.mts',
  'scripts/rust-migration/r8/json-number-raw-host-predecessor.ts',
  'bindings/core/node/src/json-number.js', 'bindings/core/wasm/src/json-number.js',
  'crates/umf-core/src/json_number.rs', 'crates/umf-core-wire/src/json_number_binding.rs',
];
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const sourceHashes = Object.fromEntries(await Promise.all(paths.map(async path => [path, hash(await readFile(resolve(root, path)))])));
const cases = makeRawHostCases().map(item => captureOutcome(assertExactJsonNumber as (value: unknown) => unknown, item));
const packet = {format: 'umf.r8.json-number-raw-host-predecessor/1', runtime: {name: 'Bun', version: Bun.version}, sourceHashes, cases};
if (process.argv.includes('--check')) {
  const expected = JSON.parse(await readFile(out, 'utf8'));
  if (JSON.stringify(packet) !== JSON.stringify(expected)) throw new Error('Raw-host predecessor packet drifted');
  console.log(`PASS raw-host predecessor: ${cases.length} cases`);
} else if (process.argv.includes('--print')) console.log(JSON.stringify(packet, null, 2));
else {
  await writeFile(out, `${JSON.stringify(packet, null, 2)}\n`);
  console.log(`Wrote ${out}`);
}
