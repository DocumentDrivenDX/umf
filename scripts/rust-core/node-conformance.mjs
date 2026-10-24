// SPDX-License-Identifier: MIT OR Apache-2.0
// Run the frozen current-core corpus through the installed Node/Bun N-API host.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const bindingEntry = process.env.UMF_CORE_NODE_PACKAGE;
const nodeBinding = bindingEntry
  ? await import(pathToFileURL(path.resolve(bindingEntry)).href)
  : await import('../../bindings/core/node/index.js');
const {copyJson, createEngine, engineVersion} = nodeBinding;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = process.argv[2] ?? path.join(root, 'docs/helix/04-build/evidence/rust-migration/r2/baseline-current-conformance.json');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const corpusRaw = fs.readFileSync(fixture);
const corpus = JSON.parse(corpusRaw);
assert.equal(corpus.profile, 'umf.current-conformance/1');
assert.equal(corpus.cases.length, 139);
const resources = {
  coreSchema: readJson('spec/core/schema.json'),
  referenceSchema: readJson('spec/core/semantic-type-reference.schema.json'),
  packageSchema: readJson('spec/core/extension-package.schema.json'),
  constraints: readJson('spec/metamodel/generated/core-constraints.json'),
  domainPolicy: readJson('spec/metamodel/generated/domain-policy.json'),
};
const engine = createEngine(resources);

// The wrapper bundle may exceed the catalog ceiling in aggregate while each
// explicit schema resource remains independently below its one-million-value
// admission limit. The transport envelope must not add a combined cap.
const withExamples = (schema) => ({...schema, examples: Array(450_000).fill(null)});
assert.doesNotThrow(() => createEngine({
  ...resources,
  coreSchema: withExamples(resources.coreSchema),
  referenceSchema: withExamples(resources.referenceSchema),
  packageSchema: withExamples(resources.packageSchema),
}), 'transport bundle should admit three independently valid 450k-value schemas');

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const differences = [];
for (const testCase of corpus.cases) {
  const spec = testCase.registry;
  const registry = spec ? [{
    id: spec.id,
    version: spec.version,
    scopes: [spec.scope],
    schema: true,
    semantics(payload, context) {
      return [{
        code: 'BASELINE_CALLBACK',
        path: context.path,
        message: `${context.document.id}:${context.scope}:${payload.kind}`,
        severity: 'warning',
      }];
    },
  }] : [];
  const actual = engine.validateDocument(testCase.document, registry);
  const expected = {valid: testCase.valid, complete: testCase.complete, diagnostics: testCase.diagnostics};
  if (canonical(actual) !== canonical(expected)) {
    differences.push({id: testCase.id, actual, expected});
  }
}
if (differences.length) {
  process.stdout.write(`${JSON.stringify({status: 'fail', cases: corpus.cases.length, mismatches: differences.length, firstFive: differences.slice(0, 5)})}\n`);
  throw new Error(`Node R2 conformance has ${differences.length} mismatches`);
}

// Raw UTF-16 callback strings round-trip without coercion or replacement.
const callbackCase = corpus.cases.find((item) => item.registry);
assert.ok(callbackCase, 'frozen corpus requires a callback vector');
const surrogate = '\ud800';
const callbackResult = engine.validateDocument(callbackCase.document, [{
  id: callbackCase.registry.id,
  version: callbackCase.registry.version,
  scopes: [callbackCase.registry.scope],
  schema: true,
  semantics() { return [
    {code: `HOST_SURROGATE${surrogate}`, path: `/callback${surrogate}`, message: `message${surrogate}`, severity: 'warning'},
    {code: 'HOST-É', path: '/unicode', message: 'unicode code', severity: 'warning'},
  ]; },
}]);
const raw = callbackResult.diagnostics.find((item) => item.code.startsWith('HOST_SURROGATE'));
assert.ok(raw);
assert.equal(raw.code.charCodeAt(raw.code.length - 1), 0xd800);
assert.equal(raw.path.charCodeAt(raw.path.length - 1), 0xd800);
assert.equal(raw.message.charCodeAt(raw.message.length - 1), 0xd800);
assert.ok(callbackResult.diagnostics.some((item) => item.code === 'HOST-É'));
for (const [thrown, expected] of [
  [new Error('bad'), 'Error: bad'],
  [new TypeError('bad'), 'TypeError: bad'],
  [new RangeError('bad'), 'RangeError: bad'],
  ['bad', 'bad'],
  [new Error(`bad${surrogate}`), `Error: bad${surrogate}`],
]) {
  const failure = engine.validateDocument(callbackCase.document, [{
    id: callbackCase.registry.id, version: callbackCase.registry.version,
    scopes: [callbackCase.registry.scope], schema: true,
    semantics() { throw thrown; },
  }]).diagnostics.find((item) => item.code === 'VALIDATOR_FAILURE');
  assert.equal(failure?.message, expected);
}
let hostileGetterCalls = 0;
const hostile = Object.defineProperty({}, 'message', {get() { hostileGetterCalls++; throw new Error('getter invoked'); }});
const hostileFailure = engine.validateDocument(callbackCase.document, [{
  id: callbackCase.registry.id, version: callbackCase.registry.version,
  scopes: [callbackCase.registry.scope], schema: true,
  semantics() { throw hostile; },
}]).diagnostics.find((item) => item.code === 'VALIDATOR_FAILURE');
assert.equal(hostileFailure?.message, 'Host callback failed');
assert.equal(hostileGetterCalls, 0);

