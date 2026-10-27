// Keep the browser package's portable JS helpers generated from the Node
// binding sources. `--check` is used by boundary/qualification gates.
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

const root = resolve(import.meta.dir, '../../..');
const pairs = [
  ['bindings/core/node/src/wire.js', 'bindings/core/wasm/src/wire.js'],
  ['bindings/core/node/src/javascript-numeric.js', 'bindings/core/wasm/src/javascript-numeric.js'],
  ['bindings/core/node/src/security-logic.js', 'bindings/core/wasm/src/security-logic.js'],
  ['bindings/core/node/src/security-functions.js', 'bindings/core/wasm/src/security-functions.js'],
  ['bindings/core/node/src/security-protection-source.js', 'bindings/core/wasm/src/security-protection-source.js'],
  ['bindings/core/node/src/bit128.js', 'bindings/core/wasm/src/bit128.js'],
  ['bindings/core/node/src/json-number.js', 'bindings/core/wasm/src/json-number.js'],
  ['bindings/core/node/src/json-schema.js', 'bindings/core/wasm/src/json-schema.js'],
  ['bindings/core/node/src/json-schema-import-source.js', 'bindings/core/wasm/src/json-schema-import-source.js'],
  ['bindings/core/node/src/core-key-tuple.js', 'bindings/core/wasm/src/core-key-tuple.js'],
  ['bindings/core/node/src/core-keys.js', 'bindings/core/wasm/src/core-keys.js'],
  ['bindings/core/node/src/dataset-values-compact.js', 'bindings/core/wasm/src/dataset-values-compact.js'],
  ['bindings/core/node/src/dataset-values.js', 'bindings/core/wasm/src/dataset-values.js'],
  ['bindings/core/node/src/core-relationships.js', 'bindings/core/wasm/src/core-relationships.js'],
  ['bindings/core/node/src/core-evolution.js', 'bindings/core/wasm/src/core-evolution.js'],
  ['bindings/core/node/src/csv-boolean-lexical.js', 'bindings/core/wasm/src/csv-boolean-lexical.js'],
  ['bindings/core/node/src/document-comparison.js', 'bindings/core/wasm/src/document-comparison.js'],
  ['bindings/core/node/src/host-json.js', 'bindings/core/wasm/src/host-json.js'],
] as const;
const manifestPath = 'bindings/core/wasm/src/shared-sources.json';
const check = process.argv.includes('--check');
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const manifest = {sources: [] as {source: string; generated: string; sha256: string}[]};
const generated = new Map<string, Uint8Array>();

for (const [source, destination] of pairs) {
  const bytes = await readFile(resolve(root, source));
  generated.set(destination, bytes);
  manifest.sources.push({source, generated: destination, sha256: hash(bytes)});
}
const manifestBytes = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);
generated.set(manifestPath, manifestBytes);

if (check) {
  const stale: string[] = [];
  for (const [path, expected] of generated) {
    let actual: Uint8Array | undefined;
    try { actual = await readFile(resolve(root, path)); } catch { /* listed below */ }
    if (!actual || hash(actual) !== hash(expected)) stale.push(path);
  }
  if (stale.length) throw new Error(`Generated WASM package sources are stale: ${stale.join(', ')}; run bun scripts/rust-migration/r7/wasm-package-sources.ts`);
  console.log(JSON.stringify({status: 'current', files: generated.size, sources: manifest.sources}));
} else {
  await mkdir(resolve(root, 'bindings/core/wasm/src'), {recursive: true});
  for (const [path, bytes] of generated) {
    let current: Uint8Array | undefined;
    try { current = await readFile(resolve(root, path)); } catch { /* created below */ }
    if (!current || hash(current) !== hash(bytes)) await writeFile(resolve(root, path), bytes);
  }
  console.log(JSON.stringify({status: 'generated', files: generated.size, sources: manifest.sources}));
}
