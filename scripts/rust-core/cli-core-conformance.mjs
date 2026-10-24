// SPDX-License-Identifier: MIT OR Apache-2.0
// Run the production native CLI against the frozen 139-case corpus with PATH empty.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runCliWire} from './cli-wire-transport.mjs';
import {encodeWire, fromWire, resultError} from '../../bindings/core/node/src/wire.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cli = path.resolve(process.env.UMF_CLI_PATH ?? path.join(root, 'target/release/umf'));
const fixturePath = path.resolve(process.argv[2] ?? path.join(root, 'docs/helix/04-build/evidence/rust-migration/r2/baseline-current-conformance.json'));
const corpusBytes = fs.readFileSync(fixturePath);
const corpus = JSON.parse(corpusBytes);
assert.equal(corpus.profile, 'umf.current-conformance/1');
assert.equal(corpus.cases.length, 139);
const resources = {
  coreSchema: JSON.parse(fs.readFileSync(path.join(root, 'spec/core/schema.json'))),
  referenceSchema: JSON.parse(fs.readFileSync(path.join(root, 'spec/core/semantic-type-reference.schema.json'))),
  packageSchema: JSON.parse(fs.readFileSync(path.join(root, 'spec/core/extension-package.schema.json'))),
  constraints: JSON.parse(fs.readFileSync(path.join(root, 'spec/metamodel/generated/core-constraints.json'))),
  domainPolicy: JSON.parse(fs.readFileSync(path.join(root, 'spec/metamodel/generated/domain-policy.json'))),
};
const canonical = (value) => Array.isArray(value)
  ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const lines = corpus.cases.map((item) => {
  const request = {op: 'validate', resources, document: item.document};
  if (item.registry) request.registry = [{
    id: item.registry.id,
    version: item.registry.version,
    scopes: [item.registry.scope],
    schema: true,
    semantic: true,
  }];
  return encodeWire(request, {maxDepth: 256, maxValues: 1_200_000});
});
const outputRun = await runCliWire({
  command: cli,
  args: ['core', '--stdin-wire', '--profile', 'cooperative', '--test-baseline-callback'],
  cwd: root,
  wireBytes: Buffer.from(`${lines.join('\n')}\n`, 'utf8'),
  env: {...process.env, PATH: ''},
  maxBuffer: 256 * 1024 * 1024,
  timeoutMs: 120_000,
  label: 'r2-baseline-current-conformance#all-139-cases',
});
if (outputRun.status !== 0) throw new Error(outputRun.stderr || `Native CLI exited ${outputRun.status ?? outputRun.signal}`);
const output = outputRun.stdout;
const envelopes = output.trimEnd().split('\n').map((line) => JSON.parse(line));
assert.equal(envelopes.length, corpus.cases.length, 'native CLI must emit one result per vector');

// Three individually valid catalog resources may exceed the 1M per-resource
// admission ceiling in aggregate. Keep the transport envelope from adding a
// second, aggregate value limit.
const withExamples = (schema) => ({...schema, examples: Array(450_000).fill(null)});
const catalogRequest = encodeWire({
  op: 'validate',
  resources: {
    coreSchema: withExamples(resources.coreSchema),
    referenceSchema: withExamples(resources.referenceSchema),
    packageSchema: withExamples(resources.packageSchema),
    constraints: resources.constraints,
    domainPolicy: resources.domainPolicy,
  },
  registry: [],
  document: corpus.cases.find((item) => item.valid).document,
}, {maxDepth: 256, maxValues: Number.MAX_SAFE_INTEGER});
async function invokeOne(requestWire, label) {
  const run = await runCliWire({
    command: cli,
    args: ['core', '--stdin-wire', '--profile', 'cooperative', '--test-baseline-callback'],
    cwd: root,
    wireBytes: Buffer.from(`${requestWire}\n`, 'utf8'),
    env: {...process.env, PATH: ''},
    maxBuffer: 256 * 1024 * 1024,
    timeoutMs: 120_000,
    label,
  });
  if (run.status !== 0) throw new Error(run.stderr || `Native CLI exited ${run.status ?? run.signal}`);
  return JSON.parse(run.stdout.trim());
}
const catalogEnvelope = await invokeOne(catalogRequest, 'r2-baseline-current-conformance#independent-resource-catalog');
assert.equal(resultError(catalogEnvelope), null, 'native CLI must admit each catalog resource independently');
assert.equal(catalogEnvelope.status, 'ok', 'native CLI resource-bundle request must complete');
function nested(depth) {
  let value = null;
  for (let index = 0; index < depth; index++) value = [value];
  return value;
}
for (const [name, document] of [['depth-129', nested(129)], ['values-100001', Array(100_001).fill(null)]]) {
  const envelope = await invokeOne(encodeWire({op: 'validate', resources, registry: [], document}, {
    maxDepth: 256,
    maxValues: Number.MAX_SAFE_INTEGER,
  }), `r2-baseline-current-conformance#${name}`);
  const failure = resultError(envelope);
  assert.equal(failure?.code, 'LIMIT', `ordinary ${name} must still be refused after transport decoding`);
}
const differences = [];
for (let index = 0; index < corpus.cases.length; index++) {
  const item = corpus.cases[index];
  const envelope = envelopes[index];
  const failure = resultError(envelope);
  const actual = failure ? {error: failure} : fromWire(JSON.parse(envelope.wire));
  const expected = {valid: item.valid, complete: item.complete, diagnostics: item.diagnostics};
  if (canonical(actual) !== canonical(expected)) differences.push({id: item.id, actual, expected});
}
if (differences.length) {
  process.stdout.write(`${JSON.stringify({status: 'fail', cases: corpus.cases.length, mismatches: differences.length, firstFive: differences.slice(0, 5)})}\n`);
  throw new Error(`Native CLI R2 conformance has ${differences.length} mismatches`);
}
process.stdout.write(`${JSON.stringify({status: 'pass', executable: cli, sourceSha256: createHash('sha256').update(fs.readFileSync(cli)).digest('hex'), fixtureSha256: createHash('sha256').update(corpusBytes).digest('hex'), cases: corpus.cases.length, orderedDiagnostics: true, path: 'empty'})}\n`);
