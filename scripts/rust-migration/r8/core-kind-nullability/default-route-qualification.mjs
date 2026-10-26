// SPDX-License-Identifier: MIT OR Apache-2.0
// Current-source qualification gate for the private retained Rust candidate.
// Run in Node or Bun with UMF_R8_NODE_BINDING naming an isolated binding copy.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

const read = async path => JSON.parse(await readFile(path, 'utf8'));
const sha = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const bindingPath = process.env.UMF_R8_NODE_BINDING;
if (!bindingPath) throw new Error('Set UMF_R8_NODE_BINDING to the isolated current-source Node binding copy');
const binding = await import(resolve(bindingPath));
const {createCoreModelRootKindNullabilityEngine} = binding;
const tsModule = process.env.UMF_KIND_TYPESCRIPT_MODULE
  ? await import(resolve(process.env.UMF_KIND_TYPESCRIPT_MODULE))
  : await import('../../../../src/model/field-kind.ts');
const tsInspect = tsModule.inspectCoreElementKind;
const [source, coreSchema, referenceSchema, packageSchema, constraints, domainPolicy] = await Promise.all([
  read('scripts/rust-migration/r5/kind-nullability/input.json'),
  read('spec/core/schema.json'),
  read('spec/core/semantic-type-reference.schema.json'),
  read('spec/core/extension-package.schema.json'),
  read('spec/metamodel/generated/core-constraints.json'),
  read('spec/metamodel/generated/domain-policy.json'),
]);
const resources = {coreSchema, referenceSchema, packageSchema, constraints, domainPolicy};
const identity = {module:'m', element:'known'};
const normalize = value => JSON.parse(JSON.stringify(value));
const outcome = run => {
  try { return {ok:true, value:normalize(run())}; }
  catch (error) { return {ok:false, error:{code:error?.code ?? '', message:error?.message ?? String(error), path:error?.path ?? ''}}; }
};
const eventProxy = (value, label, events, faultAt = '') => new Proxy(value, {
  getPrototypeOf(target) { events.push(`${label}:prototype`); if (faultAt === 'prototype') throw new Error(`${label} first fault`); return Reflect.getPrototypeOf(target); },
  ownKeys(target) { events.push(`${label}:ownKeys`); if (faultAt === 'ownKeys') throw new Error(`${label} first fault`); return Reflect.ownKeys(target); },
  getOwnPropertyDescriptor(target, key) { events.push(`${label}:descriptor:${String(key)}`); if (faultAt === `descriptor:${String(key)}`) throw new Error(`${label} first fault`); return Reflect.getOwnPropertyDescriptor(target, key); },
});

// The caller resource snapshot must have the exact staged reflection order,
// admit no accessor execution, and stop at the first failing control charge.
const resourceEvents = [];
const observedResources = eventProxy(resources, 'resource', resourceEvents);
const rust = createCoreModelRootKindNullabilityEngine(observedResources);
const resourceSnapshotEvents = [...resourceEvents];
assert.equal(resourceEvents.filter(e => e === 'resource:prototype').length, 6);
assert.equal(resourceEvents.filter(e => e === 'resource:ownKeys').length, 1);
assert.equal(resourceEvents.filter(e => e.startsWith('resource:descriptor:')).length, 5);
assert.deepEqual(resourceSnapshotEvents, ['resource:prototype','resource:ownKeys',
  'resource:prototype','resource:descriptor:coreSchema',
  'resource:prototype','resource:descriptor:referenceSchema',
  'resource:prototype','resource:descriptor:packageSchema',
  'resource:prototype','resource:descriptor:constraints',
  'resource:prototype','resource:descriptor:domainPolicy']);
const afterFactory = resourceEvents.length;
rust.inspectCoreElementKind(source, identity);
assert.equal(resourceEvents.length, afterFactory, 'retained operation re-reflected caller resources');

let getterCalls = 0;
const accessorResources = {...resources};
Object.defineProperty(accessorResources, 'coreSchema', {enumerable:true, get() { getterCalls++; return coreSchema; }});
assert.throws(() => createCoreModelRootKindNullabilityEngine(accessorResources), TypeError);
assert.equal(getterCalls, 0, 'resource accessor was invoked');

const unknownEvents = [];
const unknownResources = eventProxy({...resources, unexpected: true}, 'unknown-resource', unknownEvents);
assert.throws(() => createCoreModelRootKindNullabilityEngine(unknownResources), /Unknown explicit engine resource/);
assert.deepEqual(unknownEvents, ['unknown-resource:prototype','unknown-resource:ownKeys']);

const faultEvents = [];
const setupControlEvents = [];
const faultResources = eventProxy(resources, 'meter-fault-resource', faultEvents);
assert.throws(() => createCoreModelRootKindNullabilityEngine(faultResources, {
  resourceControls:{meter(){setupControlEvents.push('meter'); throw new Error('setup cutoff');}, isCancelled(){setupControlEvents.push('cancel'); return false;}, now(){setupControlEvents.push('clock'); return 1;}, deadlineMs:0},
}), error => error?.code === 'METER_FAILURE');
assert.deepEqual(setupControlEvents, ['meter']);
assert.deepEqual(faultEvents, [], 'resource reflection continued after first setup meter fault');

