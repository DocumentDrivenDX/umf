// SPDX-License-Identifier: MIT OR Apache-2.0
// One-host schema graph replay. Invoked by schema-graph-route-host.mjs.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {
  OPERATIONS, canonicalJson, fail, importEntrypoint, openArtifact,
  parseReplayOptions, validateGraph, verifyMutationAndFreshInstance,
} from './schema-graph-route-common.mjs';

const options = parseReplayOptions();
if (!['node','bun'].includes(options.runtime)) fail('--runtime must be node or bun');
const artifact = await openArtifact(options);
const counts = Object.fromEntries(OPERATIONS.map(operation => [operation.provider,0]));
const providerResults = Object.fromEntries(OPERATIONS.map(operation => [operation.provider,[]]));
const nativePath = resolve(artifact.files.addon);
const require = createRequire(import.meta.url);
// Both Node and Bun consult the native module cache for the bundled require.
// Node's Module._load hook does not observe Bun's native loading path.
// require.resolve canonicalizes /var to /private/var on macOS, so use the
// loader's resolved key rather than the extraction path's spelling.
const nativeCacheKey = require.resolve(nativePath);
const addon = require(nativePath);
const nativeModule = require.cache[nativeCacheKey];
if (!nativeModule || nativeModule.exports !== addon) fail('Native addon cache identity is unavailable');
const wrapped = new Proxy(addon, {
  get(target, property, receiver) {
    const value = Reflect.get(target,property,receiver);
    if (typeof property !== 'string' || !Object.hasOwn(counts,property) || typeof value !== 'function') return value;
    return (...args) => {
      counts[property]++;
      const result = Reflect.apply(value,target,args);
      providerResults[property].push(result);
      return result;
    };
  },
});
nativeModule.exports = wrapped;

let result;
try {
  const [defaultApi, referenceApi] = await Promise.all([
    importEntrypoint(artifact.files.node),
    importEntrypoint(artifact.files.reference),
  ]);
  assert.deepEqual(counts,Object.fromEntries(OPERATIONS.map(operation => [operation.provider,0])), 'module import must not eagerly call schema providers');
  const operations = {};
  for (const operation of OPERATIONS) {
    const defaultGenerator = defaultApi[operation.name];
    const referenceGenerator = referenceApi[operation.name];
    assert.equal(typeof defaultGenerator,'function',`default export ${operation.name} exists`);
    assert.equal(typeof referenceGenerator,'function',`reference export ${operation.name} exists`);
    assert.equal(defaultGenerator.name,operation.name,`${operation.name} public name`);
    assert.equal(defaultGenerator.length,0,`${operation.name} default arity`);
    assert.equal(referenceGenerator.name,operation.name,`${operation.name} reference name`);
    assert.equal(referenceGenerator.length,0,`${operation.name} reference arity`);

    const first = defaultGenerator();
    const second = defaultGenerator();
    const calls = counts[operation.provider];
    assert.equal(calls,2,`${operation.name} must make one direct Rust provider call per invocation`);
    assert.equal(providerResults[operation.provider].length,2,`${operation.name} provider result count`);
    const reference = referenceGenerator();
    assert.equal(counts[operation.provider],calls,`${operation.name} reference route must not enter Rust`);
    const checked = validateGraph(providerResults[operation.provider][0],first,reference,operation.name);
    assert.equal(canonicalJson(JSON.parse(providerResults[operation.provider][1])),canonicalJson(JSON.parse(providerResults[operation.provider][0])),`${operation.name} provider output stability`);
    const identity = verifyMutationAndFreshInstance(first,second,reference,checked.expectedAliases,operation.name);
    operations[operation.name] = {
      provider:operation.provider,
      providerCalls:calls,
      providerOutputSha256:(await import('node:crypto')).createHash('sha256').update(providerResults[operation.provider][0]).digest('hex'),
      aliasGroups:checked.expectedAliases.length,
      aliasGroupPointers:checked.expectedAliases,
      exactJsonParity:true,
      ...identity,
      name:defaultGenerator.name,
      arity:defaultGenerator.length,
    };
  }
  result = {
    status:'pass',
    host:options.runtime,
    runtime:options.runtime === 'bun' ? process.versions.bun : process.version,
    artifact:{manifestSha256:artifact.manifestSha,packageJsonSha256:artifact.packageSha,packageManifestSha256:artifact.packageManifestSha256,sourceClosureSha256:artifact.sourceClosureSha256},
    operations,
  };
} finally {
  nativeModule.exports = addon;
  await artifact.cleanup();
}

process.stdout.write(`${JSON.stringify(result)}\n`);