// Source/output ceilings apply to source text, not wire wrappers or aggregate
// copied strings. Exercise these boundaries against the installed host API.
const copied = copyJson({left: 'a'.repeat(3_000_000), right: 'b'.repeat(3_000_000)});
assert.equal(copied.left.length + copied.right.length, 6_000_000);
const validDocument = corpus.cases.find((item) => item.valid).document;
let meterCalls = 0;
const meteredEngine = createEngine(resources, {controls: {meter(amount) { assert.ok(amount > 0); meterCalls++; }}});
meteredEngine.validateDocument(validDocument);
assert.ok(meterCalls > 1, 'host meter must be polled during Rust work');
assert.throws(() => createEngine(resources, {controls: {maxWork: 0}}).validateDocument(validDocument), {code: 'RESOURCE_LIMIT'});
let cancellationPolls = 0;
const cancelledEngine = createEngine(resources, {controls: {isCancelled: () => ++cancellationPolls >= Math.max(4, Math.floor(meterCalls / 2))}});
assert.throws(() => cancelledEngine.validateDocument(validDocument), {code: 'CANCELLED'});
assert.ok(cancellationPolls > 3, 'cancellation must occur after Rust has progressed');
let clockPolls = 0;
const deadlineEngine = createEngine(resources, {controls: {now: () => ++clockPolls > Math.max(4, Math.floor(meterCalls / 2)) ? 101 : 99, deadlineMs: 100}});
assert.throws(() => deadlineEngine.validateDocument(validDocument), {code: 'DEADLINE'});
assert.ok(clockPolls > 3, 'injected deadline must elapse after Rust has progressed');
const meterFailureEngine = createEngine(resources, {controls: {meter() { throw new Error('meter failed'); }}});
assert.throws(() => meterFailureEngine.validateDocument(validDocument), {code: 'METER_FAILURE', message: 'Error: meter failed'});
const reentrantEngine = createEngine(resources);
let reentered = false;
const outerEngine = createEngine(resources, {controls: {meter() {
  if (!reentered) { reentered = true; reentrantEngine.validateDocument(validDocument); }
}}});
outerEngine.validateDocument(validDocument);
assert.equal(reentered, true, 'reentrant host work uses an independent engine context');
const compact = JSON.stringify(validDocument);
const source = compact + ' '.repeat(4_000_000 - compact.length);
assert.equal(source.length, 4_000_000);
assert.equal(canonical(engine.readDocument(source, 'json')), canonical(validDocument));
function yamlMap(count) {
  return Array.from({length: count}, (_, index) => `k${String(index).padStart(5, '0')}: null\n`).join('');
}
const acceptedYamlMap = engine.readValue(yamlMap(99_999), 'yaml');
assert.equal(Object.keys(acceptedYamlMap).length, 99_999, 'YAML map has 99,999 values plus its root');
assert.throws(() => engine.readValue(yamlMap(100_000), 'yaml'), {code: 'LIMIT'}, 'YAML map with 100,000 values plus root exceeds 100,000');
function nested(count) {
  let value = 'leaf';
  for (let index = 0; index < count; index++) value = {x: value};
  return value;
}
const inventoryDepth128 = structuredClone(validDocument);
inventoryDepth128.modules[0].elements[0].extensions.r2Boundary = nested(122);
assert.doesNotThrow(() => engine.validateDocument(inventoryDepth128), 'a depth-128 extension payload inside a module inventory must be accepted');
const inventoryDepth129 = structuredClone(validDocument);
inventoryDepth129.modules[0].elements[0].extensions.r2Boundary = nested(123);
assert.throws(() => engine.validateDocument(inventoryDepth129), {code: 'LIMIT'}, 'a depth-129 extension payload inside a module inventory must be refused');
copyJson(nested(128));
assert.throws(() => copyJson(nested(129), {maxDepth: 256}), {code: 'LIMIT'});

process.stdout.write(`${JSON.stringify({status: 'pass', runtime: typeof Bun === 'undefined' ? `Node ${process.version}` : `Bun ${Bun.version}`, engineVersion, fixture, fixtureSha256: await import('node:crypto').then(({createHash}) => createHash('sha256').update(corpusRaw).digest('hex')), cases: corpus.cases.length, orderedDiagnostics: true, copiedTextUnits: 6_000_000, sourceTextUnits: source.length, maxDocumentDepth: 128, inventoryExtensionDepth: {accepted: 122, refused: 123}, hostControls: ['meter', 'cancel', 'deadline', 'reentry']})}\n`);
