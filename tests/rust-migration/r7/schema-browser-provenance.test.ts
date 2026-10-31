import {expect, test} from 'bun:test';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {collectWasmCargoInputHashes, digest, provenanceBytes, releaseManifestBytes} from '../../../scripts/rust-migration/r7/schema-browser-provenance';

const root = resolve(import.meta.dir, '../../..');

test('schema-browser provenance includes transitive Cargo sources and literal include resources', async () => {
  const hashes = await collectWasmCargoInputHashes(root);
  expect(hashes['crates/umf-codegen/Cargo.toml']).toBeString();
  expect(hashes['crates/umf-codegen/src/lib.rs']).toBeString();
  expect(hashes['crates/umf-codegen/src/generation/python_runtime.py']).toBeString();
  expect(hashes['crates/umf-core/vendor/saphyr-parser/Cargo.toml']).toBeString();
  expect(hashes['crates/umf-core/vendor/saphyr-parser/src/parser.rs']).toBeString();
  expect(hashes['spec/extensions/tables/operation.schema.json']).toBeString();
}, {timeout: 60_000});

test('changing a transitive local Cargo source changes provenance and release digest', async () => {
  const target = 'crates/umf-codegen/src/lib.rs';
  const baselineInputs = await collectWasmCargoInputHashes(root);
  const alteredInputs = await collectWasmCargoInputHashes(root, async path => {
    if (path === resolve(root, target)) return new TextEncoder().encode(`${await readFile(path, 'utf8')}\n// provenance control\n`);
    return readFile(path);
  });
  expect(alteredInputs[target]).not.toBe(baselineInputs[target]);

  const provenance = (inputs: Record<string, string>) => provenanceBytes({version: 1, inputs: Object.fromEntries(Object.entries(inputs).sort())});
  const baselineProvenance = provenance(baselineInputs);
  const alteredProvenance = provenance(alteredInputs);
  expect(digest(alteredProvenance)).not.toBe(digest(baselineProvenance));

  const baselineRelease = releaseManifestBytes({'provenance.json': digest(baselineProvenance)});
  const alteredRelease = releaseManifestBytes({'provenance.json': digest(alteredProvenance)});
  expect(digest(alteredRelease)).not.toBe(digest(baselineRelease));
}, {timeout: 60_000});
