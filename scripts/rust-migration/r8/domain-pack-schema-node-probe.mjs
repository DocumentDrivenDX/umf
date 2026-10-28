// SPDX-License-Identifier: MIT OR Apache-2.0
// Bounded opt-in native Node probe; pass a freshly built N-API .node path.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {createDomainPackSchemaOperation} from '../../../bindings/core/node/src/domain-pack-schema.js';

const addonPath = process.argv[2];
if (!addonPath) throw new Error('usage: node domain-pack-schema-node-probe.mjs ADDON.node');
const addon = createRequire(import.meta.url)(path.resolve(addonPath));
const schemaPath = path.resolve(import.meta.dirname, '../../../spec/extensions/domain-pack/schema.json');
const schemaBytes = await readFile(schemaPath);
const expected = JSON.parse(schemaBytes);
const operation = createDomainPackSchemaOperation(addon.domainPackSchemaJson);
const first = operation('1.0.0');
assert.deepEqual(first, expected);
first.properties.id.type = 'integer';
assert.deepEqual(operation('1.0.0'), expected);
assert.throws(() => operation('2.0.0'), /DOMAIN_PACK_SCHEMA_VERSION/);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
console.log(JSON.stringify({
  status: 'pass', runtime: process.version, arch: process.arch,
  addonSha256: sha(await readFile(addonPath)), schemaSha256: sha(schemaBytes),
  result: {equal: true, isolated: true, refused: true},
}));
