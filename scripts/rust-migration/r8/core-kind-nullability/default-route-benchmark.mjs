// SPDX-License-Identifier: MIT OR Apache-2.0
// Diagnostic only: compare one retained Rust host-input runtime with the
// TypeScript predecessor, recording setup separately from warmed calls.
import {readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {createCoreKindNullabilityHostInputEngine} from '../../../../bindings/core/node/index.js';

const read = async path => JSON.parse(await readFile(path, 'utf8'));
const [source, coreSchema, referenceSchema, packageSchema, constraints, domainPolicy] = await Promise.all([
  read('scripts/rust-migration/r5/kind-nullability/input.json'),
  read('spec/core/schema.json'),
  read('spec/core/semantic-type-reference.schema.json'),
  read('spec/core/extension-package.schema.json'),
  read('spec/metamodel/generated/core-constraints.json'),
  read('spec/metamodel/generated/domain-policy.json'),
]);
const resources = {coreSchema, referenceSchema, packageSchema, constraints, domainPolicy};
const identity = {module: 'm', element: 'known'};
const iterations = Number(process.env.UMF_KIND_BENCH_ITERATIONS ?? 30);
const rounds = Number(process.env.UMF_KIND_BENCH_ROUNDS ?? 5);
if (!Number.isSafeInteger(iterations) || iterations < 30 || !Number.isSafeInteger(rounds) || rounds < 5) {
  throw new RangeError('Benchmark requires at least five rounds of thirty calls');
}

let inspectCoreElementKind;
if (process.versions.bun) {
  ({inspectCoreElementKind} = await import('../../../../src/model/field-kind.ts'));
} else {
  ({inspectCoreElementKind} = await import('../../../../dist/umf-node.js'));
}

const result = [];
for (let round = 0; round < rounds; round++) {
  const order = round % 2 === 0 ? 'typescript-first' : 'rust-first';
  let typescriptMs;
  if (order === 'typescript-first') {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) inspectCoreElementKind(source, identity);
    typescriptMs = performance.now() - start;
  }
  const setupStart = performance.now();
  const engine = createCoreKindNullabilityHostInputEngine(resources);
  const setupMs = performance.now() - setupStart;
  const rustStart = performance.now();
  for (let i = 0; i < iterations; i++) engine.inspectCoreElementKind(source, identity);
  const rustMs = performance.now() - rustStart;
  if (order === 'rust-first') {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) inspectCoreElementKind(source, identity);
    typescriptMs = performance.now() - start;
  }
  result.push({
    order,
    iterations,
    setupMs: Math.round(setupMs * 100) / 100,
    typescriptMs: Math.round(typescriptMs * 100) / 100,
    rustWarmMs: Math.round(rustMs * 100) / 100,
    typescriptPerCallMs: Math.round(typescriptMs / iterations * 1000) / 1000,
    rustWarmPerCallMs: Math.round(rustMs / iterations * 1000) / 1000,
  });
}
console.log(JSON.stringify({
  status: 'diagnostic-only',
  operation: 'inspectCoreElementKind',
  source: 'scripts/rust-migration/r5/kind-nullability/input.json',
  runtime: process.versions.bun ? `Bun ${process.versions.bun} (Node ${process.versions.node})` : `Node ${process.version}`,
  platform: process.platform,
  arch: process.arch,
  iterations,
  rounds,
  result,
}, null, 2));
