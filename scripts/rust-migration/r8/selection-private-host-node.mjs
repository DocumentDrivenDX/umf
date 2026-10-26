// SPDX-License-Identifier: MIT OR Apache-2.0
// Bounded Node runtime check for the private Selection host entrypoint.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root = resolve(import.meta.dirname, '../../..');
const addonPath = process.env.UMF_SELECTION_ADDON;
if (!addonPath) throw new Error('UMF_SELECTION_ADDON must name a freshly built Node addon');
const require = createRequire(import.meta.url);
const addon = require(addonPath);
const {coreElementSelectionHostInput} = await import(pathToFileURL(resolve(root, 'bindings/core/node/src/host-json.js')));
const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const resources = {
  coreSchema: read('spec/core/schema.json'),
  referenceSchema: read('spec/core/semantic-type-reference.schema.json'),
  packageSchema: read('spec/core/extension-package.schema.json'),
  constraints: read('spec/metamodel/generated/core-constraints.json'),
  domainPolicy: read('spec/metamodel/generated/domain-policy.json'),
};
const packet = read('scripts/rust-migration/r5/selection/input.json');
const frozen = read('scripts/rust-migration/r5/selection/frozen-typescript.json');
const result = coreElementSelectionHostInput(addon, resources, packet.source, packet.queries.all, undefined, Error);
assert.equal(JSON.stringify(result), JSON.stringify(frozen.cases.all));
const outputPrototype = Object.getPrototypeOf(result) === null ? 'null' : 'ordinary';
assert.equal(outputPrototype, 'null'); // Explicit unresolved predecessor shape difference.

const sentinel = {identity: true};
let calls = 0;
try {
  coreElementSelectionHostInput(addon, resources, packet.source, packet.queries.all, {get() { calls++; throw sentinel; }}, Error);
  assert.fail('expected Registry.get throw');
} catch (error) {
  assert.equal(error, sentinel);
}
assert.equal(calls, 1);
console.log(JSON.stringify({status: 'json-value-pass', host: process.version, cases: 2, outputPrototype}));