// Compare first-fault order on the actual operation inputs under the same host.
// Source is admitted before identity; an identity trap must remain untouched
// when source admission itself faults.
const firstFault = route => {
  const events = [];
  const badSource = eventProxy(source, 'source', events, 'prototype');
  const badIdentity = eventProxy(identity, 'identity', events, 'ownKeys');
  const observed = route === 'typescript'
    ? outcome(() => tsInspect(badSource, badIdentity))
    : outcome(() => rust.inspectCoreElementKind(badSource, badIdentity));
  return {events, observed};
};
const tsFirstFault = firstFault('typescript');
const rustFirstFault = firstFault('rust');
assert.equal(tsFirstFault.events[0], 'source:prototype');
assert.equal(rustFirstFault.events[0], 'source:prototype');
assert.equal(tsFirstFault.events.some(event => event.startsWith('identity:')), false);
assert.equal(rustFirstFault.events.some(event => event.startsWith('identity:')), false);
assert.equal(tsFirstFault.observed.error.message, 'source first fault');
assert.equal(rustFirstFault.observed.error.message, 'source first fault');

// A valid proxied input also checks the complete resource order and first
// operation-fault order against the live TypeScript predecessor.
const traceRoute = route => {
  const events = [];
  const sourceProxy = eventProxy(source, 'source', events);
  const identityProxy = eventProxy(identity, 'identity', events);
  const result = outcome(() => route === 'typescript'
    ? tsInspect(sourceProxy, identityProxy)
    : rust.inspectCoreElementKind(sourceProxy, identityProxy));
  return {events, result};
};
const tsTrace = traceRoute('typescript');
const rustTrace = traceRoute('rust');
assert.deepEqual(rustTrace.events, tsTrace.events, 'Rust source/identity reflection order differs from live TypeScript');
assert.deepEqual(rustTrace.result, tsTrace.result, 'Rust success envelope differs from live TypeScript');

const iterations = Number(process.env.UMF_KIND_BENCH_ITERATIONS ?? 30);
const rounds = Number(process.env.UMF_KIND_BENCH_ROUNDS ?? 5);
if (!Number.isSafeInteger(iterations) || iterations < 30 || !Number.isSafeInteger(rounds) || rounds < 5) {
  throw new RangeError('Qualification benchmark requires at least five rounds of thirty calls');
}
const bench = [];
let checksum = '';
for (let round = 0; round < rounds; round++) {
  const order = round % 2 === 0 ? 'typescript-first' : 'rust-first';
  const setupStart = performance.now();
  const engine = createCoreModelRootKindNullabilityEngine(resources);
  const setupMs = performance.now() - setupStart;
  const runTypeScript = () => {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) checksum = tsInspect(source, identity).meaning.state;
    return performance.now() - start;
  };
  const runRust = () => {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) checksum = engine.inspectCoreElementKind(source, identity).meaning.state;
    return performance.now() - start;
  };
  let typescriptMs, rustWarmMs;
  if (order === 'typescript-first') { typescriptMs = runTypeScript(); rustWarmMs = runRust(); }
  else { rustWarmMs = runRust(); typescriptMs = runTypeScript(); }
  bench.push({order, iterations, setupMs:+setupMs.toFixed(3),
    typescriptMs:+typescriptMs.toFixed(3), rustWarmMs:+rustWarmMs.toFixed(3),
    typescriptPerCallMs:+(typescriptMs / iterations).toFixed(4), rustWarmPerCallMs:+(rustWarmMs / iterations).toFixed(4),
    ratio:+(rustWarmMs / typescriptMs).toFixed(2)});
}
const median = xs => [...xs].sort((a,b) => a-b)[Math.floor(xs.length / 2)];
console.log(JSON.stringify({
  format:'umf-r8-kind-nullability-default-qualification/1', status:'pass',
  runtime:process.versions.bun ? `Bun ${process.versions.bun} / Node ${process.versions.node}` : `Node ${process.version}`,
  platform:process.platform, arch:process.arch,
  resources:{order:resourceSnapshotEvents, firstFault:{meter:setupControlEvents, reflectedResources:faultEvents}, accessorGetterCalls:getterCalls, unknownResource:unknownEvents},
  operation:{typescriptFirstFault:tsFirstFault, rustFirstFault:rustFirstFault, tsReflection:tsTrace.events, rustReflection:rustTrace.events, successEnvelopeEqual:true},
  benchmark:{rounds,iterations,medianRatio:median(bench.map(row=>row.ratio)),measurements:bench},
  checksum,
  sourceHashes:{
    'scripts/rust-migration/r8/core-kind-nullability/default-route-qualification.mjs':await sha('scripts/rust-migration/r8/core-kind-nullability/default-route-qualification.mjs'),
    'src/model/field-kind.ts':await sha('src/model/field-kind.ts'),
    'bindings/core/node/index.js':await sha('bindings/core/node/index.js'),
    'bindings/core/node/src/host-json.js':await sha('bindings/core/node/src/host-json.js'),
    rustBinding:await sha(resolve(bindingPath,'../umf_core_node.node')),
    typescriptModule:process.env.UMF_KIND_TYPESCRIPT_MODULE ? await sha(resolve(process.env.UMF_KIND_TYPESCRIPT_MODULE)) : 'direct-typescript-import',
  },
}, null, 2));
