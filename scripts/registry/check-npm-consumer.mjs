import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const name = '@documentdrivendx/umf-core';
const entry = import.meta.resolve(name);
assert.match(entry, /node_modules\/@documentdrivendx\/umf-core\/dist\/umf-node\.js$/);
const require = createRequire(import.meta.url);
const platformAddon = {
  'darwin-arm64': 'umf_core_node-darwin-arm64.node',
  'linux-x64': 'umf_core_node-linux-x64.node',
}[`${process.platform}-${process.arch}`];
assert.ok(platformAddon);
const dist = dirname(fileURLToPath(entry));
const root = await import(name);
assert.equal(typeof root.generatePackTools, 'function');
assert.equal(require(join(dist, 'native-addon.cjs')), require(join(dist, platformAddon)));
console.log(JSON.stringify({host:process.versions.bun ? 'bun' : 'node',platform:process.platform,arch:process.arch,selected:platformAddon,status:'passed'}));
