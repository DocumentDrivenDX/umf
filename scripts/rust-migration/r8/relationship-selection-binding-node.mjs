import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root = resolve(import.meta.dirname, '../../..');
const packageRoot = resolve(process.env.UMF_RELATIONSHIP_SELECTION_PACKAGE_ROOT ?? 'bindings/core/node');
const facade = await import(pathToFileURL(resolve(packageRoot, 'index.js')).href);
const packetPath = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r5-core-relationship-selection/frozen-typescript.json');
const packetBytes = await readFile(packetPath);
const packet = JSON.parse(packetBytes);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const resources = Object.fromEntries(await Promise.all([
  ['coreSchema', 'spec/core/schema.json'],
  ['referenceSchema', 'spec/core/semantic-type-reference.schema.json'],
  ['packageSchema', 'spec/core/extension-package.schema.json'],
  ['constraints', 'spec/metamodel/generated/core-constraints.json'],
  ['domainPolicy', 'spec/metamodel/generated/domain-policy.json'],
].map(async ([name, path]) => [name, JSON.parse(await readFile(resolve(root, path), 'utf8'))])));
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  : JSON.stringify(value);
const engine = facade.createCoreModelEngine(resources);
let mismatches = 0;
for (const [id, testCase] of Object.entries(packet.cases)) {
  const expected = packet.outcomes[id];
  try {
    const actual = engine.selectCoreRelationships(testCase.source, testCase.query);
    assert.equal(expected.ok, true, `${id}: unexpectedly accepted`);
    assert.equal(canonical(actual), canonical(expected.value), `${id}: value differs`);
  } catch (error) {
    if (expected.ok) throw new Error(`${id}: unexpectedly refused: ${error}`);
    assert.deepEqual({code:error.code, message:error.message, path:error.path ?? ''}, expected.error, `${id}: error envelope differs`);
  }
}

let cancelled = false;
const controlled = facade.createCoreModelEngine(resources, {controls:{isCancelled(){return cancelled;}}});
cancelled = true;
assert.throws(() => controlled.selectCoreRelationships(packet.cases.all_paths_and_navigation.source, {}), error => error.code === 'CANCELLED');
cancelled = false;
assert.equal(controlled.selectCoreRelationships(packet.cases.no_relationships.source, {}).selection.length, 0);

console.log(JSON.stringify({host:typeof Bun === 'undefined' ? 'node' : 'bun', version:typeof Bun === 'undefined' ? process.version : Bun.version,
  cases:Object.keys(packet.cases).length, mismatches, packetSha256:sha256(packetBytes),
  cancellation:'CANCELLED', cancellationReset:true, errorParity:'code/message/path only'}));
