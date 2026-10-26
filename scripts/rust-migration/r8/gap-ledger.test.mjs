import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildLedger, collectPythonPackageAssets, collectPythonSourceFiles } from './gap-ledger.mjs';
import { requiredR8RouteFamilies, validateR8InstalledRouteEvidence } from './installed-route-evidence.mjs';
import { normalizeR8RouteHostReceipt } from './installed-route-receipt-adapter.mjs';

const inventory = { symbols: [
  { routeId: 'package-root', exportName: 'inspectCoreSemanticTypes', declarationName: 'inspectCoreSemanticTypes', declarationKind: 'FunctionDeclaration', source: 'src/model/semantic-types.ts', line: 23, sourceSha256: 'a'.repeat(64) },
  { routeId: 'package-root', exportName: 'futureAlgorithm', declarationName: 'futureAlgorithm', declarationKind: 'FunctionDeclaration', source: 'src/adapters/future/index.ts', line: 4, sourceSha256: 'b'.repeat(64) },
  { routeId: 'package-root', exportName: 'schema', declarationName: 'schema', declarationKind: 'SourceFile', source: 'spec/core/schema.json', line: 1, sourceSha256: 'c'.repeat(64) },
  { routeId: 'candidate-v2-node', exportName: 'candidateOnly', declarationName: 'candidateOnly', declarationKind: 'FunctionDeclaration', source: 'src/node.ts', line: 1, sourceSha256: 'd'.repeat(64) },
] };
const cliSource = 'fn main() { env::args().nth(1).as_deref() == Some("core"); env::args().nth(1).as_deref() == Some("codegen"); }\n#[cfg(feature = "codegen")]\nconst RESOURCE_PROFILE: &str = "x";\nfn run(args: Vec<String>) { args.first().map(String::as_str) == Some("reference"); args.first().map(String::as_str) != Some("metamodel"); }\n#[cfg(feature = "embedded-adapters")]\nfn iceberg_run() {}';
const args = { inventory, packageJson: { scripts: { 'build:check': 'bun scripts/build.ts', 'test:unit': 'bun test' } }, cliBytes: Buffer.from(cliSource), pythonPackages: [
  { packageName: 'umf', path: 'python/src/umf', init: Buffer.from('__all__ = ["Document", "validate_document"]'), files: [{ path: 'python/src/umf/__init__.py', bytes: Buffer.from('def validate_document(): pass\ndef _internal(): pass') }], assets: [{ path: 'python/src/umf/py.typed', bytes: Buffer.from('') }, { path: 'python/src/umf/_native.so', bytes: Buffer.from('binary') }] },
  { packageName: 'umf_access', path: 'python/umf_access/src/umf_access', init: Buffer.from('from .capture import (\n    Captured as Captured,\n    capture as capture,\n)\nfrom .dsl import Join as Join\n'), files: [], assets: [] },
], scriptFiles: [{ path: 'scripts/build.ts', sha256: 'e'.repeat(64) }] };
const currentGeneratedLedger = () => JSON.parse(execFileSync('node', [
  'scripts/rust-migration/r8/gap-ledger.mjs', '--stdout',
], {
  cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024, encoding: 'utf8',
}));

test('current V4 root exports preserve temporal gaps and recognize bounded Core Relationships evidence', () => {
  const inventoryReceipt = JSON.parse(readFileSync('docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/inventory.json', 'utf8'));
  const ledger = currentGeneratedLedger();
  const expected = [
    'parseGregorianDate', 'truncateGregorianDate', 'parseRfc3339ExactInstant', 'sameRfc3339ExactInstant',
    'inspectCoreRelationships', 'lookupCoreRelationship', 'declareCoreRelationship', 'verifyCoreRelationshipOperation',
  ];
  const entries = new Map(inventoryReceipt.defaultRouteEntrySelections.map(selection => [selection.routeId, selection]));
  for (const routeId of ['package-root-node', 'package-root-browser']) {
    const selection = entries.get(routeId);
    assert.equal(selection.directExportCount, 44);
    assert.ok(expected.every(name => selection.directExports.includes(name)), `${routeId} misses an override`);
    const rows = ledger.rows.filter(row => row.routeId === routeId && expected.includes(row.exportName));
    assert.equal(rows.length, expected.length);
    assert.ok(rows.every(row => row.sourceSelectedImplementation !== null));
    assert.ok(rows.every(row => row.acceptedRustOperation !== null));
    const temporal = rows.filter(row => ['parseGregorianDate', 'truncateGregorianDate', 'parseRfc3339ExactInstant', 'sameRfc3339ExactInstant'].includes(row.exportName));
    const relationships = rows.filter(row => row.exportName.includes('CoreRelationship'));
    assert.equal(temporal.length, 4);
    assert.ok(temporal.every(row => row.bindingRouteStatus === 'unproven' && row.sourceSelectedImplementation.status === 'installed-private-prior-cohort'));
    assert.equal(relationships.length, 4);
    assert.ok(relationships.every(row => row.bindingRouteStatus === 'unproven' && row.sourceSelectedImplementation.status === 'installed-private-fixed-point-cohort'));
  }
  const reference = ledger.rows.filter(row => row.routeId === 'package-reference' && expected.includes(row.exportName));
  assert.equal(reference.length, expected.length);
  assert.ok(reference.every(row => row.sourceSelectedImplementation === null));
  assert.equal(ledger.counts.executableDefaultRouteGaps, 922);
  assert.equal(ledger.counts.sourceSelectedRustOverrides, 88);
  const archivedGate = JSON.parse(readFileSync('docs/helix/04-build/evidence/rust-migration/r8-installed-route-evidence/current-6f4f21c1/gate-result.json', 'utf8'));
  assert.equal(archivedGate.status, 'pass');
  assert.equal(archivedGate.archive.sourceClosureSha256, '6f4f21c1dfbdde5959f6e5386419c0c2f90b3a8f0512d148b60825e93afce593');
  assert.equal(archivedGate.boundedOperations, 24);
});

test('superseded a2552db0 route aggregate stays rejected after its captured source drifts', () => {
  const aggregate = JSON.parse(readFileSync('docs/helix/04-build/evidence/rust-migration/r8-installed-route-evidence/current-a2552db0/aggregate.json', 'utf8'));
  assert.throws(() => validateR8InstalledRouteEvidence(aggregate), /current live source drift:/);
});

test('Schema Properties source selections keep exact CONTRACT-049 mappings separate from the five-family aggregate gate', () => {
  const ledger = currentGeneratedLedger();
  const expected = new Map([
    ['declareCoreSchemaProperties', 'umf_core::schema_properties::declare_core_schema_properties'],
    ['inspectCoreSchemaProperties', 'umf_core::schema_properties::inspect_core_schema_properties'],
    ['validateCoreFieldValue', 'umf_core::Engine::validate_core_field_value_public'],
    ['resolveCoreDefault', 'umf_core::Engine::resolve_core_default_public'],
  ]);
  for (const routeId of ['package-root-node', 'package-root-browser']) {
    for (const [name, rustOwner] of expected) {
      const row = ledger.rows.find(item => item.routeId === routeId && item.exportName === name);
      assert.ok(row, `${routeId}:${name} is absent`);
      assert.equal(row.source, routeId === 'package-root-node' ? 'src/index-node-v4.ts' : 'src/index-browser-v4.ts');
      assert.equal(row.acceptedRustOperation, rustOwner);
      assert.equal(row.sourceSelectedImplementation.status, 'source-selected-installed-private-schema-properties-cohort');
      assert.equal(row.sourceSelectedImplementation.rustOwner, rustOwner);
      assert.equal(row.sourceSelectedImplementation.wireOperation, `model/${name}`);
      assert.match(row.sourceSelectedImplementation.bindingRoute, /core-model wrapper -> model wire -> Rust/);
      assert.equal(row.bindingRouteStatus, 'unproven');
      assert.equal(row.bindingRoute, null);
      assert.match(row.sourceSelectedImplementation.qualificationStatus, /aggregate five-family route gate excludes this family/);
      for (const evidence of [
        'docs/helix/04-build/evidence/rust-migration/r5-schema-properties/frozen-typescript.json',
        'docs/helix/04-build/evidence/rust-migration/r5-field-value/frozen-typescript.json',
        'docs/helix/04-build/evidence/rust-migration/r5-schema-defaults/frozen-typescript.json',
        'docs/helix/04-build/evidence/rust-migration/r8-schema-properties-installed/receipt-current-b2f816d7.json',
        'docs/helix/04-build/evidence/rust-migration/r8-schema-properties-installed/route-gate-current-b2f816d7.json',
      ]) assert.ok(row.acceptedOperationEvidence.evidenceClosure.some(item => item.path === evidence), `${name} evidence omits ${evidence}`);
      assert.ok(row.sourceSelectedImplementation.qualificationEvidenceClosure.some(item => item.path === 'docs/helix/04-build/evidence/rust-migration/r8-schema-properties-installed/route-gate-current-b2f816d7.json'));
      assert.ok(row.acceptedOperationEvidence.focusedTestClosure.length > 0);
    }
  }
  for (const [name] of expected) {
    const reference = ledger.rows.find(item => item.routeId === 'package-reference' && item.exportName === name);
    assert.equal(reference.sourceSelectedImplementation, null);
    assert.equal(reference.implementationStatus, 'TypeScript reference implementation remains explicit');
  }
  assert.equal(ledger.counts.executableWithAcceptedOptInRustOperation, 67);
  assert.equal(ledger.counts.executableWithoutAcceptedRustMapping, 855);
  assert.equal(ledger.counts.executableDefaultRouteGaps, 922);
  const aggregate = JSON.parse(readFileSync('docs/helix/04-build/evidence/rust-migration/r8-installed-route-evidence/current-6f4f21c1/aggregate.json', 'utf8'));
  const aggregateNames = Object.values(aggregate.families).flatMap(family => family.operations);
  assert.equal(Object.keys(aggregate.families).length, 5);
  assert.equal(aggregateNames.length, 24);
  assert.ok([...expected.keys()].every(name => !aggregateNames.includes(name)), 'the separate four-operation Schema gate must not inflate aggregate evidence');
});

test('PostgreSQL Cardinality projection schema pins exact writer, contract inputs and package closure', () => {
  execFileSync('bun', ['scripts/core-ideals/cardinality-postgresql-projection-schema.ts', '--check'], { cwd: process.cwd(), stdio: 'pipe' });
  const ledger = JSON.parse(readFileSync('docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/gap-ledger.json', 'utf8'));
  const rows = ledger.rows.filter(row => row.source === 'spec/core/cardinality-postgresql-projection.schema.json');
  assert.equal(new Set(rows.map(row => row.routeId)).size, 3);
  for (const row of rows) {
    const authority = row.resourceOwnership.authority;
    assert.equal(authority.status, 'generated-authority-known');
    assert.equal(authority.kind, 'generated-from-exact-single-output-projection-schema-writer');
    assert.deepEqual(authority.generator.entrypoints, ['scripts/core-ideals/cardinality-postgresql-projection-schema.ts']);
    assert.deepEqual(authority.governingArtifacts, [
      'docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md',
      'docs/helix/02-design/technical-designs/TD-042-core-cardinality.md',
      'docs/helix/01-frame/user-stories/US-042-core-cardinality.md',
    ]);
    assert.ok(authority.generatorInputs.includes('spec/core/field-postgresql-projection.schema.json'));
    assert.ok(authority.sourceClosure.some(item => item.path === 'scripts/core-ideals/cardinality-postgresql-projection-schema.ts'));
    assert.ok(authority.sourceClosure.some(item => item.path === 'tests/core-ideals/cardinality-postgresql-projection.test.ts'));
    assert.ok(row.resourceOwnership.routes.some(route => route.id === 'sdk-archive'
      && route.artifactPath === 'package/dist/spec/core/cardinality-postgresql-projection.schema.json'));
  }
});

test('PostgreSQL Field projection schema pins its exact writer and TableSpec base authority independently', () => {
  execFileSync('bun', ['scripts/core-ideals/field-postgresql-projection-schema.ts', '--check'], { cwd: process.cwd(), stdio: 'pipe' });
  const ledger = JSON.parse(readFileSync('docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/gap-ledger.json', 'utf8'));
  const row = ledger.rows.find(item => item.source === 'spec/core/field-postgresql-projection.schema.json');
  const authority = row.resourceOwnership.authority;
  assert.equal(authority.status, 'generated-authority-known');
  assert.equal(authority.kind, 'generated-from-exact-single-output-projection-schema-writer');
  assert.deepEqual(authority.generator.entrypoints, ['scripts/core-ideals/field-postgresql-projection-schema.ts']);
  assert.deepEqual(authority.governingArtifacts, [
    'docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md',
    'docs/helix/02-design/technical-designs/TD-040-core-field.md',
    'docs/helix/01-frame/user-stories/US-040-core-field.md',
  ]);
  assert.deepEqual(authority.governingClauses, ['US-040-AC3', 'US-040-AC4', 'US-040-AC5']);
  assert.deepEqual(authority.generatorInputs, ['spec/core/field-tablespec-projection.schema.json']);
  assert.ok(authority.sourceClosure.some(item => item.path === 'scripts/core-ideals/field-postgresql-projection-schema.ts'));
  assert.ok(authority.sourceClosure.some(item => item.path === 'tests/core-ideals/field-postgresql-projection.test.ts'));
  assert.ok(row.resourceOwnership.routes.some(route => route.id === 'sdk-archive'
    && route.artifactPath === 'package/dist/spec/core/field-postgresql-projection.schema.json'));
  const importedBase = ledger.rows.find(item => item.source === 'spec/core/field-tablespec-projection.schema.json');
  assert.equal(importedBase.resourceOwnership.authority.status, 'generated-authority-known');
  assert.deepEqual(importedBase.resourceOwnership.authority.generator.entrypoints, ['scripts/core-ideals/field-tablespec-projection-schema.ts']);
});

test('TableSpec Field projection schema pins its self-contained writer and policy helper', () => {
  execFileSync('bun', ['scripts/core-ideals/field-tablespec-projection-schema.ts', '--check'], { cwd: process.cwd(), stdio: 'pipe' });
  const ledger = JSON.parse(readFileSync('docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/gap-ledger.json', 'utf8'));
  const row = ledger.rows.find(item => item.source === 'spec/core/field-tablespec-projection.schema.json');
  const authority = row.resourceOwnership.authority;
  assert.equal(authority.status, 'generated-authority-known');
  assert.equal(authority.kind, 'generated-from-exact-self-contained-projection-schema-writer');
  assert.deepEqual(authority.generator.entrypoints, ['scripts/core-ideals/field-tablespec-projection-schema.ts']);
  assert.deepEqual(authority.generatorInputs, []);
  assert.deepEqual(authority.governingArtifacts, [
    'docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md',
    'docs/helix/02-design/technical-designs/TD-040-core-field.md',
    'docs/helix/01-frame/user-stories/US-040-core-field.md',
  ]);
  assert.ok(authority.sourceClosure.some(item => item.path === 'scripts/core-ideals/projection-policy-schema.ts'));
  assert.ok(authority.sourceClosure.some(item => item.path === 'src/core-ideals/field-tablespec-projection.ts'));
  assert.ok(authority.sourceClosure.some(item => item.path === 'tests/core-ideals/field-tablespec-projection.test.ts'));
  assert.ok(row.resourceOwnership.routes.some(route => route.id === 'sdk-archive'
    && route.artifactPath === 'package/dist/spec/core/field-tablespec-projection.schema.json'));
});

test('TableSpec Cardinality projection schema pins its direct Field base and package closure', async () => {
  const generator = 'scripts/core-ideals/cardinality-tablespec-projection-schema.ts';
  const resource = 'spec/core/cardinality-tablespec-projection.schema.json';
  const base = 'spec/core/field-tablespec-projection.schema.json';
  const before = createHash('sha256').update(readFileSync(resource)).digest('hex');
  execFileSync('bun', [generator, '--check'], { stdio: 'pipe' });
  assert.equal(createHash('sha256').update(readFileSync(resource)).digest('hex'), before);
  const ledger = JSON.parse(readFileSync('docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/gap-ledger.json', 'utf8'));
  const row = ledger.rows.find(item => item.source === resource);
  assert.ok(row);
  const authority = row.resourceOwnership.authority;
  assert.equal(authority.status, 'generated-authority-known');
  assert.equal(authority.kind, 'generated-from-exact-single-output-projection-schema-writer');
  assert.deepEqual(authority.generator.entrypoints, [generator]);
  assert.deepEqual(authority.generatorInputs, [base]);
  assert.deepEqual(authority.governingArtifacts, [
    'docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md',
    'docs/helix/02-design/technical-designs/TD-042-core-cardinality.md',
    'docs/helix/01-frame/user-stories/US-042-core-cardinality.md',
  ]);
  assert.deepEqual(authority.governingClauses, ['US-042-AC3', 'US-042-AC4', 'US-042-AC5']);
  for (const file of [...authority.governingArtifacts, generator, base,
    'src/core-ideals/cardinality-tablespec-projection.ts',
    'tests/core-ideals/cardinality-tablespec-projection.test.ts', 'src/index.ts', 'scripts/build.ts',
    'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py']) {
    assert.ok(authority.sourceClosure.some(item => item.path === file && /^[a-f0-9]{64}$/.test(item.sha256)), `closure omits ${file}`);
  }
  assert.equal(ledger.rows.find(item => item.source === base).resourceOwnership.authority.status, 'generated-authority-known',
    'the imported Field base is qualified independently, not promoted transitively');
  assert.ok(row.resourceOwnership.routes.some(route => route.id === 'sdk-archive'
    && route.artifactPath === 'package/dist/spec/core/cardinality-tablespec-projection.schema.json'));
  assert.equal(ledger.counts.resourceAuthorityByStatus['generated-authority-known'], 56);
  assert.equal(ledger.counts.executableDefaultRouteGaps, 922);
});

test('SQL Server Field and Cardinality projection schemas pin exact writer chains', () => {
  const ledger = JSON.parse(readFileSync('docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/gap-ledger.json', 'utf8'));
  const expected = new Map([
    ['spec/core/field-sqlserver-projection.schema.json', {
      generator: 'scripts/core-ideals/field-sqlserver-projection-schema.ts',
      consumer: 'src/core-ideals/field-sqlserver-projection.ts',
      input: 'spec/core/field-postgresql-projection.schema.json',
      clauses: ['US-040-AC3', 'US-040-AC4', 'US-040-AC5', 'US-031-AC5'],
      artifacts: ['docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md',
        'docs/helix/02-design/technical-designs/TD-040-core-field.md',
        'docs/helix/01-frame/user-stories/US-040-core-field.md',
        'docs/helix/02-design/contracts/CONTRACT-031-sqlserver.md'],
    }],
    ['spec/core/cardinality-sqlserver-projection.schema.json', {
      generator: 'scripts/core-ideals/cardinality-sqlserver-projection-schema.ts',
      consumer: 'src/core-ideals/cardinality-sqlserver-projection.ts',
      input: 'spec/core/field-sqlserver-projection.schema.json',
      clauses: ['US-042-AC3', 'US-042-AC4', 'US-042-AC5', 'US-031-AC5'],
      artifacts: ['docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md',
        'docs/helix/02-design/technical-designs/TD-042-core-cardinality.md',
        'docs/helix/01-frame/user-stories/US-042-core-cardinality.md',
        'docs/helix/02-design/contracts/CONTRACT-031-sqlserver.md'],
    }],
  ]);
  const index = readFileSync('src/index.ts', 'utf8');
  for (const [resource, expectation] of expected) {
    const before = createHash('sha256').update(readFileSync(resource)).digest('hex');
    execFileSync('bun', [expectation.generator, '--check'], { stdio: 'pipe' });
    const after = createHash('sha256').update(readFileSync(resource)).digest('hex');
    assert.equal(after, before, `${expectation.generator} --check must be read-only`);
    const row = ledger.rows.find(item => item.source === resource);
    assert.ok(row, `${resource} is absent from the current ledger`);
    const authority = row.resourceOwnership.authority;
    assert.equal(authority.status, 'generated-authority-known', resource);
    assert.equal(authority.kind, 'generated-from-exact-single-output-projection-schema-writer', resource);
    assert.deepEqual(authority.generator.entrypoints, [expectation.generator]);
    assert.deepEqual(authority.generatorInputs, [expectation.input]);
    assert.deepEqual(authority.governingArtifacts, expectation.artifacts);
    assert.deepEqual(authority.governingClauses, expectation.clauses);
    for (const file of [...expectation.artifacts, expectation.generator, expectation.input, expectation.consumer,
      'src/index.ts', 'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py']) {
      assert.ok(authority.sourceClosure.some(item => item.path === file && /^[a-f0-9]{64}$/.test(item.sha256)), `${resource} closure omits ${file}`);
    }
    assert.ok(index.includes(`'./core-ideals/${expectation.consumer.split('/').at(-1).replace(/\.ts$/, '')}'`), `${resource} consumer is not exported from src/index.ts`);
    assert.ok(readFileSync(expectation.consumer, 'utf8').includes(`../../${resource}`), `${resource} is not directly consumed/exported by its runtime module`);
    assert.ok(row.resourceOwnership.routes.some(route => route.id === 'sdk-archive'
      && route.artifactPath === `package/dist/spec/${resource.slice('spec/'.length)}`));
  }
  const field = ledger.rows.find(item => item.source === 'spec/core/field-sqlserver-projection.schema.json');
  assert.equal(field.resourceOwnership.authority.status, 'generated-authority-known');
  assert.deepEqual(field.resourceOwnership.authority.generatorInputs, ['spec/core/field-postgresql-projection.schema.json']);
  assert.equal(ledger.counts.executableDefaultRouteGaps, 922);
  assert.equal(ledger.counts.resourceAuthorityByStatus['generated-authority-known'], 56);
});

test('SQL Server schema writer --check rejects stale output in an isolated project copy', async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), 'umf-r8-sqlserver-schema-'));
  const copy = async file => {
    const destination = path.join(sandbox, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(file, destination);
  };
  try {
    for (const file of [
      'scripts/core-ideals/field-sqlserver-projection-schema.ts',
      'scripts/core-ideals/cardinality-sqlserver-projection-schema.ts',
      'scripts/core-ideals/projection-policy-schema.ts',
      'src/core-ideals/sqlserver-syntax.ts', 'src/model/types.ts', 'src/model/errors.ts',
      'src/generated/core-model.ts',
      'spec/core/schema.json', 'spec/core/semantic-type-reference.schema.json',
      'spec/core/extension-package.schema.json', 'spec/metamodel/generated/core-constraints.json',
      'spec/metamodel/generated/domain-policy.json',
      'spec/core/field-postgresql-projection.schema.json',
      'spec/core/field-sqlserver-projection.schema.json',
      'spec/core/cardinality-sqlserver-projection.schema.json',
    ]) await copy(file);
    for (const output of ['spec/core/field-sqlserver-projection.schema.json', 'spec/core/cardinality-sqlserver-projection.schema.json']) {
      const target = path.join(sandbox, output);
      await writeFile(target, `${await readFile(target, 'utf8')} `);
    }
    for (const script of ['scripts/core-ideals/field-sqlserver-projection-schema.ts', 'scripts/core-ideals/cardinality-sqlserver-projection-schema.ts']) {
      assert.throws(() => execFileSync('bun', [script, '--check'], { cwd: sandbox, stdio: 'pipe' }), error => {
        assert.match(error.stderr.toString(), /is stale; regenerate deliberately/);
        return true;
      }, `${script} must reject a stale output without rewriting it`);
    }
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test('TableSpec Cardinality --check rejects stale output in an isolated project copy', async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), 'umf-r8-cardinality-tablespec-'));
  try {
    for (const file of ['scripts/core-ideals/cardinality-tablespec-projection-schema.ts',
      'spec/core/field-tablespec-projection.schema.json', 'spec/core/cardinality-tablespec-projection.schema.json']) {
      const destination = path.join(sandbox, file);
      await mkdir(path.dirname(destination), { recursive: true });
      await cp(file, destination);
    }
    const output = path.join(sandbox, 'spec/core/cardinality-tablespec-projection.schema.json');
    await writeFile(output, `${await readFile(output, 'utf8')} `);
    assert.throws(() => execFileSync('bun', ['scripts/core-ideals/cardinality-tablespec-projection-schema.ts', '--check'], {
      cwd: sandbox, stdio: 'pipe',
    }), error => {
      assert.match(error.stderr.toString(), /is stale; regenerate deliberately/);
      return true;
    });
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test('five model vocabulary exports record generated-data versus executable dispositions without retiring rows', () => {
  const ledger = JSON.parse(readFileSync('docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/gap-ledger.json', 'utf8'));
  const supplement = ledger.runtimeExportDispositionSupplement;
  assert.equal(supplement.format, 'umf.r8.runtime-export-disposition-supplement/1');
  const expected = new Map([
    ['SCALAR_TYPES', ['inert-generated-data-alias', 'scalarType', 'knownScalarType', ['src/core-ideals/parquet-cardinality-shape.ts', 'src/extensions/security/protection/functions.ts']]],
    ['ELEMENT_KINDS', ['inert-generated-data-alias', 'kind', 'knownElementKind', ['src/model/field-kind.ts']]],
    ['NULLABILITIES', ['inert-generated-data-alias', 'nullability', 'knownNullability', ['src/model/nullability.ts']]],
    ['CARDINALITIES', ['inert-generated-data-alias', 'cardinality', 'knownCardinality', ['src/model/cardinality.ts']]],
    ['scalarTypesForVersion', ['executable-semantic-behavior', null, null, ['src/model/bit128-field.ts', 'src/model/scalar-type.ts']]],
  ]);
  assert.equal(supplement.exports.length, expected.size);
  const outputs = JSON.parse(execFileSync('bun', ['-e', `
    import {SCALAR_TYPES,ELEMENT_KINDS,NULLABILITIES,CARDINALITIES,scalarTypesForVersion} from './src/model/types.ts';
    import {coreVocabulary,CURRENT_CORE_VERSION} from './src/generated/core-model.ts';
    console.log(JSON.stringify({SCALAR_TYPES,ELEMENT_KINDS,NULLABILITIES,CARDINALITIES,
      currentVersion: scalarTypesForVersion(CURRENT_CORE_VERSION), unknownVersion: scalarTypesForVersion('999.0.0'),
      frozen: [Object.isFrozen(SCALAR_TYPES),Object.isFrozen(ELEMENT_KINDS),Object.isFrozen(NULLABILITIES),Object.isFrozen(CARDINALITIES)],
      aliases: [SCALAR_TYPES===coreVocabulary.scalarType,ELEMENT_KINDS===coreVocabulary.kind,
        NULLABILITIES===coreVocabulary.nullability,CARDINALITIES===coreVocabulary.cardinality],
      versionIdentity: scalarTypesForVersion(CURRENT_CORE_VERSION)===SCALAR_TYPES}));
  `], { cwd: process.cwd(), stdio: 'pipe' }).toString('utf8'));
  assert.deepEqual(outputs.frozen, [true, true, true, true]);
  assert.deepEqual(outputs.aliases, [true, true, true, true]);
  assert.equal(outputs.versionIdentity, true);
  assert.deepEqual(outputs.currentVersion, outputs.SCALAR_TYPES);
  assert.deepEqual(outputs.unknownVersion, []);
  for (const [name, [classification, vocabularyKey, metamodelDefinition, callers]] of expected) {
    const item = supplement.exports.find(entry => entry.name === name);
    assert.ok(item, `missing disposition for ${name}`);
    assert.equal(item.classification, classification);
    assert.deepEqual(item.callerPaths, callers);
    assert.equal(item.declarationSource, 'src/model/types.ts');
    assert.equal(item.generatedValueSource, classification === 'inert-generated-data-alias' ? 'src/generated/core-model.ts' : null);
    if (vocabularyKey) assert.match(item.authority, new RegExp(`domains\\.vocabulary\\.${vocabularyKey} -> ${metamodelDefinition}`));
    for (const path of callers) assert.ok(readFileSync(path, 'utf8').includes(name), `${name} caller drift: ${path}`);
    for (const route of item.packageRoutes) {
      const rows = ledger.rows.filter(row => row.routeId === route.id && row.exportName === name);
      assert.equal(rows.length, 1, `${route.id}/${name}`);
      assert.equal(rows[0].source, 'src/model/types.ts');
      assert.equal(rows[0].acceptedRustOperation, null);
      assert.equal(rows[0].sourceSelectedImplementation, null);
      assert.equal(rows[0].bindingRoute, null);
    }
  }
  for (const closure of supplement.generatedProvenance.sourceClosure) {
    assert.equal(createHash('sha256').update(readFileSync(closure.path)).digest('hex'), closure.sha256, `source closure drift: ${closure.path}`);
  }
  assert.equal(supplement.generatedProvenance.modelSha256, JSON.parse(readFileSync('spec/metamodel/generated/manifest.json')).provenance.modelSha256);
  assert.equal(supplement.generatedProvenance.generatedCoreModelSha256,
    JSON.parse(readFileSync('spec/metamodel/generated/manifest.json')).outputs['src/generated/core-model.ts'].sha256);
  assert.equal(ledger.counts.executableDefaultRouteGaps, 922);
  assert.equal(ledger.counts.executableRows, 922);
});

test('Parquet metadata schema outputs pin their exact multi-output writer and direct input closure', () => {
  const ledger = JSON.parse(readFileSync('docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/gap-ledger.json', 'utf8'));
  const expected = new Map([
    ['spec/extensions/parquet/metadata.schema.json', 'parquetMetadataSchema'],
    ['spec/extensions/parquet/metadata-inspection.schema.json', 'parquetMetadataInspectionSchema'],
  ]);
  const index = readFileSync('src/index.ts', 'utf8');
  for (const [resource, exportName] of expected) {
    const before = createHash('sha256').update(readFileSync(resource)).digest('hex');
    execFileSync('bun', ['scripts/parquet-metadata-schema.ts', '--check'], { stdio: 'pipe' });
    assert.equal(createHash('sha256').update(readFileSync(resource)).digest('hex'), before,
      'multi-output check mode must be read-only');
    assert.match(index, new RegExp(`export \\{default as ${exportName}\\} from [\"']\\.\\.\/spec\\/extensions\\/parquet\\/${resource.split('/').at(-1).replaceAll('.', '\\.')}[\"']`));
    const row = ledger.rows.find(item => item.source === resource);
    assert.ok(row, `${resource} missing from ledger`);
    const authority = row.resourceOwnership.authority;
    assert.equal(authority.status, 'generated-authority-known', resource);
    assert.equal(authority.kind, 'generated-from-contract-governed-multi-output-schema-writer', resource);
    assert.deepEqual(authority.generator.entrypoints, ['scripts/parquet-metadata-schema.ts']);
    assert.deepEqual(authority.generatorInputs, ['spec/extensions/parquet/idl.json', 'spec/extensions/parquet/footer-decode.schema.json']);
    assert.deepEqual(authority.governingArtifacts, [
      'docs/helix/02-design/contracts/CONTRACT-019-parquet.md',
      'docs/helix/01-frame/user-stories/US-019-parquet.md',
    ]);
    assert.deepEqual(authority.governingClauses, ['US-019-AC6']);
    for (const file of [...authority.governingArtifacts, 'scripts/parquet-metadata-schema.ts',
      'spec/extensions/parquet/idl.json', 'spec/extensions/parquet/footer-decode.schema.json',
      'src/adapters/parquet/metadata.ts', 'tests/parquet/metadata.test.ts', 'src/index.ts',
      'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py']) {
      assert.ok(authority.sourceClosure.some(item => item.path === file && /^[a-f0-9]{64}$/.test(item.sha256)), `${resource} closure omits ${file}`);
    }
    assert.ok(row.resourceOwnership.routes.some(route => route.id === 'sdk-archive'
      && route.artifactPath === `package/dist/${resource}`));
  }
  assert.equal(ledger.counts.resourceAuthorityByStatus['generated-authority-known'], 56);
  assert.equal(ledger.counts.executableDefaultRouteGaps, 922);
});

test('Parquet metadata multi-output --check rejects each stale output without rewriting either', async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), 'umf-r8-parquet-metadata-'));
  const outputs = ['spec/extensions/parquet/metadata.schema.json', 'spec/extensions/parquet/metadata-inspection.schema.json'];
  try {
    for (const file of ['scripts/parquet-metadata-schema.ts', 'spec/extensions/parquet/idl.json',
      'spec/extensions/parquet/footer-decode.schema.json', ...outputs]) {
      const destination = path.join(sandbox, file);
      await mkdir(path.dirname(destination), { recursive: true });
      await cp(file, destination);
    }
    for (const output of outputs) {
      const target = path.join(sandbox, output);
      const original = await readFile(target, 'utf8');
      const stale = `${original} `;
      await writeFile(target, stale);
      assert.throws(() => execFileSync('bun', ['scripts/parquet-metadata-schema.ts', '--check'], {
        cwd: sandbox, stdio: 'pipe',
      }), error => {
        assert.match(error.stderr.toString(), /is stale; regenerate deliberately/);
        return true;
      });
      assert.equal(await readFile(target, 'utf8'), stale, 'check mode rewrote the stale artifact');
      await writeFile(target, original);
    }
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test('ledger is deterministic and records every default executable gap', () => {
  const first = buildLedger(args);
  const second = buildLedger(args);
  assert.deepEqual(first, second);
  assert.equal(first.rows.length, 3);
  assert.equal(first.counts.executableRows, 2);
  assert.equal(first.counts.inertJsonRows, 1);
  assert.equal(first.counts.executableWithAcceptedOptInRustOperation, 1);
  assert.equal(first.counts.executableWithoutAcceptedRustMapping, 1);
  assert.equal(first.counts.executableDefaultRouteGaps, 2);
  assert.equal(first.rows[0].acceptedRustOperation, 'umf_core::core_semantic_types::inspect_core_semantic_types');
  assert.equal(first.rows[0].bindingRoute, null);
  assert.equal(first.rows[0].bindingRouteStatus, 'unproven');
  assert.match(first.rows[1].disposition, /^default route remains TypeScript;/);
  assert.equal(first.rows[2].rowKind, 'generated-inert-json');
  assert.equal(first.rows[2].resourceOwnership.source.packageRootAliasCount, 1);
  assert.equal(first.rows[2].resourceOwnership.authority.status, 'generated-authority-known');
  assert.equal(first.rows[2].resourceOwnership.defaultRouteStatus, 'TypeScript package-root data export remains default; zero resource rows retired');
  assert.ok(first.rows[2].resourceOwnership.routes.every(route => Object.hasOwn(route, 'installedQualification')));
  assert.ok(first.rows[2].resourceOwnership.routes.every(route => route.sourceClosure.every(item => /^[a-f0-9]{64}$/.test(item.sha256))));
  assert.equal(first.counts.resourceExportAliases, 1);
  assert.equal(first.counts.uniqueResourceFiles, 1);
  assert.deepEqual(first.externalCensus.pythonPackages[0].rootExports.map(row => row.name), ['Document', 'validate_document']);
  assert.deepEqual(first.externalCensus.pythonPackages[0].modules[0].publicCallableNames, ['validate_document']);
  assert.equal(first.externalCensus.pythonPackages[1].rootExportStatus, 'explicit-import-candidates-without-__all__');
  assert.deepEqual(first.externalCensus.pythonPackages[1].rootExports.map(row => row.name), ['capture', 'Captured', 'Join']);
  assert.deepEqual(first.externalCensus.pythonPackages[0].assets.map(row => row.kind), ['inert-package-asset', 'native-extension-binary']);
  assert.deepEqual(first.externalCensus.packageScripts[0].entrypointFiles, ['scripts/build.ts']);
  assert.deepEqual(first.externalCensus.cliModes.map(row => row.name), ['codegen', 'core', 'metamodel', 'reference']);
  assert.equal(first.externalCensus.cliModes.find(row => row.name === 'codegen').featureGate, 'Cargo feature: codegen');
});

test('Smithy resource authority pins authored contract schemas and package data closure', () => {
  const ledger = JSON.parse(readFileSync('docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/gap-ledger.json', 'utf8'));
  const expected = new Set([
    'spec/extensions/smithy/schema.json',
    'spec/extensions/smithy/native-structure.schema.json',
    'spec/extensions/smithy/native-assembly.schema.json',
    'spec/extensions/smithy/assembly-result.schema.json',
    'spec/extensions/smithy/native-selection.schema.json',
    'spec/extensions/smithy/selection-result.schema.json',
    'spec/projections/smithy-json-schema.schema.json',
  ]);
  const rows = ledger.rows.filter(row => expected.has(row.source));
  assert.equal(new Set(rows.map(row => row.source)).size, expected.size);
  for (const row of rows) {
    const authority = row.resourceOwnership.authority;
    assert.equal(authority.status, 'authored-authority-known', row.source);
    assert.equal(authority.kind, 'authored-normative-contract-schema', row.source);
    assert.equal(authority.generatorKind, 'authored-normative-contract-schema', row.source);
    assert.equal(authority.generator, null, row.source);
    assert.deepEqual(authority.governingArtifacts, ['docs/helix/02-design/contracts/CONTRACT-014-smithy.md']);
    assert.match(row.resourceOwnership.source.sha256, /^[a-f0-9]{64}$/);
    assert.ok(authority.sourceClosure.some(item => item.path === 'docs/helix/02-design/contracts/CONTRACT-014-smithy.md'));
    assert.ok(authority.sourceClosure.some(item => item.path === 'scripts/package-sdk-rust-default.ts'));
    assert.ok(row.resourceOwnership.routes.some(route => route.id === 'sdk-archive'
      && route.artifactPath === `package/dist/spec/${row.source.slice('spec/'.length)}`));
  }
  const build = readFileSync('scripts/package-sdk-rust-default.ts', 'utf8');
  const archive = readFileSync('scripts/package-sdk.py', 'utf8');
  assert.match(build, /cp\(join\(root,'spec'\),join\(dist,'spec'\),\{recursive:true\}\)/);
  assert.match(archive, /\(root\s*\/\s*'dist'\)\.rglob\('\*'\)/);
  assert.ok(ledger.counts.resourceAuthorityByStatus['authored-authority-known'] >= expected.size);
});

test('versioned core operation schemas pin direct authoring history without promoting older versions', () => {
  const output = execFileSync('node', ['scripts/rust-migration/r8/gap-ledger.mjs', '--stdout'], {
    cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024, encoding: 'utf8',
  });
  const current = JSON.parse(output);
  const expected = new Map([
    ['spec/core/bit128-selection.schema.json', {
      id: 'urn:umf:core:bit128-selection:1.0.0',
      contracts: ['docs/helix/02-design/contracts/CONTRACT-076-128-bit-uuid.md'],
      closure: ['src/index.ts'],
      revisionHashes: ['db9ae63d0d647f544caed064fe80b68d208246c3a77fafc9be9f00ed59652c5f', '2ae3a359b46bc7bf82dcdc8098ae46f60bfb64bba5bd4acb1b0e6ded4eee5442'],
    }],
    ['spec/core/cardinality-operation-v6.schema.json', {
      id: 'urn:umf:core:cardinality-operation:6.0.0',
      contracts: ['docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md', 'docs/helix/02-design/contracts/CONTRACT-076-128-bit-uuid.md'],
      closure: ['src/model/cardinality.ts', 'src/index.ts'],
      revisionHashes: ['ad379c477298cffc32e72c8722a3d06f3dc81694ac9d1cb0d5b1d23e942f2bf5', 'c606cf71b5fe0b2afb15f0ffd3fcce20c449857b954852e63d944040dacf6595'],
    }],
    ['spec/core/facet-operation-v5.schema.json', {
      id: 'urn:umf:core:facet-operation:5.0.0',
      contracts: ['docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md', 'docs/helix/02-design/contracts/CONTRACT-076-128-bit-uuid.md'],
      closure: ['src/model/facets.ts', 'src/index.ts'],
      revisionHashes: ['f70a0cf3ee39ee725d5a33def64ed6c8557e7fbef4d3d0ca89afd53a8b6820e3', 'de87a6c79500be2b99337f5a885698b24b9e4d47a997c6d3cd649c90ea853bca'],
    }],
    ['spec/core/key-operation-v4.schema.json', {
      id: 'urn:umf:core:key-operation:4.0.0',
      contracts: ['docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md', 'docs/helix/02-design/contracts/CONTRACT-076-128-bit-uuid.md'],
      closure: ['src/model/keys.ts', 'src/index.ts'],
      revisionHashes: ['dd087b5e26a92dd6ee5366ded216a006ed4ef5e7b31e851890fd81d978606ba1', 'f9306a891b4f0f9f180160144109e05b42e05e8868dcc84fc301f5819c63519f'],
    }],
    ['spec/core/key-tuple-operation-v4.schema.json', {
      id: 'urn:umf:core:key-tuple-operation:4.0.0',
      contracts: ['docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md', 'docs/helix/02-design/contracts/CONTRACT-076-128-bit-uuid.md'],
      closure: ['src/model/key-tuple.ts', 'src/model/evolution.ts', 'src/model/dataset-values.ts', 'src/model/dataset-values-compact.ts', 'src/index.ts'],
      revisionHashes: ['90691e12c3edd982009124ea3d7a170d0f109bca76d388d5388bd2578ffaee0c', 'fe7d93da41ac331696686bd32fb0be8ca62b7a5638b95b975034195d66dff2cc'],
    }],
    ['spec/core/relationship-metadata-selection-v2.schema.json', {
      id: 'urn:umf:core:relationship-metadata-selection:2.0.0',
      contracts: ['docs/helix/02-design/contracts/CONTRACT-041-relationship.md', 'docs/helix/02-design/contracts/CONTRACT-076-128-bit-uuid.md'],
      closure: ['src/model/relationship-selection.ts', 'src/index.ts', 'tests/core/relationship-selection.test.ts'],
      added: '25a38767a3ce7a2c7af297cf541196e9cbc6ad4a',
      revisionHashes: ['991f845a1b8a7517c1ad6a43826b31cb83ae03d597b8cbc8b7dcea8e933c29b8', 'e1586b2164f8f1c06dabdf7505861ab7c39c5cef0a267a3033a8d95aa479f720'],
    }],
    ['spec/core/relationship-operation-v3.schema.json', {
      id: 'urn:umf:core:relationship-operation:3.0.0',
      contracts: ['docs/helix/02-design/contracts/CONTRACT-041-relationship.md', 'docs/helix/02-design/contracts/CONTRACT-076-128-bit-uuid.md'],
      closure: ['src/model/relationships.ts', 'src/index.ts', 'tests/core/relationship-operations.test.ts'],
      added: '25a38767a3ce7a2c7af297cf541196e9cbc6ad4a',
      revisionHashes: ['58c3d8a0ba0a0261ef3954f2952df62830c28b2570f523e11eab612206e67603', '42a3a7ad1e3ef7ac80ef5044948aad12847de22aaf63367e6264bfcb2434bda7'],
    }],
    ['spec/core/relationship-extras.schema.json', {
      id: 'urn:umf:core:relationship-extras:1.0.0',
      contracts: ['docs/helix/02-design/contracts/CONTRACT-041-relationship.md', 'docs/helix/02-design/technical-designs/TD-045-relationship.md', 'docs/helix/01-frame/user-stories/US-045-relationship.md'],
      closure: ['src/core-ideals/relationship-extras.ts', 'src/index.ts', 'tests/core-ideals/relationship-extras.test.ts'],
      added: '997c1a16a9b52e62252b5ce4e4bc3d4f3b7b7cb9',
      revisionHashes: ['8976c2c707c5616922bebf085f65d6d029ca7ed685c90cad5613dbd87ecb226c', 'fad9ec7ad8b33cc631647a30e1061a926307c702e9a5c18ba7cdf8dff94510e6'],
    }],
    ['spec/core/relationship-parquet-projection.schema.json', {
      id: 'urn:umf:core:relationship-parquet-projection:1.0.0',
      contracts: ['docs/helix/02-design/contracts/CONTRACT-041-relationship.md', 'docs/helix/02-design/contracts/CONTRACT-019-parquet.md'],
      closure: ['src/core-ideals/relationship-parquet-projection.ts', 'src/index.ts', 'tests/core-ideals/relationship-parquet.test.ts'],
      added: 'f69d1a7c7b7d62d4f2924217b813f8b58b07ecef',
      revisionHashes: ['ef753a57872076791c435ec2612efb3ce7259ed719baa2a2b28d7a6494c223ec', '01c2c812a06130abddb4ec78d8760537f18cff2eb6bfd96f09b87b748dd9192b'],
    }],
    ['spec/core/kind-operation-v8.schema.json', {
      id: 'urn:umf:core:kind-operation:8.0.0',
      contracts: ['docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md', 'docs/helix/02-design/contracts/CONTRACT-076-128-bit-uuid.md'],
      closure: ['src/model/field-kind.ts', 'src/index.ts'],
      currentHash: '3f7cc27f133f0a242b42ae2f41b665d046d0e069668235c82b0b2cd38c8bd68c',
      revisionHashes: ['b0ea478865567f2ee6c3b060df5eda10723cb4bdeaa4ff26eb7e0bba6d7b063e', '3f7cc27f133f0a242b42ae2f41b665d046d0e069668235c82b0b2cd38c8bd68c'],
    }],
    ['spec/core/nullability-operation-v7.schema.json', {
      id: 'urn:umf:core:nullability-operation:7.0.0',
      contracts: ['docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md', 'docs/helix/02-design/contracts/CONTRACT-076-128-bit-uuid.md'],
      closure: ['src/model/nullability.ts', 'src/index.ts'],
      currentHash: '6f0d20390165d2da79f22a69b3fec0126512c9f870a49445a5c33e55d68ff2d9',
      revisionHashes: ['18bc5717486dd78997ba8b52ff9a24a5fa50166decdf6fe3226443f499030b17', '6f0d20390165d2da79f22a69b3fec0126512c9f870a49445a5c33e55d68ff2d9'],
    }],
  ]);
  const refresh = '8706814a9';
  for (const [source, expectation] of expected) {
    const row = current.rows.find(item => item.source === source && item.routeId === 'package-root-node');
    assert.ok(row, `missing resource row ${source}`);
    const authority = row.resourceOwnership.authority;
    assert.equal(authority.status, 'authored-authority-known', source);
    assert.equal(authority.kind, 'authored-versioned-contract-schema', source);
    assert.equal(authority.generator, null, source);
    assert.equal(authority.generatorKind, 'authored-versioned-contract-schema', source);
    assert.deepEqual(authority.governingArtifacts, expectation.contracts, source);
    assert.deepEqual(authority.authoredRevisionClosure.map(item => [item.commit, item.action, item.sha256]), [
      [expectation.added ?? '25a38767a3ce7a2c7af297cf541196e9cbc6ad4a', 'added', expectation.revisionHashes[0]], [refresh, 'updated', expectation.revisionHashes[1]],
    ], source);
    for (const revision of authority.authoredRevisionClosure) {
      assert.match(revision.sha256, /^[a-f0-9]{64}$/, `${source} ${revision.commit}`);
    }
    const schema = JSON.parse(readFileSync(source, 'utf8'));
    assert.equal(schema.$id, expectation.id, source);
    if (expectation.currentHash) assert.equal(row.resourceOwnership.source.sha256, expectation.currentHash, `${source} current bytes`);
    for (const file of [...expectation.contracts, ...expectation.closure,
      'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py']) {
      assert.ok(authority.sourceClosure.some(item => item.path === file && /^[a-f0-9]{64}$/.test(item.sha256)), `${source} closure omits ${file}`);
    }
    if (expectation.currentHash) assert.ok(authority.sourceClosure.some(item => item.path === 'docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/versioned-core-operation-resource-authority.md'), `${source} closure omits focused authority evidence`);
    const archive = row.resourceOwnership.routes.find(route => route.id === 'sdk-archive');
    assert.equal(archive.artifactPath, `package/dist/${source}`);
    assert.equal(archive.installedQualification.status, 'not-installed-qualified');
  }
  const generated = new Map([
    ['spec/core/key-operation-v2.schema.json', '67c35f417d940d9d3ff8c4fe7ca57ea29d319a1da4310ea3f9d2437160e9095b'],
    ['spec/core/record-type-operation-v6.schema.json', '2b40d2be0562794f918738d96ee8f974f7133f26ee8476583b944c9f676a255d'],
  ]);
  const metamodel = JSON.parse(readFileSync('spec/metamodel/generated/manifest.json', 'utf8'));
  const keyRecordEvidence = 'docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/key-record-type-generated-authority-20261026.md';
  for (const [source, currentHash] of generated) {
    const row = current.rows.find(item => item.source === source);
    assert.ok(row, `missing retained older version ${source}`);
    const authority = row.resourceOwnership.authority;
    assert.equal(authority.status, 'generated-authority-known', source);
    assert.equal(authority.generatorKind, 'metamodel', source);
    assert.deepEqual(authority.generator.entrypoints, ['scripts/metamodel/build.ts', 'crates/umf-metamodel/src/lib.rs']);
    assert.ok(authority.sourceClosure.some(item => item.path === 'spec/metamodel/generated/manifest.json'));
    assert.ok(authority.sourceClosure.some(item => item.path === keyRecordEvidence));
    assert.equal(row.resourceOwnership.source.sha256, currentHash, `${source} current bytes`);
    assert.equal(metamodel.outputs[source].sha256, currentHash, `${source} generated manifest bytes`);
  }
  for (const source of ['spec/core/key-selection.schema.json', 'spec/core/relationship-selection.schema.json', 'spec/core/schema-properties-selection.schema.json']) {
    const row = current.rows.find(item => item.source === source);
    assert.ok(row, `missing negative control ${source}`);
    assert.equal(row.resourceOwnership.authority.status, 'authority-unresolved', `${source} remains outside the metamodel declaration`);
  }
  for (const source of ['spec/core/cardinality-operation-v4.schema.json', 'spec/core/facet-operation-v3.schema.json',
    'spec/core/kind-operation-v6.schema.json', 'spec/core/nullability-operation-v5.schema.json']) {
    const row = current.rows.find(item => item.source === source);
    assert.ok(row, `missing metamodel-generated operation schema ${source}`);
    const authority = row.resourceOwnership.authority;
    assert.equal(authority.status, 'generated-authority-known', source);
    assert.equal(authority.generatorKind, 'metamodel', source);
    assert.deepEqual(authority.generator.entrypoints, ['scripts/metamodel/build.ts', 'crates/umf-metamodel/src/lib.rs']);
    assert.ok(authority.sourceClosure.some(item => item.path === 'spec/metamodel/generated/manifest.json'));
  }
  // The count includes the explicit resource families in the R8 authority map.
  const relationshipSelection = current.rows.find(item => item.source === 'spec/core/relationship-selection.schema.json');
  assert.equal(relationshipSelection.resourceOwnership.authority.status, 'authority-unresolved', 'one-off generated selection schema lacks a current reproducible writer');
  assert.deepEqual(current.counts.resourceAuthorityByStatus, {
    'generated-authority-known': 56,
    'authored-authority-known': 49,
    'candidate-generated': 88,
    'authority-unresolved': 5,
  });
  assert.equal(current.counts.resourceAuthorityByStatus['authored-authority-known'], 49);
});

test('semantic-types selection has exact contract authorship while composite selection authorities stay open', () => {
  const output = execFileSync('node', ['scripts/rust-migration/r8/gap-ledger.mjs', '--stdout'], {
    cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024, encoding: 'utf8',
  });
  const current = JSON.parse(output);
  const authority = file => current.rows.find(row => row.routeId === 'package-root-node' && row.source === file)?.resourceOwnership.authority;
  const semantic = authority('spec/core/semantic-types-selection.schema.json');
  assert.equal(semantic.status, 'authored-authority-known');
  assert.deepEqual(semantic.governingArtifacts, ['docs/helix/02-design/contracts/CONTRACT-078-semantic-types.md']);
  assert.equal(semantic.authoredRevisionClosure[0].sha256, '529d97cfd8ff7b5e201967c7156dc8c9439d5984ac1ee755bdb60a2d505bdead');
  assert.ok(semantic.sourceClosure.some(item => item.path === 'docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/core-selection-schema-authority.md'));
  const operation = authority('spec/core/semantic-types-operation.schema.json');
  assert.equal(operation.status, 'authored-authority-known');
  assert.deepEqual(operation.governingArtifacts, ['docs/helix/02-design/contracts/CONTRACT-078-semantic-types.md']);
  assert.deepEqual(operation.authoredRevisionClosure.map(item => [item.commit, item.sha256]), [
    ['f397e484727cc7405958c9ec40468cf6134e48e3', '3480029b4a635057a714da5c7eba26f669e84b6ea5f1ed852c63fd4f90558ea7'],
    ['8706814a9605d7325eef32a5df3d05696de00b62', '021935d916e82ea471500dffadf2830469c782b28382d71aeea195df724fe727'],
  ]);
  assert.ok(operation.sourceClosure.some(item => item.path === 'docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/semantic-types-operation-schema-authority.md'));
  for (const file of ['spec/core/key-selection.schema.json', 'spec/core/relationship-selection.schema.json', 'spec/core/schema-properties-selection.schema.json']) {
    assert.equal(authority(file).status, 'authority-unresolved', file);
  }
});

test('named DDD and SQL Server schemas and pinned Parquet IDL have exact authority without promoting its relationship schema', () => {
  const output = execFileSync('node', ['scripts/rust-migration/r8/gap-ledger.mjs', '--stdout'], {
    cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024, encoding: 'utf8',
  });
  const current = JSON.parse(output);
  const authority = file => current.rows.find(row => row.routeId === 'package-root-node' && row.source === file)?.resourceOwnership.authority;
  for (const file of ['spec/projections/ddd-graphql.schema.json', 'spec/core/facets-sqlserver-projection.schema.json', 'spec/core/sqlserver-facet-classification.schema.json']) {
    const row = current.rows.find(item => item.routeId === 'package-root-node' && item.source === file);
    const entry = row.resourceOwnership.authority;
    assert.equal(entry.status, 'authored-authority-known', file);
    assert.equal(entry.kind, 'authored-versioned-design-schema', file);
    assert.equal(entry.authoredRevisionClosure.at(-1).sha256, row.resourceOwnership.source.sha256);
    assert.ok(entry.sourceClosure.some(item => item.path === 'docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/projection-parquet-sqlserver-resource-authority.md'));
  }
  const idl = authority('spec/extensions/parquet/idl.json');
  assert.equal(idl.status, 'generated-authority-known');
  assert.equal(idl.generator.language, 'Python');
  assert.equal(idl.generator.runtime, 'Python 3');
  assert.deepEqual(idl.generator.entrypoints, ['scripts/parquet-idl.py']);
  assert.deepEqual(idl.generatorInputs, ['native/parquet/sources/manifest.json', 'native/parquet/sources/parquet.thrift']);
  assert.match(idl.reproductionStatus, /fresh thriftpy2 0\.5\.3 compiler replay was unavailable/);
  assert.equal(authority('spec/core/parquet-relationship-classification.schema.json').status, 'authority-unresolved');
});

test('CSV Boolean operation schema pins its added and refreshed authored blobs', () => {
  const output = execFileSync('node', ['scripts/rust-migration/r8/gap-ledger.mjs', '--stdout'], {
    cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024, encoding: 'utf8',
  });
  const ledger = JSON.parse(output);
  const row = ledger.rows.find(item => item.source === 'spec/core/csv-boolean-lexical-operation.schema.json'
    && item.routeId === 'package-root-node');
  assert.ok(row);
  const authority = row.resourceOwnership.authority;
  assert.equal(authority.status, 'authored-authority-known');
  assert.equal(authority.kind, 'authored-versioned-contract-schema');
  assert.deepEqual(authority.authoredRevisionClosure.map(item => [item.commit, item.action, item.sha256]), [
    ['8e76c74d14203225d1ef159c9132bb9e9b0cdffe', 'added', '1c07d500c8dd6732ce814bdfb04a532a8df313c0df188f369faf7fcf0b2b85b0'],
    ['8706814a9605d7325eef32a5df3d05696de00b62', 'updated', '6548b442849a2a1246ea860ca5be22eecd98596c571d9c0b74ce1eba7780b791'],
  ]);
  assert.deepEqual(authority.governingArtifacts, ['docs/helix/02-design/contracts/CONTRACT-053-domain-pack-profiles.md']);
  for (const file of ['src/model/csv-boolean-lexical.ts', 'tests/csv-boolean-lexical.test.ts',
    'scripts/browser-csv-boolean-lexical.ts', 'src/index.ts', 'scripts/build.ts',
    'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py']) {
    assert.ok(authority.sourceClosure.some(item => item.path === file && /^[a-f0-9]{64}$/.test(item.sha256)), `closure omits ${file}`);
  }
  const schema = JSON.parse(readFileSync('spec/core/csv-boolean-lexical-operation.schema.json', 'utf8'));
  assert.equal(schema.properties.source.$ref, 'urn:umf:core:0.10.0');
  assert.equal(row.resourceOwnership.routes.find(route => route.id === 'sdk-archive').installedQualification.status,
    'not-installed-qualified');
  // The neighboring relationship-selection schema was produced by a deleted
  // one-off script, so matching commit history alone must not promote it.
  const historicalControl = ledger.rows.find(item => item.source === 'spec/core/relationship-selection.schema.json');
  assert.equal(historicalControl.resourceOwnership.authority.status, 'authority-unresolved');
});

test('SQL Server nullability native evidence schema pins an exact writer and rejects writer drift', async () => {
  const output = execFileSync('node', ['scripts/rust-migration/r8/gap-ledger.mjs', '--stdout'], {
    cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024, encoding: 'utf8',
  });
  const ledger = JSON.parse(output);
  const resource = 'spec/extensions/sqlserver-nullability/native.schema.json';
  const row = ledger.rows.find(item => item.source === resource && item.routeId === 'package-root-node');
  assert.ok(row);
  const authority = row.resourceOwnership.authority;
  assert.equal(authority.status, 'generated-authority-known');
  assert.equal(authority.kind, 'generated-from-exact-self-contained-native-evidence-schema-writer');
  assert.deepEqual(authority.generator.entrypoints, ['scripts/core-ideals/nullability-sqlserver-evidence-schema.ts']);
  assert.deepEqual(authority.generatorInputs, []);
  assert.deepEqual(authority.governingArtifacts, [
    'docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md',
    'docs/helix/02-design/technical-designs/TD-041-core-nullability.md',
    'docs/helix/01-frame/user-stories/US-041-core-nullability.md',
  ]);
  for (const file of [...authority.governingArtifacts, 'scripts/core-ideals/nullability-sqlserver-evidence-schema.ts',
    'src/core-ideals/nullability-sqlserver.ts', 'tests/core-ideals/nullability-sqlserver.test.ts',
    'src/index.ts', 'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py']) {
    assert.ok(authority.sourceClosure.some(item => item.path === file && /^[a-f0-9]{64}$/.test(item.sha256)), `closure omits ${file}`);
  }
  const route = row.resourceOwnership.routes.find(item => item.id === 'sdk-archive');
  assert.equal(route.artifactPath, `package/dist/${resource}`);
  assert.equal(route.installedQualification.status, 'not-installed-qualified');

  const sandbox = await mkdtemp(path.join(os.tmpdir(), 'umf-r8-native-evidence-schema-'));
  const writer = 'scripts/core-ideals/nullability-sqlserver-evidence-schema.ts';
  const sandboxWriter = path.join(sandbox, writer);
  const sandboxOutput = path.join(sandbox, resource);
  try {
    await mkdir(path.dirname(sandboxWriter), { recursive: true });
    await mkdir(path.dirname(sandboxOutput), { recursive: true });
    const original = await readFile(writer, 'utf8');
    await writeFile(sandboxWriter, original);
    execFileSync('bun', [writer], { cwd: sandbox, stdio: 'pipe' });
    const expectedBytes = readFileSync(resource);
    assert.deepEqual(await readFile(sandboxOutput), expectedBytes, 'isolated writer output must reproduce the checked-in resource');

    const mutated = original.replace('Native SQL Server availability evidence supplement',
      'Mutated SQL Server availability evidence supplement');
    assert.notEqual(mutated, original, 'negative control must alter a writer-owned schema value');
    await writeFile(sandboxWriter, mutated);
    execFileSync('bun', [writer], { cwd: sandbox, stdio: 'pipe' });
    assert.notDeepEqual(await readFile(sandboxOutput), expectedBytes,
      'a changed writer-owned title must no longer reproduce the checked-in resource');
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test('Delta log, Parquet framing and Spark datatype schemas pin current writers and reject writer drift', async () => {
  const output = execFileSync('node', ['scripts/rust-migration/r8/gap-ledger.mjs', '--stdout'], {
    cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024, encoding: 'utf8',
  });
  const ledger = JSON.parse(output);
  const cases = [
    {
      resource: 'spec/extensions/delta-log/inspection.schema.json',
      generator: 'scripts/delta-log-schema.ts',
      contract: 'docs/helix/02-design/contracts/CONTRACT-018-delta.md',
      story: 'docs/helix/01-frame/user-stories/US-018-delta-schema.md', clauses: ['US-018-AC9', 'US-018-AC10'],
      inputs: ['spec/core/native-json.schema.json'],
      outputs: ['spec/extensions/delta-log/schema.json', 'spec/extensions/delta-log/package.json', 'spec/extensions/delta-log/inspection.schema.json'],
      closure: ['src/model/types.ts', 'src/generated/core-model.ts', 'spec/core/native-json.schema.json',
        'src/index.ts', 'tests/delta/log.test.ts', 'tests/delta/actions.test.ts', 'scripts/build.ts',
        'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'],
    },
    {
      resource: 'spec/extensions/parquet/framing.schema.json',
      generator: 'scripts/parquet-schema.ts',
      contract: 'docs/helix/02-design/contracts/CONTRACT-019-parquet.md',
      story: 'docs/helix/01-frame/user-stories/US-019-parquet.md', clauses: ['US-019-AC1', 'US-019-AC2'],
      inputs: [],
      outputs: ['spec/extensions/parquet/schema.json', 'spec/extensions/parquet/package.json', 'spec/extensions/parquet/framing.schema.json'],
      closure: ['src/model/types.ts', 'src/generated/core-model.ts', 'src/index.ts',
        'tests/parquet/capture.test.ts', 'tests/parquet/footer.test.ts', 'scripts/build.ts',
        'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'],
    },
    {
      resource: 'spec/extensions/spark/datatype-schema.json',
      generator: 'scripts/spark-schema.ts',
      contract: 'docs/helix/02-design/contracts/CONTRACT-017-spark.md',
      story: 'docs/helix/01-frame/user-stories/US-017-spark-schema.md', clauses: ['US-017-AC1', 'US-017-AC2'],
      inputs: ['spec/core/native-json.schema.json'],
      outputs: ['spec/extensions/spark/datatype-schema.json', 'spec/extensions/spark/schema.json', 'spec/extensions/spark/package.json'],
      closure: ['src/model/types.ts', 'src/generated/core-model.ts', 'spec/core/native-json.schema.json',
        'src/adapters/spark/index.ts', 'src/index.ts', 'tests/spark/schema.test.ts', 'scripts/build.ts',
        'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'],
    },
  ];
  for (const item of cases) {
    const row = ledger.rows.find(candidate => candidate.source === item.resource && candidate.routeId === 'package-root-node');
    assert.ok(row, `${item.resource} must have a package-root route`);
    const authority = row.resourceOwnership.authority;
    assert.equal(authority.status, 'generated-authority-known', item.resource);
    assert.equal(authority.kind, `generated-from-exact-contract-governed-${item.generator.split('/').at(-1).replace('-schema.ts', '')}-schema-writer`);
    assert.deepEqual(authority.generator.entrypoints, [item.generator]);
    assert.deepEqual(authority.generatorInputs, item.inputs);
    assert.deepEqual(authority.governingArtifacts, [item.contract, item.story]);
    assert.deepEqual(authority.governingClauses, item.clauses);
    for (const file of [item.contract, item.story, item.generator, ...item.inputs, ...item.closure]) {
      assert.ok(authority.sourceClosure.some(entry => entry.path === file && /^[a-f0-9]{64}$/.test(entry.sha256)),
        `${item.resource} closure omits ${file}`);
    }
    assert.ok(row.resourceOwnership.routes.some(route => route.id === 'sdk-archive'
      && route.artifactPath === `package/dist/${item.resource}`), `${item.resource} is not in the SDK archive route`);
    assert.equal(row.resourceOwnership.routes.find(route => route.id === 'sdk-archive').installedQualification.status,
      'not-installed-qualified');

    const sandbox = await mkdtemp(path.join(os.tmpdir(), 'umf-r8-extension-schema-'));
    const copyIntoSandbox = async file => {
      const destination = path.join(sandbox, file);
      await mkdir(path.dirname(destination), { recursive: true });
      await cp(file, destination);
    };
    try {
      for (const file of [item.generator, 'src/model/types.ts', 'src/model/errors.ts',
        'src/generated/core-model.ts', 'spec/core/schema.json', 'spec/core/semantic-type-reference.schema.json',
        'spec/core/extension-package.schema.json', 'spec/metamodel/generated/core-constraints.json',
        'spec/metamodel/generated/domain-policy.json', ...item.inputs]) {
        await copyIntoSandbox(file);
      }
      execFileSync('bun', [item.generator], { cwd: sandbox, stdio: 'pipe' });
      for (const file of item.outputs) {
        assert.deepEqual(await readFile(path.join(sandbox, file)), readFileSync(file),
          `${item.generator} must reproduce ${file} byte for byte in isolation`);
      }
      if (item.resource === 'spec/extensions/parquet/framing.schema.json') {
        const writerPath = path.join(sandbox, item.generator);
        const original = await readFile(writerPath, 'utf8');
        const mutated = original.replace('urn:umf:parquet:framing:0.1.0', 'urn:umf:parquet:framing:0.1.1');
        assert.notEqual(mutated, original, 'negative control must mutate a writer-owned schema identifier');
        await writeFile(writerPath, mutated);
        execFileSync('bun', [item.generator], { cwd: sandbox, stdio: 'pipe' });
        assert.notDeepEqual(await readFile(path.join(sandbox, item.resource)), readFileSync(item.resource),
          'mutating a writer-owned identifier must diverge from the checked-in resource');
      }
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  }
  const relationshipSelection = ledger.rows.find(item => item.source === 'spec/core/relationship-selection.schema.json');
  assert.equal(relationshipSelection.resourceOwnership.authority.status, 'authority-unresolved',
    'historical relationship-selection output without a live writer remains unresolved');
  const key = ledger.rows.find(item => item.source === 'spec/core/key-operation-v2.schema.json');
  const record = ledger.rows.find(item => item.source === 'spec/core/record-type-operation-v6.schema.json');
  assert.equal(key.resourceOwnership.authority.status, 'generated-authority-known');
  assert.equal(record.resourceOwnership.authority.status, 'generated-authority-known');
  assert.equal(ledger.counts.resourceAuthorityByStatus['generated-authority-known'], 56);
  assert.equal(ledger.counts.resourceAuthorityByStatus['authority-unresolved'], 5);
});

test('dataset-value operation schemas pin direct authorship, consumer closure and archive limits', () => {
  const output = execFileSync('node', ['scripts/rust-migration/r8/gap-ledger.mjs', '--stdout'], {
    cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024, encoding: 'utf8',
  });
  const ledger = JSON.parse(output);
  const expected = new Map([
    ['spec/core/dataset-value-operation.schema.json', {
      id: 'urn:umf:core:dataset-value-operation:1.0.0',
      contract: 'docs/helix/02-design/contracts/CONTRACT-049-schema-properties.md',
      history: [
        ['c7c95e1c4ea5b72541f47fa0350ca467ff02f395', 'added', '913b25afb079d6952e31006ee4a772e77b67461d9029f8cccda24dd4ce017b7a'],
        ['8706814a9', 'updated', '217cc3c05e10cec1bb4e93cca1205c039f596e95080cba075823a9b8b351013d'],
      ],
      closure: ['src/model/dataset-values.ts', 'src/model/evolution.ts', 'src/model/internal/schema-work.ts', 'src/index.ts'],
      export: 'coreDatasetValueOperationSchema',
    }],
    ['spec/core/dataset-value-compact-operation.schema.json', {
      id: 'urn:umf:core:dataset-value-compact-operation:1.0.0',
      contract: 'docs/helix/02-design/contracts/CONTRACT-056-core-dataset-compact.md',
      history: [
        ['a95c3ec18a8f904decde884a4fa252988d2a5b0f', 'added', 'b113553c04e1c25eeb5f19da0879d8273c1e34ed515126d751bc812424843caf'],
        ['8706814a9', 'updated', '89f502aa0cea1a75fba2ff586c795c875a980b96af3e01d3117538e9fe12e74e'],
      ],
      closure: ['src/model/dataset-values-compact.ts', 'src/model/internal/schema-work.ts', 'src/index.ts'],
      export: 'coreDatasetValueCompactOperationSchema',
    }],
  ]);
  const index = readFileSync('src/index.ts', 'utf8');
  const work = readFileSync('src/model/internal/schema-work.ts', 'utf8');
  const archiveBuild = readFileSync('scripts/package-sdk-rust-default.ts', 'utf8');
  const archive = readFileSync('scripts/package-sdk.py', 'utf8');
  for (const [source, expectation] of expected) {
    const row = ledger.rows.find(item => item.source === source && item.routeId === 'package-root-node');
    assert.ok(row, `missing resource row ${source}`);
    const authority = row.resourceOwnership.authority;
    assert.equal(authority.status, 'authored-authority-known', source);
    assert.equal(authority.kind, 'authored-versioned-contract-schema', source);
    assert.equal(authority.generator, null, source);
    assert.deepEqual(authority.governingArtifacts, [expectation.contract], source);
    assert.deepEqual(authority.authoredRevisionClosure.map(item => [item.commit, item.action, item.sha256]), expectation.history, source);
    const schema = JSON.parse(readFileSync(source, 'utf8'));
    assert.equal(schema.$id, expectation.id, source);
    for (const file of [expectation.contract, ...expectation.closure,
      'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py']) {
      assert.ok(authority.sourceClosure.some(item => item.path === file && /^[a-f0-9]{64}$/.test(item.sha256)), `${source} closure omits ${file}`);
    }
    assert.ok(index.includes(expectation.export), `${expectation.export} is not exported`);
    assert.ok(work.includes(`spec/core/${source.split('/').at(-1)}`), `${source} is not consumed by schema-work`);
    const route = row.resourceOwnership.routes.find(item => item.id === 'sdk-archive');
    assert.equal(route.artifactPath, `package/dist/${source}`);
    assert.equal(route.installedQualification.status, 'not-installed-qualified');
  }
  assert.match(archiveBuild, /cp\(join\(root,'spec'\),join\(dist,'spec'\),\{recursive:true\}\)/);
  assert.match(archive, /\(root\s*\/\s*'dist'\)\.rglob\('\*'\)/);
  assert.equal(ledger.counts.resourceAuthorityByStatus['authored-authority-known'], 49);
});

test('OpenAPI result schemas pin their governing contracts and package data closure', () => {
  const ledger = JSON.parse(readFileSync('docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/gap-ledger.json', 'utf8'));
  const expected = new Map([
    ['spec/extensions/openapi/reference-result.schema.json', 'docs/helix/02-design/contracts/CONTRACT-011-openapi.md'],
    ['spec/extensions/openapi/schema-extraction.schema.json', 'docs/helix/02-design/contracts/CONTRACT-011-openapi.md'],
    ['spec/extensions/openapi/schema-index.schema.json', 'docs/helix/02-design/contracts/CONTRACT-011-openapi.md'],
    ['spec/extensions/openapi/schema-reference.schema.json', 'docs/helix/02-design/contracts/CONTRACT-011-openapi.md'],
    ['spec/extensions/openapi/dynamic-reference.schema.json', 'docs/helix/02-design/contracts/CONTRACT-011-openapi.md'],
    ['spec/projections/openapi-json-schema.schema.json', 'docs/helix/02-design/contracts/CONTRACT-012-openapi-json-schema.md'],
  ]);
  const rows = ledger.rows.filter(row => expected.has(row.source));
  assert.equal(new Set(rows.map(row => row.source)).size, expected.size);
  const index = readFileSync('src/index.ts', 'utf8');
  for (const row of rows) {
    const authority = row.resourceOwnership.authority;
    const contract = expected.get(row.source);
    assert.equal(authority.status, 'authored-authority-known', row.source);
    assert.equal(authority.kind, 'authored-normative-contract-schema', row.source);
    assert.deepEqual(authority.governingArtifacts, [contract]);
    assert.equal(authority.generator, null, row.source);
    assert.match(row.resourceOwnership.source.sha256, /^[a-f0-9]{64}$/);
    assert.ok(authority.sourceClosure.some(item => item.path === contract));
    assert.ok(authority.sourceClosure.some(item => item.path === 'scripts/package-sdk-rust-default.ts'));
    assert.ok(row.resourceOwnership.routes.some(route => route.id === 'sdk-archive'
      && route.artifactPath === `package/dist/spec/${row.source.slice('spec/'.length)}`));
    assert.ok(index.includes(`../${row.source}`), `${row.source} is not re-exported from src/index.ts`);
  }
  const build = readFileSync('scripts/package-sdk-rust-default.ts', 'utf8');
  const archive = readFileSync('scripts/package-sdk.py', 'utf8');
  assert.match(build, /cp\(join\(root,'spec'\),join\(dist,'spec'\),\{recursive:true\}\)/);
  assert.match(archive, /\(root\s*\/\s*'dist'\)\.rglob\('\*'\)/);
});

test('domain-pack resources pin the schema builder, contract inputs and package closure', () => {
  const ledger = JSON.parse(readFileSync('docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/gap-ledger.json', 'utf8'));
  const expected = new Set([
    'spec/extensions/domain-pack/schema.json',
    'spec/extensions/domain-pack/package.json',
    'spec/extensions/dataset-source/schema.json',
    'spec/extensions/dataset-source/package.json',
  ]);
  const rows = ledger.rows.filter(row => expected.has(row.source));
  assert.equal(new Set(rows.map(row => row.source)).size, expected.size);
  for (const row of rows) {
    const authority = row.resourceOwnership.authority;
    assert.equal(authority.status, 'generated-authority-known', row.source);
    assert.equal(authority.kind, 'generated-from-explicit-typescript-schema-builder', row.source);
    assert.equal(authority.generatorKind, authority.kind, row.source);
    assert.deepEqual(authority.governingArtifacts, ['docs/helix/02-design/contracts/CONTRACT-052-domain-packs.md']);
    assert.deepEqual(authority.generator.entrypoints, ['scripts/domain-pack-schema.ts']);
    assert.deepEqual(authority.generatorInputs, ['src/domain-packs/schema.ts', 'src/domain-packs/source-schema.ts']);
    assert.match(row.resourceOwnership.source.sha256, /^[a-f0-9]{64}$/);
    for (const file of ['docs/helix/02-design/contracts/CONTRACT-052-domain-packs.md', 'scripts/domain-pack-schema.ts',
      'src/domain-packs/schema.ts', 'src/domain-packs/source-schema.ts', 'src/index.ts', 'scripts/package-sdk-rust-default.ts']) {
      assert.ok(authority.sourceClosure.some(item => item.path === file && /^[a-f0-9]{64}$/.test(item.sha256)), `${row.source} closure omits ${file}`);
    }
    assert.ok(row.resourceOwnership.routes.some(route => route.id === 'sdk-archive'
      && route.artifactPath === `package/dist/spec/${row.source.slice('spec/'.length)}`));
  }
  const build = readFileSync('scripts/package-sdk-rust-default.ts', 'utf8');
  const archive = readFileSync('scripts/package-sdk.py', 'utf8');
  assert.match(build, /cp\(join\(root,'spec'\),join\(dist,'spec'\),\{recursive:true\}\)/);
  assert.match(archive, /\(root\s*\/\s*'dist'\)\.rglob\('\*'\)/);
  assert.equal(ledger.counts.resourceAuthorityByStatus['generated-authority-known'], 56);
});

test('Arrow IPC single-output schema writers have read-only check mode and pinned package closure', () => {
  const ledger = JSON.parse(readFileSync('docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/gap-ledger.json', 'utf8'));
  const expected = new Map([
    ['spec/extensions/arrow-ipc/layout-result.schema.json', 'scripts/arrow-ipc-layout-schema.ts'],
    ['spec/extensions/arrow-ipc/consistency-result.schema.json', 'scripts/arrow-ipc-consistency-schema.ts'],
    ['spec/extensions/arrow-ipc/rename-result.schema.json', 'scripts/arrow-ipc-rename-schema.ts'],
  ]);
  const rows = ledger.rows.filter(row => expected.has(row.source));
  assert.equal(new Set(rows.map(row => row.source)).size, expected.size);
  const index = readFileSync('src/index.ts', 'utf8');
  for (const [resource, generator] of expected) {
    const row = rows.find(item => item.source === resource);
    const authority = row.resourceOwnership.authority;
    assert.equal(authority.status, 'generated-authority-known', resource);
    assert.equal(authority.kind, 'generated-from-contract-governed-single-output-schema-writer', resource);
    assert.deepEqual(authority.governingArtifacts, ['docs/helix/02-design/contracts/CONTRACT-016-arrow.md']);
    assert.deepEqual(authority.generator.entrypoints, [generator]);
    assert.deepEqual(authority.generatorInputs, []);
    for (const file of ['docs/helix/02-design/contracts/CONTRACT-016-arrow.md', generator,
      'src/index.ts', 'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py']) {
      assert.ok(authority.sourceClosure.some(item => item.path === file && /^[a-f0-9]{64}$/.test(item.sha256)), `${resource} closure omits ${file}`);
    }
    assert.ok(index.includes(`../${resource}`), `${resource} is not re-exported from src/index.ts`);
    assert.ok(row.resourceOwnership.routes.some(route => route.id === 'sdk-archive'
      && route.artifactPath === `package/dist/spec/${resource.slice('spec/'.length)}`));

    const before = createHash('sha256').update(readFileSync(resource)).digest('hex');
    execFileSync('bun', [generator, '--check'], { stdio: 'pipe' });
    const after = createHash('sha256').update(readFileSync(resource)).digest('hex');
    assert.equal(after, before, `${generator} --check changed ${resource}`);
  }
  assert.equal(ledger.counts.resourceAuthorityByStatus['generated-authority-known'], 56);
});

test('Arrow base schemas pin PostgreSQL and vendored FlatBuffer generator inputs', () => {
  const ledger = JSON.parse(readFileSync('docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/gap-ledger.json', 'utf8'));
  const expected = new Map([
    ['spec/extensions/arrow/schema.json', 'scripts/arrow-schema.ts'],
    ['spec/extensions/arrow/integration-schema.json', 'scripts/arrow-schema.ts'],
    ['spec/extensions/arrow/flatbuffer-model.schema.json', 'scripts/arrow-flatbuffer-schema.ts'],
  ]);
  const rows = ledger.rows.filter(row => expected.has(row.source));
  assert.equal(new Set(rows.map(row => row.source)).size, expected.size);
  const index = readFileSync('src/index.ts', 'utf8');
  const manifest = JSON.parse(readFileSync('spec/extensions/arrow/flatbuffers/manifest.json', 'utf8'));
  const flatbufferFiles = Object.keys(manifest.files).map(file => `spec/extensions/arrow/flatbuffers/${file}`);
  for (const [resource, generator] of expected) {
    const row = rows.find(item => item.source === resource);
    const authority = row.resourceOwnership.authority;
    assert.equal(authority.status, 'generated-authority-known', resource);
    assert.deepEqual(authority.governingArtifacts, ['docs/helix/02-design/contracts/CONTRACT-016-arrow.md']);
    assert.deepEqual(authority.generator.entrypoints, [generator]);
    assert.match(row.resourceOwnership.source.sha256, /^[a-f0-9]{64}$/);
    assert.ok(index.includes(`../${resource}`), `${resource} is not re-exported from src/index.ts`);
    assert.ok(row.resourceOwnership.routes.some(route => route.id === 'sdk-archive'
      && route.artifactPath === `package/dist/spec/${resource.slice('spec/'.length)}`));
    const closure = new Map(authority.sourceClosure.map(item => [item.path, item.sha256]));
    for (const file of ['docs/helix/02-design/contracts/CONTRACT-016-arrow.md', generator,
      'src/model/types.ts', 'src/index.ts', 'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py']) {
      assert.match(closure.get(file) ?? '', /^[a-f0-9]{64}$/, `${resource} closure omits ${file}`);
    }
    const inputs = resource === 'spec/extensions/arrow/flatbuffer-model.schema.json'
      ? ['spec/extensions/arrow/flatbuffers/manifest.json', ...flatbufferFiles]
      : ['spec/extensions/postgresql/schema.json'];
    assert.deepEqual(authority.generatorInputs, resource === 'spec/extensions/arrow/flatbuffer-model.schema.json'
      ? ['src/model/types.ts', ...inputs]
      : ['src/model/types.ts', 'spec/extensions/postgresql/schema.json']);
    for (const input of inputs) assert.match(closure.get(input) ?? '', /^[a-f0-9]{64}$/, `${resource} closure omits ${input}`);
  }
  for (const [name, expectedHash] of Object.entries(manifest.files)) {
    assert.equal(createHash('sha256').update(readFileSync(`spec/extensions/arrow/flatbuffers/${name}`)).digest('hex'), expectedHash, `${name} differs from vendored manifest`);
  }

  for (const [generator, resources] of [
    ['scripts/arrow-schema.ts', ['spec/extensions/arrow/schema.json', 'spec/extensions/arrow/integration-schema.json']],
    ['scripts/arrow-flatbuffer-schema.ts', ['spec/extensions/arrow/flatbuffer-model.schema.json']],
  ]) {
    const before = new Map(resources.map(resource => [resource, createHash('sha256').update(readFileSync(resource)).digest('hex')]));
    execFileSync('bun', [generator, '--check'], { stdio: 'pipe' });
    for (const resource of resources) assert.equal(createHash('sha256').update(readFileSync(resource)).digest('hex'), before.get(resource), `${generator} --check changed ${resource}`);
  }
  assert.equal(ledger.counts.resourceAuthorityByStatus['generated-authority-known'], 56);
});

test('Delta action and checkpoint report schemas pin CONTRACT-018 composition and package closure', async () => {
  const output = execFileSync('node', ['scripts/rust-migration/r8/gap-ledger.mjs', '--stdout'], {
    cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024, encoding: 'utf8',
  });
  const ledger = JSON.parse(output);
  const expected = new Map([
    ['spec/extensions/delta-log/action-schema.json', ['scripts/delta-action-schema.ts', 'US-018-AC10',
      ['spec/extensions/delta-table/context-schema.json', 'spec/extensions/delta-log/inspection.schema.json', 'spec/core/native-json.schema.json']]],
    ['spec/extensions/delta-log/parquet-actions.schema.json', ['scripts/delta-parquet-actions-schema.ts', 'US-018-AC15',
      ['spec/extensions/parquet/values.schema.json', 'spec/core/native-json.schema.json', 'spec/extensions/delta-log/inspection.schema.json',
        'spec/extensions/parquet/physical.schema.json', 'spec/extensions/parquet/rows.schema.json', 'spec/extensions/parquet/levels.schema.json',
        'spec/extensions/parquet/pages.schema.json', 'spec/extensions/parquet/framing.schema.json', 'spec/extensions/parquet/metadata.schema.json',
        'spec/extensions/parquet/footer-decode.schema.json', 'spec/extensions/parquet/idl.json']]],
    ['spec/extensions/delta-log/sidecar-reconciliation.schema.json', ['scripts/delta-sidecars-schema.ts', 'US-018-AC16',
      ['spec/extensions/delta-log/reconciliation.schema.json', 'spec/extensions/delta-log/parquet-actions.schema.json',
        'spec/core/native-json.schema.json', 'spec/extensions/delta-log/inspection.schema.json',
        'spec/extensions/parquet/values.schema.json', 'spec/extensions/parquet/physical.schema.json', 'spec/extensions/parquet/rows.schema.json',
        'spec/extensions/parquet/levels.schema.json', 'spec/extensions/parquet/pages.schema.json', 'spec/extensions/parquet/framing.schema.json',
        'spec/extensions/parquet/metadata.schema.json', 'spec/extensions/parquet/footer-decode.schema.json', 'spec/extensions/parquet/idl.json']]],
    ['spec/extensions/delta-log/multipart.schema.json', ['scripts/delta-multipart-schema.ts', 'US-018-AC19',
      ['spec/extensions/delta-log/parquet-checkpoint.schema.json', 'spec/extensions/delta-log/reconciliation.schema.json',
        'spec/extensions/delta-log/sidecar-reconciliation.schema.json', 'spec/extensions/delta-log/parquet-actions.schema.json',
        'spec/core/native-json.schema.json', 'spec/extensions/delta-log/inspection.schema.json',
        'spec/extensions/parquet/values.schema.json', 'spec/extensions/parquet/physical.schema.json', 'spec/extensions/parquet/rows.schema.json',
        'spec/extensions/parquet/levels.schema.json', 'spec/extensions/parquet/pages.schema.json', 'spec/extensions/parquet/framing.schema.json',
        'spec/extensions/parquet/metadata.schema.json', 'spec/extensions/parquet/footer-decode.schema.json', 'spec/extensions/parquet/idl.json']]],
    ['spec/extensions/delta-log/parquet-checkpoint.schema.json', ['scripts/delta-parquet-checkpoint-schema.ts', 'US-018-AC18',
      ['spec/extensions/delta-log/reconciliation.schema.json', 'spec/extensions/delta-log/sidecar-reconciliation.schema.json',
        'spec/extensions/delta-log/parquet-actions.schema.json'], 'generated-from-contract-governed-delta-checkpoint-schema-composition']],
  ]);
  const rows = ledger.rows.filter(row => expected.has(row.source));
  assert.equal(new Set(rows.map(row => row.source)).size, expected.size);
  const index = readFileSync('src/index.ts', 'utf8');
  const commonClosure = ['docs/helix/02-design/contracts/CONTRACT-018-delta.md', 'src/index.ts', 'scripts/build.ts',
    'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'];
  for (const row of rows) {
    const [generator, clause, inputs, expectedKind] = expected.get(row.source);
    const authority = row.resourceOwnership.authority;
    assert.equal(authority.status, 'generated-authority-known', row.source);
    assert.equal(authority.kind, expectedKind ?? 'generated-from-contract-governed-delta-schema-composition', row.source);
    assert.deepEqual(authority.governingArtifacts, row.source === 'spec/extensions/delta-log/parquet-checkpoint.schema.json'
      ? ['docs/helix/02-design/contracts/CONTRACT-018-delta.md', 'docs/helix/01-frame/user-stories/US-018-delta-schema.md']
      : ['docs/helix/02-design/contracts/CONTRACT-018-delta.md']);
    assert.deepEqual(authority.governingClauses, [clause]);
    assert.deepEqual(authority.generator.entrypoints, [generator]);
    assert.deepEqual(authority.generatorInputs, inputs);
    assert.match(row.resourceOwnership.source.sha256, /^[a-f0-9]{64}$/);
    const closure = new Map(authority.sourceClosure.map(item => [item.path, item.sha256]));
    const storyClosure = row.source === 'spec/extensions/delta-log/parquet-checkpoint.schema.json'
      ? ['docs/helix/01-frame/user-stories/US-018-delta-schema.md', 'tests/delta/parquet-checkpoint.test.ts'] : [];
    for (const path of [...commonClosure, ...storyClosure, generator, ...inputs]) assert.match(closure.get(path) ?? '', /^[a-f0-9]{64}$/, `${row.source} closure omits ${path}`);
    assert.ok(index.includes(`../${row.source}`), `${row.source} is not re-exported from src/index.ts`);
    assert.ok(row.resourceOwnership.routes.some(route => route.id === 'sdk-archive'
      && route.artifactPath === `package/dist/spec/${row.source.slice('spec/'.length)}`));
  }
  for (const [generator, resources] of [
    ['scripts/delta-action-schema.ts', ['spec/extensions/delta-log/action-schema.json', 'spec/extensions/delta-log/action-inspection.schema.json']],
    ['scripts/delta-parquet-actions-schema.ts', ['spec/extensions/delta-log/parquet-actions.schema.json']],
    ['scripts/delta-sidecars-schema.ts', ['spec/extensions/delta-log/sidecar-reconciliation.schema.json']],
    ['scripts/delta-multipart-schema.ts', ['spec/extensions/delta-log/multipart.schema.json']],
  ]) {
    const before = new Map(resources.map(resource => [resource, createHash('sha256').update(readFileSync(resource)).digest('hex')]));
    execFileSync('bun', [generator, '--check'], { stdio: 'pipe' });
    for (const resource of resources) assert.equal(createHash('sha256').update(readFileSync(resource)).digest('hex'), before.get(resource), `${generator} --check changed ${resource}`);
  }
  const generatedCheckpoint = await mkdtemp(path.join(os.tmpdir(), 'umf-delta-checkpoint-writer-'));
  try {
    for (const input of expected.get('spec/extensions/delta-log/parquet-checkpoint.schema.json')[2]) {
      const target = path.join(generatedCheckpoint, input);
      await mkdir(path.dirname(target), { recursive: true });
      await cp(input, target);
    }
    const script = path.join(generatedCheckpoint, 'scripts/delta-parquet-checkpoint-schema.ts');
    await mkdir(path.dirname(script), { recursive: true });
    await cp('scripts/delta-parquet-checkpoint-schema.ts', script);
    execFileSync('bun', ['scripts/delta-parquet-checkpoint-schema.ts'], { cwd: generatedCheckpoint, stdio: 'pipe' });
    assert.deepEqual(await readFile(path.join(generatedCheckpoint, 'spec/extensions/delta-log/parquet-checkpoint.schema.json')),
      readFileSync('spec/extensions/delta-log/parquet-checkpoint.schema.json'));
  } finally {
    await rm(generatedCheckpoint, { recursive: true, force: true });
  }
  assert.equal(ledger.counts.resourceAuthorityByStatus['generated-authority-known'], 56);
});

test('native JSON tree schema is contract-attested and preserves its public source closure', () => {
  const output = execFileSync('node', ['scripts/rust-migration/r8/gap-ledger.mjs', '--stdout'], {
    cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024, encoding: 'utf8',
  });
  const ledger = JSON.parse(output);
  const row = ledger.rows.find(item => item.source === 'spec/core/native-json.schema.json' && item.routeId === 'package-root-node');
  assert.ok(row);
  const authority = row.resourceOwnership.authority;
  assert.equal(authority.status, 'authored-authority-known');
  assert.equal(authority.kind, 'authored-normative-contract-schema');
  assert.equal(authority.generator, null);
  assert.deepEqual(authority.governingArtifacts, [
    'docs/helix/02-design/contracts/CONTRACT-001-core-envelope.md',
    'docs/helix/02-design/contracts/CONTRACT-077-generated-reference.md',
  ]);
  assert.equal(JSON.parse(readFileSync('spec/core/native-json.schema.json', 'utf8')).$id, 'urn:umf:native-json:0.1.0');
  const closure = new Map(authority.sourceClosure.map(item => [item.path, item.sha256]));
  for (const path of [...authority.governingArtifacts, 'src/model/native-json.ts', 'src/index.ts', 'tests/core/native-json.test.ts',
    'src/core-ideals/cardinality-avro.ts', 'src/core-ideals/nullability-parquet.ts',
    'src/adapters/avro/facet-type.ts', 'src/adapters/postgresql/key-catalog.ts',
    'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py']) {
    assert.match(closure.get(path) ?? '', /^[a-f0-9]{64}$/, `native JSON closure omits ${path}`);
  }
  assert.match(readFileSync('docs/helix/02-design/contracts/CONTRACT-001-core-envelope.md', 'utf8'), /spec\/core\/native-json\.schema\.json.*src\/model\/native-json\.ts/);
  assert.match(readFileSync('src/index.ts', 'utf8'), /nativeJsonSchema.*native-json\.schema\.json/);
  assert.equal(row.resourceOwnership.routes.find(route => route.id === 'sdk-archive').installedQualification.status, 'not-installed-qualified');
  assert.equal(ledger.counts.resourceAuthorityByStatus['authored-authority-known'], 49);
});

test('PostgreSQL Key catalog schemas pin one exact contract-governed three-output writer', async () => {
  const output = execFileSync('node', ['scripts/rust-migration/r8/gap-ledger.mjs', '--stdout'], {
    cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024, encoding: 'utf8',
  });
  const ledger = JSON.parse(output);
  const expected = new Map([
    ['spec/extensions/postgresql-catalog/key-observations-v1.schema.json', {
      id: 'urn:umf:postgresql:key-observations:1.0.0',
      sha256: 'ce18e948e15951c4b6e1c4bb3ded57ad0a6d3ec82a33a9949a24517035e2a0be',
      consumers: ['src/adapters/postgresql/key-catalog.ts', 'src/core-ideals/key-postgresql.ts',
        'tests/core-ideals/key-postgresql-catalog.test.ts'],
    }],
    ['spec/core/postgresql-key-catalog-inspection.schema.json', {
      id: 'urn:umf:core:postgresql-key-catalog-inspection:1.0.0',
      sha256: '200d3555e92f683b18a645094c1dd0b611e977e121d4fecf73a685df7d9ff199',
      consumers: ['src/adapters/postgresql/key-catalog.ts', 'tests/core-ideals/key-postgresql-catalog.test.ts'],
    }],
    ['spec/core/postgresql-key-catalog-correlation.schema.json', {
      id: 'urn:umf:core:postgresql-key-catalog-correlation:1.0.0',
      sha256: '96e6d77ad1dbc7701b201ffd38e21cf09d0ba24232030a7e366718f8e00e5ba4',
      consumers: ['src/adapters/postgresql/key-correlation.ts', 'tests/core-ideals/key-postgresql-correlation.test.ts'],
    }],
  ]);
  const writerPath = 'scripts/core-ideals/key-postgresql-catalog-schema.ts';
  const writerSource = readFileSync(writerPath, 'utf8');
  for (const [source, details] of expected) {
    const row = ledger.rows.find(item => item.source === source && item.routeId === 'package-root-node');
    assert.ok(row, `missing resource row ${source}`);
    const authority = row.resourceOwnership.authority;
    assert.equal(authority.status, 'generated-authority-known', source);
    assert.equal(authority.kind, 'generated-from-contract-governed-postgresql-key-catalog-schemas', source);
    assert.deepEqual(authority.governingArtifacts, ['docs/helix/02-design/contracts/CONTRACT-015-postgresql.md',
      'docs/helix/01-frame/user-stories/US-015-postgresql.md']);
    assert.deepEqual(authority.governingClauses, ['US-015-AC6']);
    assert.deepEqual(authority.generator.entrypoints, [writerPath]);
    assert.deepEqual(authority.generatorInputs, []);
    const schemaBytes = readFileSync(source);
    assert.equal(JSON.parse(schemaBytes).$id, details.id, source);
    assert.equal(createHash('sha256').update(schemaBytes).digest('hex'), details.sha256, `${source} source-history pin`);
    const closure = new Map(authority.sourceClosure.map(item => [item.path, item.sha256]));
    for (const path of [...authority.governingArtifacts, 'docs/helix/02-design/contracts/CONTRACT-001-core-envelope.md',
      'spec/core/native-json.schema.json', writerPath, 'src/index.ts', 'src/adapters/postgresql/index.ts',
      ...details.consumers, 'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py']) {
      assert.match(closure.get(path) ?? '', /^[a-f0-9]{64}$/, `${source} closure omits ${path}`);
    }
    assert.equal(row.resourceOwnership.routes.find(route => route.id === 'sdk-archive').installedQualification.status,
      'not-installed-qualified');
    assert.ok(writerSource.includes(`await Bun.write('${source}',`), `${writerPath} does not write ${source}`);
  }
  const isolated = await mkdtemp(path.join(os.tmpdir(), 'umf-postgresql-key-schemas-'));
  try {
    const script = path.join(isolated, writerPath);
    await mkdir(path.dirname(script), { recursive: true });
    await cp(writerPath, script);
    execFileSync('bun', [writerPath], { cwd: isolated, stdio: 'pipe' });
    for (const source of expected.keys()) {
      assert.deepEqual(await readFile(path.join(isolated, source)), readFileSync(source), `${source} exact generated bytes`);
    }
  } finally {
    await rm(isolated, { recursive: true, force: true });
  }
  assert.equal(ledger.counts.resourceAuthorityByStatus['generated-authority-known'], 56);
});

test('Spark projection schemas pin US-017 clauses, composed input, public exports and package closure', () => {
  const ledger = JSON.parse(readFileSync('docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/gap-ledger.json', 'utf8'));
  const expected = new Map([
    ['spec/projections/spark-arrow.schema.json', ['scripts/spark-arrow-schema.ts', 'US-017-AC6', []]],
    ['spec/projections/arrow-spark.schema.json', ['scripts/arrow-spark-schema.ts', 'US-017-AC7', ['spec/projections/spark-arrow.schema.json']]],
  ]);
  const rows = ledger.rows.filter(row => expected.has(row.source));
  assert.equal(new Set(rows.map(row => row.source)).size, expected.size);
  const index = readFileSync('src/index.ts', 'utf8');
  for (const row of rows) {
    const [generator, clause, inputs] = expected.get(row.source);
    const authority = row.resourceOwnership.authority;
    assert.equal(authority.status, 'generated-authority-known', row.source);
    assert.equal(authority.kind, 'generated-from-contract-governed-spark-projection-schema', row.source);
    assert.deepEqual(authority.governingArtifacts, ['docs/helix/02-design/contracts/CONTRACT-017-spark.md', 'docs/helix/01-frame/user-stories/US-017-spark-schema.md']);
    assert.deepEqual(authority.governingClauses, [clause]);
    assert.deepEqual(authority.generator.entrypoints, [generator]);
    assert.deepEqual(authority.generatorInputs, inputs);
    assert.match(row.resourceOwnership.source.sha256, /^[a-f0-9]{64}$/);
    const closure = new Map(authority.sourceClosure.map(item => [item.path, item.sha256]));
    for (const file of ['docs/helix/02-design/contracts/CONTRACT-017-spark.md', 'docs/helix/01-frame/user-stories/US-017-spark-schema.md',
      generator, 'src/index.ts', 'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py', ...inputs]) {
      assert.match(closure.get(file) ?? '', /^[a-f0-9]{64}$/, `${row.source} closure omits ${file}`);
    }
    assert.ok(index.includes(`../${row.source}`), `${row.source} is not re-exported from src/index.ts`);
    assert.ok(row.resourceOwnership.routes.some(route => route.id === 'sdk-archive'
      && route.artifactPath === `package/dist/spec/${row.source.slice('spec/'.length)}`));

    const before = createHash('sha256').update(readFileSync(row.source)).digest('hex');
    execFileSync('bun', [generator, '--check'], { stdio: 'pipe' });
    assert.equal(createHash('sha256').update(readFileSync(row.source)).digest('hex'), before, `${generator} --check changed ${row.source}`);
  }
});

test('Parquet level, physical, row and logical report schemas pin their input chain', () => {
  const ledger = JSON.parse(readFileSync('docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/gap-ledger.json', 'utf8'));
  const expected = new Map([
    ['spec/extensions/parquet/levels.schema.json', ['scripts/parquet-levels-schema.ts', 'US-019-AC16', ['spec/extensions/parquet/pages.schema.json']]],
    ['spec/extensions/parquet/physical.schema.json', ['scripts/parquet-physical-schema.ts', 'US-019-AC17', ['spec/extensions/parquet/levels.schema.json']]],
    ['spec/extensions/parquet/rows.schema.json', ['scripts/parquet-rows-schema.ts', 'US-019-AC18', ['spec/extensions/parquet/physical.schema.json']]],
    ['spec/extensions/parquet/values.schema.json', ['scripts/parquet-values-schema.ts', 'US-019-AC19', ['spec/extensions/parquet/physical.schema.json', 'spec/extensions/parquet/rows.schema.json']]],
  ]);
  const rows = ledger.rows.filter(row => expected.has(row.source));
  assert.equal(new Set(rows.map(row => row.source)).size, expected.size);
  const index = readFileSync('src/index.ts', 'utf8');
  const commonClosure = ['docs/helix/02-design/contracts/CONTRACT-019-parquet.md', 'docs/helix/01-frame/user-stories/US-019-parquet.md',
    'scripts/parquet-levels-schema.ts', 'scripts/parquet-physical-schema.ts', 'scripts/parquet-rows-schema.ts', 'scripts/parquet-values-schema.ts',
    'scripts/parquet-pages-schema.ts', 'scripts/parquet-metadata-schema.ts', 'scripts/parquet-footer-schema.ts', 'scripts/parquet-schema.ts',
    'src/model/types.ts', 'src/index.ts', 'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py',
    'spec/extensions/parquet/levels.schema.json', 'spec/extensions/parquet/physical.schema.json', 'spec/extensions/parquet/rows.schema.json',
    'spec/extensions/parquet/values.schema.json', 'spec/extensions/parquet/pages.schema.json', 'spec/extensions/parquet/framing.schema.json',
    'spec/extensions/parquet/metadata.schema.json', 'spec/extensions/parquet/footer-decode.schema.json', 'spec/extensions/parquet/idl.json'];
  for (const row of rows) {
    const [generator, clause, inputs] = expected.get(row.source);
    const authority = row.resourceOwnership.authority;
    assert.equal(authority.status, 'generated-authority-known', row.source);
    assert.equal(authority.kind, 'generated-from-contract-governed-parquet-result-schema-chain', row.source);
    assert.deepEqual(authority.governingArtifacts, ['docs/helix/02-design/contracts/CONTRACT-019-parquet.md', 'docs/helix/01-frame/user-stories/US-019-parquet.md']);
    assert.deepEqual(authority.governingClauses, [clause]);
    assert.deepEqual(authority.generator.entrypoints, [generator]);
    assert.deepEqual(authority.generatorInputs, inputs);
    assert.match(row.resourceOwnership.source.sha256, /^[a-f0-9]{64}$/);
    const closure = new Map(authority.sourceClosure.map(item => [item.path, item.sha256]));
    for (const file of [...commonClosure, ...inputs]) assert.match(closure.get(file) ?? '', /^[a-f0-9]{64}$/, `${row.source} closure omits ${file}`);
    assert.ok(index.includes(`../${row.source}`), `${row.source} is not re-exported from src/index.ts`);
    assert.ok(row.resourceOwnership.routes.some(route => route.id === 'sdk-archive'
      && route.artifactPath === `package/dist/spec/${row.source.slice('spec/'.length)}`));

    const before = createHash('sha256').update(readFileSync(row.source)).digest('hex');
    execFileSync('bun', [generator, '--check'], { stdio: 'pipe' });
    assert.equal(createHash('sha256').update(readFileSync(row.source)).digest('hex'), before, `${generator} --check changed ${row.source}`);
  }
  assert.equal(ledger.counts.resourceAuthorityByStatus['generated-authority-known'], 56);
});

test('condition-aware routes count logical gaps once and classify each default separately', () => {
  const symbols = ['package-root-node', 'package-root-browser', 'package-reference'].flatMap(routeId => [
    { routeId, exportName: 'generatePythonClient', declarationName: 'generatePythonClient', declarationKind: 'VariableDeclaration', source: routeId === 'package-root-node' ? 'src/index-node-v4.ts' : routeId === 'package-root-browser' ? 'src/index-browser-v4.ts' : 'src/access/index.ts', line: 8, sourceSha256: 'd'.repeat(64) },
    ...[
      ['inspectCoreCardinality', 'inspect_core_cardinality'],
      ['declareCoreCardinality', 'declare_core_cardinality'],
      ['verifyCoreCardinalityDeclaration', 'verify_core_cardinality_declaration'],
    ].map(([exportName]) => ({ routeId, exportName, declarationName: exportName, declarationKind: routeId === 'package-reference' ? 'FunctionDeclaration' : 'BindingElement', source: routeId === 'package-root-node' ? 'src/index-node-v4.ts' : routeId === 'package-root-browser' ? 'src/index-browser-v4.ts' : 'src/model/cardinality.ts', line: 12, sourceSha256: 'f'.repeat(64) })),
    ...[
      ['inspectCoreKeys', 'inspect_core_keys'],
      ['lookupCoreKey', 'lookup_core_key'],
      ['declareCoreRecordMembers', 'declare_core_record_members'],
      ['declareCoreKey', 'declare_core_key'],
    ].map(([exportName]) => ({ routeId, exportName, declarationName: exportName, declarationKind: routeId === 'package-reference' ? 'FunctionDeclaration' : 'BindingElement', source: routeId === 'package-root-node' ? 'src/index-node-v4.ts' : routeId === 'package-root-browser' ? 'src/index-browser-v4.ts' : 'src/model/keys.ts', line: 14, sourceSha256: '6'.repeat(64) })),
    { routeId, exportName: 'verifyCoreKeyOperation', declarationName: 'verifyCoreKeyOperation', declarationKind: routeId === 'package-reference' ? 'FunctionDeclaration' : 'BindingElement', source: routeId === 'package-reference' ? 'src/model/keys.ts' : routeId === 'package-root-node' ? 'src/index-node-v4.ts' : 'src/index-browser-v4.ts', line: 16, sourceSha256: '5'.repeat(64) },
    ...['declareCoreRecordType', 'verifyCoreRecordTypeDeclaration'].map((exportName, index) => ({
      routeId, exportName, declarationName: exportName,
      declarationKind: routeId === 'package-reference' ? 'FunctionDeclaration' : 'BindingElement',
      source: routeId === 'package-reference' ? 'src/model/record-type.ts' : routeId === 'package-root-node' ? 'src/index-node-v4.ts' : 'src/index-browser-v4.ts',
      line: 17 + index, sourceSha256: (index ? '3' : '4').repeat(64),
    })),
    { routeId, exportName: 'validateCoreDatasetValuesCompact', declarationName: 'validateCoreDatasetValuesCompact', declarationKind: routeId === 'package-reference' ? 'FunctionDeclaration' : 'BindingElement', source: routeId === 'package-root-node' ? 'src/index-node-v4.ts' : routeId === 'package-root-browser' ? 'src/index-browser-v4.ts' : 'src/model/dataset-values-compact.ts', line: 17, sourceSha256: '9'.repeat(64) },
    { routeId, exportName: 'verifyCoreDatasetValuesCompact', declarationName: 'verifyCoreDatasetValuesCompact', declarationKind: 'FunctionDeclaration', source: 'src/model/dataset-values-compact.ts', line: 18, sourceSha256: '8'.repeat(64) },
    ...[
      ['inspectCoreFacets', 'inspect_core_facets'],
      ['declareCoreFacets', 'declare_core_facets'],
      ['verifyCoreFacetDeclaration', 'verify_core_facet_declaration'],
      ['historicalCoreFacetPatch', 'historical_core_facet_patch'],
    ].map(([exportName]) => ({ routeId, exportName, declarationName: exportName, declarationKind: routeId === 'package-reference' ? 'FunctionDeclaration' : 'BindingElement', source: routeId === 'package-root-node' ? 'src/index-node-v4.ts' : routeId === 'package-root-browser' ? 'src/index-browser-v4.ts' : 'src/model/facets.ts', line: 20, sourceSha256: '7'.repeat(64) })),
    { routeId, exportName: 'inspectCoreSemanticTypes', declarationName: 'inspectCoreSemanticTypes', declarationKind: 'FunctionDeclaration', source: 'src/model/semantic-types.ts', line: 23, sourceSha256: 'a'.repeat(64) },
    { routeId, exportName: 'futureAlgorithm', declarationName: 'futureAlgorithm', declarationKind: 'FunctionDeclaration', source: 'src/adapters/future/index.ts', line: 4, sourceSha256: 'b'.repeat(64) },
    { routeId, exportName: 'futureAlgorithm', declarationName: 'futureAlgorithm', declarationKind: 'FunctionDeclaration', source: 'src/adapters/future/index.ts', line: 8, sourceSha256: 'e'.repeat(64) },
    { routeId, exportName: 'schema', declarationName: 'schema', declarationKind: 'SourceFile', source: 'spec/core/schema.json', line: 1, sourceSha256: 'c'.repeat(64) },
  ]);
  const ledger = buildLedger({ ...args, inventory: { symbols } });
  assert.equal(ledger.rows.length, 63);
  assert.equal(ledger.counts.uniqueExportNames, 20);
  assert.equal(ledger.counts.executableRows, 20);
  assert.equal(ledger.counts.routeExecutableRows, 60);
  assert.equal(ledger.counts.inertJsonRows, 1);
  assert.equal(ledger.counts.routeInertJsonRows, 3);
  assert.equal(ledger.counts.executableDefaultRouteGaps, 20);
  assert.equal(ledger.counts.executableDefaultRouteGapsByRoute['package-root-node'].executableDefaultRouteGaps, 20);
  assert.equal(ledger.counts.executableDefaultRouteGapsByRoute['package-root-browser'].executableDefaultRouteGaps, 20);
  assert.equal(ledger.counts.executableDefaultRouteGapsByRoute['package-reference'].executableDefaultRouteGaps, null);
  assert.equal(ledger.counts.executableDefaultRouteGapsByRoute['package-reference'].retainedReferenceExecutableRows, 20);
  assert.equal(ledger.counts.executableDefaultRouteGapsByRoute['package-root-node'].rustSelectedSourceDeclarations, 16);
  assert.equal(ledger.counts.executableDefaultRouteGapsByRoute['package-root-browser'].rustSelectedSourceDeclarations, 16);
  assert.equal(ledger.counts.resourceExportAliases, 1);
  assert.equal(ledger.counts.routeResourceExportAliases, 3);
  assert.equal(ledger.counts.uniqueResourceFiles, 1);
  const byRouteAndName = new Map(ledger.rows.map(row => [`${row.routeId}:${row.exportName}`, row]));
  for (const routeId of ['package-root-node', 'package-root-browser', 'package-reference']) {
    const resourceRoute = byRouteAndName.get(`${routeId}:schema`).resourceOwnership.routes[0];
    assert.equal(resourceRoute.id, routeId);
    assert.equal(resourceRoute.inheritedDataSource, 'src/index.ts');
    assert.equal(resourceRoute.installedQualification.status, 'not-installed-qualified');
  }
  assert.equal(byRouteAndName.get('package-root-node:schema').resourceOwnership.routes[0].entrypoint, 'src/index-node-v4.ts');
  assert.equal(byRouteAndName.get('package-root-browser:schema').resourceOwnership.routes[0].entrypoint, 'src/index-browser-v4.ts');
  assert.equal(byRouteAndName.get('package-reference:schema').resourceOwnership.routes[0].entrypoint, 'src/index.ts');
  for (const routeId of ['package-root-node', 'package-root-browser']) {
    assert.equal(byRouteAndName.get(`${routeId}:inspectCoreSemanticTypes`).implementationStatus, 'inherited TypeScript implementation remains default');
    assert.equal(byRouteAndName.get(`${routeId}:generatePythonClient`).implementationStatus, 'Rust V4 implementation selected by source route; installed qualification pending');
  }
  assert.equal(byRouteAndName.get('package-reference:generatePythonClient').implementationStatus, 'TypeScript reference implementation remains explicit');
  assert.match(byRouteAndName.get('package-reference:inspectCoreSemanticTypes').disposition, /^explicit TypeScript reference/);
  assert.match(byRouteAndName.get('package-root-node:generatePythonClient').disposition, /^Node Rust V4 implementation selected/);
  assert.match(byRouteAndName.get('package-root-browser:generatePythonClient').disposition, /^browser Rust V4 implementation selected/);
  assert.equal(byRouteAndName.get('package-root-node:generatePythonClient').sourceSelectedImplementation.rustOwner, 'umf_codegen::resources::CodegenEngine::generate_python_client_host_v4');
  assert.equal(byRouteAndName.get('package-root-browser:generatePythonClient').sourceSelectedImplementation.status, 'installed-local-private-cohort');
  assert.match(byRouteAndName.get('package-root-node:generatePythonClient').sourceSelectedImplementation.qualificationStatus, /not combined-tree, publishable or retirement qualification/);
  assert.ok(byRouteAndName.get('package-root-browser:generatePythonClient').sourceSelectedImplementation.qualificationEvidenceClosure.some(item => item.path.endsWith('installed-test-receipt.json')));
  assert.equal(byRouteAndName.get('package-reference:generatePythonClient').sourceSelectedImplementation, null);
  for (const name of ['inspectCoreCardinality', 'declareCoreCardinality', 'verifyCoreCardinalityDeclaration']) {
    for (const routeId of ['package-root-node', 'package-root-browser']) {
      const row = byRouteAndName.get(`${routeId}:${name}`);
      assert.equal(row.acceptedRustOperation, `umf_core::cardinality::${name.replace(/[A-Z]/g, (letter, offset) => offset === 0 ? letter.toLowerCase() : `_${letter.toLowerCase()}`).replace('verify_core_cardinality_declaration', 'verify_core_cardinality_declaration')}`);
      assert.equal(row.sourceSelectedImplementation.status, 'unqualified-current-route');
      assert.match(row.disposition, /installed qualification pending; retirement gap remains open/);
    }
    assert.equal(byRouteAndName.get(`package-reference:${name}`).sourceSelectedImplementation, null);
  }
  for (const [name, rustName] of [
    ['inspectCoreKeys', 'inspect_core_keys'],
    ['lookupCoreKey', 'lookup_core_key'],
    ['declareCoreRecordMembers', 'declare_core_record_members'],
    ['declareCoreKey', 'declare_core_key'],
  ]) {
    for (const routeId of ['package-root-node', 'package-root-browser']) {
      const row = byRouteAndName.get(`${routeId}:${name}`);
      assert.equal(row.acceptedRustOperation, `umf_core::core_keys::${rustName}`);
      assert.equal(row.sourceSelectedImplementation.status, 'unqualified-current-route');
      assert.match(row.disposition, /Core Keys operation selected by source route; current-worktree aggregate installed qualification pending/);
    }
    assert.equal(byRouteAndName.get(`package-reference:${name}`).sourceSelectedImplementation, null);
  }
  for (const [name, rustName] of [
    ['declareCoreRecordType', 'declare_core_record_type'],
    ['verifyCoreRecordTypeDeclaration', 'verify_core_record_type_declaration'],
  ]) {
    for (const routeId of ['package-root-node', 'package-root-browser']) {
      const row = byRouteAndName.get(`${routeId}:${name}`);
      assert.equal(row.acceptedRustOperation, `umf_core::core_record_type::${rustName}`);
      assert.equal(row.sourceSelectedImplementation.status, 'source-selected-installed-private-record-type-cohort');
      assert.equal(row.sourceSelectedImplementation.rustOwner, `umf_core::core_record_type::${rustName}`);
      assert.match(row.sourceSelectedImplementation.qualificationStatus, /five-family 24-operation aggregate excludes this family/);
      assert.match(row.disposition, /aggregate gate excludes this family and retirement remains open/);
    }
    const reference = byRouteAndName.get(`package-reference:${name}`);
    assert.equal(reference.sourceSelectedImplementation, null);
    assert.equal(reference.implementationStatus, 'TypeScript reference implementation remains explicit');
  }
  for (const routeId of ['package-root-node', 'package-root-browser']) {
    const verify = byRouteAndName.get(`${routeId}:verifyCoreKeyOperation`);
    assert.equal(verify.sourceSelectedImplementation.status, 'source-selected-installed-private-source-pinned');
    assert.equal(verify.sourceSelectedImplementation.rustOwner, 'umf_core::core_keys::verify_core_key_operation');
    assert.equal(verify.acceptedRustOperation, 'umf_core::core_keys::verify_core_key_operation');
    assert.equal(verify.implementationStatus, 'Staged Rust Core Key verifier selected by source route; private Node/Bun/Chromium archive receipt is source-pinned; current-source qualification pending');
    assert.equal(verify.declarationKind, 'BindingElement');
    assert.equal(verify.bindingRoute, null);
    assert.equal(verify.bindingRouteStatus, 'installed-private-source-pinned-not-current');
    assert.doesNotMatch(verify.bindingRouteStatus, /current-cohort/);
    assert.match(verify.disposition, /retirement and release qualification remain open/);
    assert.ok(verify.sourceSelectedImplementation.qualificationEvidenceClosure.some(item => item.path.endsWith('final-key-null-verification-installed-20261026.json')));
  }
  const referenceVerify = byRouteAndName.get('package-reference:verifyCoreKeyOperation');
  assert.equal(referenceVerify.acceptedRustOperation, 'umf_core::core_keys::verify_core_key_operation');
  assert.equal(referenceVerify.implementationStatus, 'TypeScript reference implementation remains explicit');
  for (const routeId of ['package-root-node', 'package-root-browser']) {
    const validate = byRouteAndName.get(`${routeId}:validateCoreDatasetValuesCompact`);
    const verify = byRouteAndName.get(`${routeId}:verifyCoreDatasetValuesCompact`);
    assert.equal(validate.acceptedRustOperation, 'umf_core::dataset_values::validate_core_dataset_values_compact');
    assert.equal(validate.sourceSelectedImplementation.rustOwner, 'umf_core::dataset_values::validate_core_dataset_values_compact');
    assert.equal(validate.sourceSelectedImplementation.status, 'unqualified-current-route');
    assert.match(validate.disposition, /verification remains TypeScript and retirement gap remains open/);
    assert.equal(verify.sourceSelectedImplementation, null);
    assert.equal(verify.acceptedRustOperation, 'umf_core::dataset_values::verify_core_dataset_values_compact');
    assert.equal(verify.implementationStatus, 'inherited TypeScript implementation remains default');
    assert.match(verify.disposition, /bounded opt-in Rust core operation exists/);
  }
  for (const name of ['inspectCoreFacets', 'declareCoreFacets', 'verifyCoreFacetDeclaration', 'historicalCoreFacetPatch']) {
    for (const routeId of ['package-root-node', 'package-root-browser']) {
      const row = byRouteAndName.get(`${routeId}:${name}`);
      assert.equal(row.sourceSelectedImplementation.status, 'unqualified-current-route');
      assert.equal(row.acceptedRustOperation, `umf_core::facets::${name.replace(/[A-Z]/g, (letter, offset) => offset === 0 ? letter.toLowerCase() : `_${letter.toLowerCase()}`)}`);
    }
    assert.equal(byRouteAndName.get(`package-reference:${name}`).sourceSelectedImplementation, null);
  }
  assert.equal(ledger.counts.sourceSelectedRustOverrides, 32);
  assert.match(byRouteAndName.get('package-reference:inspectCoreSemanticTypes').acceptedOperationEvidence.defaultRouteStatus, /^Explicit \.\/reference/);
  assert.match(byRouteAndName.get('package-root-browser:inspectCoreSemanticTypes').acceptedOperationEvidence.defaultRouteStatus, /^Browser default route/);
  const overloadRows = ledger.rows.filter(row => row.routeId === 'package-root-node' && row.exportName === 'futureAlgorithm');
  assert.equal(overloadRows.length, 2);
  assert.notEqual(overloadRows[0].logicalDeclarationKey, overloadRows[1].logicalDeclarationKey);
  const mismatched = symbols.filter(row => !(row.routeId === 'package-reference' && row.exportName === 'futureAlgorithm' && row.line === 8));
  assert.throws(() => buildLedger({ ...args, inventory: { symbols: mismatched } }), /declaration multiplicity differs for package-reference/);
  const missingCardinalityRoute = symbols.filter(row => !(row.routeId === 'package-reference' && row.exportName === 'verifyCoreCardinalityDeclaration'));
  assert.throws(() => buildLedger({ ...args, inventory: { symbols: missingCardinalityRoute } }), /declaration multiplicity differs for package-reference/);
  const unlistedRecordTypeAlias = symbols.map(row => row.routeId === 'package-root-node' && row.exportName === 'declareCoreRecordType'
    ? { ...row, exportName: 'declareCoreRecordTypeAlias' }
    : row);
  assert.throws(() => buildLedger({ ...args, inventory: { symbols: unlistedRecordTypeAlias } }), /declaration multiplicity differs for package-root-(node|browser)/);
  assert.equal(byRouteAndName.get('package-reference:inspectCoreSemanticTypes').route, './reference');
  assert.equal(byRouteAndName.get('package-reference:inspectCoreSemanticTypes').implementationStatus, 'TypeScript reference implementation remains explicit');
  assert.throws(() => buildLedger({ ...args, inventory: { symbols: symbols.filter(row => row.routeId !== 'package-reference') } }), /missing required routes: package-reference/);
});

test('five current R8 default selections retain exact source, wire, binder and bounded evidence pins', () => {
  const names = ['validateCsvBooleanLexical', 'verifyCsvBooleanLexical', 'inspectCoreScalarType', 'inspectCoreRecordMembers', 'inspectCoreReferenceLinks'];
  const symbols = ['package-root-node', 'package-root-browser', 'package-reference'].flatMap(routeId => names.map((exportName, index) => ({
    routeId, exportName, declarationName: exportName,
    declarationKind: routeId === 'package-reference' ? 'FunctionDeclaration' : 'BindingElement',
    source: routeId === 'package-root-node' ? 'src/index-node-v4.ts' : routeId === 'package-root-browser' ? 'src/index-browser-v4.ts' : `src/model/${['csv-boolean-lexical', 'csv-boolean-lexical', 'scalar-type-inspection', 'record-members-inspection', 'reference-links-inspection'][index]}.ts`,
    line: index + 1, sourceSha256: `${index + 1}`.repeat(64),
  })));
  const ledger = buildLedger({...args, inventory: {symbols}});
  assert.equal(ledger.counts.executableDefaultRouteGaps, 5);
  assert.equal(ledger.counts.sourceSelectedRustOverrides, 10);
  assert.equal(ledger.counts.bindingRoutesProven, 5);
  for (const routeId of ['package-root-node', 'package-root-browser']) {
    assert.equal(ledger.counts.executableDefaultRouteGapsByRoute[routeId].rustSelectedSourceDeclarations, 5);
    for (const name of names) {
      const row = ledger.rows.find(item => item.routeId === routeId && item.exportName === name);
      const selected = row.sourceSelectedImplementation;
      assert.equal(selected.status, 'source-selected-installed-private-current-cohort');
      assert.equal(row.bindingRouteStatus, 'installed-private-current-cohort');
      assert.equal(row.bindingRoute, selected.bindingRoute);
      assert.equal(row.acceptedRustOperation, null);
      assert.ok(selected.sourceClosure.some(item => item.path === (routeId === 'package-root-node' ? 'src/index-node-v4.ts' : 'src/index-browser-v4.ts')));
      assert.ok(selected.sourceClosure.some(item => item.path === (selected.bindingMethod.includes('CsvBoolean') ? `bindings/core/${routeId.endsWith('browser') ? 'wasm' : 'node'}/src/csv-boolean-lexical.js` : `bindings/core/${routeId.endsWith('browser') ? 'wasm' : 'node'}/src/core-model.js`)));
      assert.ok(selected.sourceClosure.every(item => /^[a-f0-9]{64}$/.test(item.sha256)));
      assert.ok(selected.evidenceClosure.length >= 3);
      assert.match(selected.qualificationStatus, /current 3,431-file fixed-point private SDK archive/i);
      assert.match(selected.qualificationStatus, /retirement/);
    }
  }
  const csv = ledger.rows.find(item => item.routeId === 'package-root-node' && item.exportName === 'verifyCsvBooleanLexical').sourceSelectedImplementation;
  assert.match(csv.wireOperation, /prepareCsvBooleanLexicalVerification then model\/finishCsvBooleanLexicalVerification/);
  assert.equal(ledger.rows.find(item => item.routeId === 'package-reference' && item.exportName === 'inspectCoreScalarType').sourceSelectedImplementation, null);

  const substituted = symbols.map(row => row.routeId === 'package-root-node' && row.exportName === 'inspectCoreScalarType' ? {...row, source: 'src/model/scalar-type-inspection.ts'} : row);
  const negative = buildLedger({...args, inventory: {symbols: substituted}});
  assert.equal(negative.rows.find(item => item.routeId === 'package-root-node' && item.exportName === 'inspectCoreScalarType').sourceSelectedImplementation, null);
});

test('aggregate route receipt gate upgrades only its bounded families and never retires logical gaps', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'umf-r8-ledger-route-gate-'));
  try {
    await mkdir(path.join(tempRoot, 'evidence'), { recursive: true });
    await mkdir(path.join(tempRoot, 'live'), { recursive: true });
    const archiveSha = 'a'.repeat(64), inputs = {}, sourceInputCount = 7, tree = createHash('sha256'), sourceBytes = Buffer.from('shared fixture source\n');
    await writeFile(path.join(tempRoot, 'live/source.txt'), sourceBytes);
    for (let index = 0; index < sourceInputCount; index++) {
      const sourcePath = `live/${'/'.repeat(index)}source.txt`;
      inputs[sourcePath] = createHash('sha256').update(sourceBytes).digest('hex');
    }
    for (const sourcePath of Object.keys(inputs).sort()) { tree.update(sourcePath); tree.update('\0'); tree.update(sourceBytes); tree.update('\0'); }
    const closureSha = tree.digest('hex');
    const liveSource = { sourceClosure: { sha256: closureSha, capturedLiveSha256: closureSha, fileCount: sourceInputCount, inputs, transform: { status: 'fixed-point', generatedInputs: [] } } };
    const liveSourceBytes = Buffer.from(JSON.stringify(liveSource));
    await writeFile(path.join(tempRoot, 'evidence/live-source.json'), liveSourceBytes);
    const memberBytesFor = value => createHash('sha256').update(value).digest('hex');
    const members = {
      'manifest.json': memberBytesFor('manifest'), 'dist/umf-node.js': memberBytesFor('node'),
      'dist/umf-browser.js': memberBytesFor('browser'), 'dist/umf_core_node.node': memberBytesFor('addon'),
      'dist/umf_core_wasm_bg.wasm': memberBytesFor('wasm'),
    };
    const packageManifestSha256 = members['manifest.json'];
    const membersBytes = Buffer.from(JSON.stringify({ members, packageManifestSha256 }));
    await writeFile(path.join(tempRoot, 'evidence/members.json'), membersBytes);
    const preflight = { status: 'pass', archiveSha256: archiveSha, sourceClosure: { sha256: closureSha, capturedLiveSha256: closureSha, currentSourceStatus: 'current-source', liveSourceManifest: { path: 'evidence/live-source.json', sha256: createHash('sha256').update(liveSourceBytes).digest('hex') } }, memberHashVerification: { status: 'pass', algorithm: 'sha256', archiveMemberCount: Object.keys(members).length, verifiedMemberCount: Object.keys(members).length, packageManifestSha256, manifest: { path: 'evidence/members.json', sha256: createHash('sha256').update(membersBytes).digest('hex') } } };
    const preflightBytes = Buffer.from(JSON.stringify(preflight));
    await writeFile(path.join(tempRoot, 'evidence/preflight.json'), preflightBytes);
    const families = {};
    for (const [family, operations] of Object.entries(requiredR8RouteFamilies)) {
      families[family] = { status: 'pass', operations: [...operations], receipts: [] };
      for (const runtime of ['node', 'bun', 'chromium']) {
        const common = { status: 'pass', archive: { sha256: archiveSha, manifestSha256: members['manifest.json'] }, sourceClosure: { sha256: closureSha, capturedLiveSha256: closureSha, fileCount: sourceInputCount, transform: { status: 'fixed-point', generatedInputs: [] } } };
        let raw = common;
        if (family === 'csvBoolean') raw = runtime === 'chromium'
          ? { ...raw, chromium: { version: '153.0.8010.12', userAgent: 'HeadlessChrome fixture', cases: 14, wasmRequested: true, malformedReceiptExpectedSourceReads: 0 } }
          : { ...raw, [runtime]: JSON.stringify({ node: runtime === 'node' ? 'v26 fixture' : 'v1 fixture', cases: 14, root: 'file:///node_modules/@umf/core/dist/umf-node.js', reference: 'file:///node_modules/@umf/core/dist/umf.js' }) };
        if (family === 'coreInspectors') raw = { ...raw, runtime: { node: { runtime: 'Node fixture', referenceEntry: '/tmp/node_modules/@umf/core/dist/umf.js', operations: { scalarType: 8, recordMembers: 9, referenceLinks: 9 }, hostShapes: { scalarType: {}, recordMembers: {}, referenceLinks: {} } }, bun: { runtime: 'Bun fixture', referenceEntry: '/tmp/node_modules/@umf/core/dist/umf.js', operations: { scalarType: 8, recordMembers: 9, referenceLinks: 9 }, hostShapes: { scalarType: {}, recordMembers: {}, referenceLinks: {} } } }, chromium: { version: '153.0.8010.12', userAgent: 'HeadlessChrome fixture', referenceEntry: '@umf/core/reference', wasmRequested: true, operations: { scalarType: 8, recordMembers: 9, referenceLinks: 9 } }, memberHashes: members };
        if (family === 'coreRelationships') raw = runtime === 'chromium'
          ? { status: 'pass', browser: '153.0.8010.12', userAgent: 'HeadlessChrome fixture', caseCount: 11, nodeGlobalsAbsent: true, browserEntrySha256: members['dist/umf-browser.js'], wasmSha256: members['dist/umf_core_wasm_bg.wasm'], exactPacketParity: true, sourceHashes: inputs }
          : { status: 'pass', runtime: runtime === 'node' ? 'Node fixture' : 'Bun fixture', caseCount: 11, exactOutcomeParity: true, artifactHashes: { nodeEntry: members['dist/umf-node.js'], nativeAddon: members['dist/umf_core_node.node'] }, sourceHashes: inputs };
        if (family === 'bit128Uuid') raw = runtime === 'chromium'
          ? { status: 'pass', browser: 'Chromium fixture', archiveEntrySha256: members['dist/umf-browser.js'], wasmSha256: members['dist/umf_core_wasm_bg.wasm'], wasmRequested: true, exactFrozenPacketParity: true, sourceClosure: inputs }
          : { status: 'pass', runtime: runtime === 'node' ? 'Node fixture' : 'Bun fixture', entrySha256: members['dist/umf-node.js'], nativeAddonSha256: members['dist/umf_core_node.node'], exactFrozenPacketParity: true, sourceClosure: inputs };
        if (family === 'coreKeys') raw = { ...raw, currentSourceStatus: 'current-source', hosts: { [runtime]: runtime === 'chromium' ? { status: 'pass', caseCount: 4, operations: ['inspect', 'lookup', 'declareMembers', 'declareKey'], referenceParity: true, wasmRequested: true } : { runtime: runtime === 'node' ? 'Node fixture' : 'Bun fixture', status: 'pass', caseCount: 4, operations: ['inspect', 'lookup', 'declareMembers', 'declareKey'], frozenOutcomes: true, referenceParity: true, prototypeAndKeyOrder: true, hostAdmission: { lookupIdentityBeforeSource: true, keyRequestBeforeSource: true } } } };
        const bytes = Buffer.from(JSON.stringify(raw));
        const receiptPath = `evidence/${family}-${runtime}.json`;
        await writeFile(path.join(tempRoot, receiptPath), bytes);
        families[family].receipts.push(normalizeR8RouteHostReceipt({ family, runtime, raw, rawPath: receiptPath, rawSha256: createHash('sha256').update(bytes).digest('hex'), archive: { sha256: archiveSha, sourceClosureSha256: closureSha, sourceInputCount, packageManifestSha256 }, memberHashes: members, liveInputs: inputs, root: tempRoot }));
      }
    }
    const manifest = {
      format: 'umf.r8.installed-route-evidence/1', status: 'pass',
      archive: { sha256: archiveSha, sourceClosureSha256: closureSha, sourceInputCount, generatedTransformCount: 0 },
      preflight: { path: 'evidence/preflight.json', sha256: createHash('sha256').update(preflightBytes).digest('hex'), memberHashesVerified: true },
      families, logicalRetirementGaps: 922,
    };
    const operationNames = Object.values(requiredR8RouteFamilies).flat();
    const sourceByName = Object.fromEntries([
      ...requiredR8RouteFamilies.csvBoolean.map(name => [name, 'src/model/csv-boolean-lexical.ts']),
      ...requiredR8RouteFamilies.coreInspectors.map(name => [name, 'src/model/scalar-type-inspection.ts']),
      ...requiredR8RouteFamilies.coreRelationships.map(name => [name, 'src/model/relationships.ts']),
      ...requiredR8RouteFamilies.bit128Uuid.map(name => [name, name.includes('Uuid') || name.startsWith('uuid') ? 'src/model/uuid.ts' : 'src/model/bit128.ts']),
      ...requiredR8RouteFamilies.coreKeys.map(name => [name, 'src/model/keys.ts']),
    ]);
    const symbols = [...['package-root-node', 'package-root-browser'].flatMap(routeId => operationNames.map((exportName, index) => ({
      routeId, exportName, declarationName: exportName, declarationKind: 'BindingElement',
      source: routeId === 'package-root-node' ? 'src/index-node-v4.ts' : 'src/index-browser-v4.ts',
      line: index + 1, sourceSha256: `${String(index + 1).padStart(2, '0')}`.repeat(32),
    }))), ...operationNames.map((exportName, index) => ({
      routeId: 'package-reference', exportName, declarationName: exportName, declarationKind: 'FunctionDeclaration',
      source: sourceByName[exportName], line: index + 1, sourceSha256: `${String(index + 1).padStart(2, '0')}`.repeat(32),
    }))];
    const inventory = { symbols };
    const baseline = buildLedger({ ...args, inventory });
    const gated = buildLedger({ ...args, inventory, installedRouteEvidenceManifest: manifest, installedRouteEvidenceRoot: tempRoot });
    assert.equal(gated.counts.executableDefaultRouteGaps, baseline.counts.executableDefaultRouteGaps);
    assert.equal(gated.counts.executableDefaultRouteGaps, 24);
    assert.equal(gated.installedRouteEvidence.boundedOperations, 24);
    assert.equal(gated.installedRouteEvidence.logicalRetirementGaps, 922);
    assert.equal(gated.counts.bindingRoutesProven, 24);
    for (const row of gated.rows.filter(item => item.routeId !== 'package-reference')) {
      assert.equal(row.sourceSelectedImplementation.status, 'source-selected-installed-private-current-cohort', row.exportName);
      assert.equal(row.bindingRouteStatus, 'installed-private-current-cohort', row.exportName);
    }
    assert.throws(() => buildLedger({ ...args, inventory, installedRouteEvidenceManifest: { ...manifest, logicalRetirementGaps: 921 }, installedRouteEvidenceRoot: tempRoot }), /preserve all 922/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('adapter ownership supplement maps exact operations without retirement or parity inflation', () => {
  const adapterRows = [
    ['editJsonSchemaNode', 'src/adapters/json-schema/index.ts'],
    ['exportJsonSchema', 'src/adapters/json-schema/index.ts'],
    ['exportJsonSchemaBundle', 'src/adapters/json-schema/index.ts'],
    ['exportJsonSchemaResources', 'src/adapters/json-schema/index.ts'],
    ['getJsonSchemaNode', 'src/adapters/json-schema/index.ts'],
    ['importJsonSchema', 'src/adapters/json-schema/index.ts'],
    ['inspectJsonSchema', 'src/adapters/json-schema/index.ts'],
    ['JSON_SCHEMA_DIALECT', 'src/adapters/json-schema/index.ts'],
    ['JSON_SCHEMA_EXTENSION', 'src/adapters/json-schema/index.ts'],
    ['jsonSchemaPackage', 'src/adapters/json-schema/index.ts'],
    ['jsonSchemaRegistry', 'src/adapters/json-schema/index.ts'],
    ['walkJsonSchema', 'src/adapters/json-schema/index.ts'],
    ['parseNativeJson', 'src/model/native-json.ts'],
    ['exportProtobufBundle', 'src/adapters/protobuf/index.ts'],
    ['exportProtobufDescriptorSet', 'src/adapters/protobuf/index.ts'],
    ['exportProtobufSources', 'src/adapters/protobuf/source.ts'],
    ['getProtobufDescriptorSet', 'src/adapters/protobuf/index.ts'],
    ['importProtobufDescriptorSet', 'src/adapters/protobuf/index.ts'],
    ['readDescriptorSet', 'src/adapters/protobuf/descriptor.ts'],
    ['inspectProtobuf', 'src/adapters/protobuf/index.ts'],
    ['importProtobufSources', 'src/adapters/protobuf/source.ts'],
    ['proposeProtobufDescriptorEdit', 'src/adapters/protobuf/index.ts'],
    ['PROTOBUF_EXTENSION', 'src/adapters/protobuf/index.ts'],
    ['protobufPackage', 'src/adapters/protobuf/index.ts'],
    ['protobufRegistry', 'src/adapters/protobuf/index.ts'],
    ['writeDescriptorSet', 'src/adapters/protobuf/descriptor.ts'],
  ].map(([exportName, source], index) => ({
    routeId: 'package-root', exportName, declarationName: exportName,
    declarationKind: 'FunctionDeclaration', source, line: index + 1, sourceSha256: 'f'.repeat(64),
  }));
  const ledger = buildLedger({ ...args, inventory: { symbols: adapterRows } });
  const byName = new Map(ledger.rows.map(row => [row.exportName, row.operationOwnership]));
  assert.equal(ledger.rows.length, 26);
  assert.deepEqual(ledger.counts.adapterOwnershipByStatus, {
    'accepted-opt-in-subset': 4,
    'candidate-core': 12,
    'partial-host-boundary': 2,
    unported: 3,
    'data-or-constant': 5,
  });
  assert.equal(byName.get('importJsonSchema').status, 'candidate-core');
  assert.equal(byName.get('importJsonSchema').wireOperation, 'importJsonSchema');
  assert.equal(byName.get('inspectJsonSchema').knownMismatches.length, 1);
  assert.match(byName.get('inspectJsonSchema').nativeGate, /30\/30/);
  assert.match(byName.get('inspectJsonSchema').nativeGate, /broader 1,301-vector Draft corpus remains rejected/);
  assert.equal(byName.get('editJsonSchemaNode').status, 'candidate-core');
  assert.equal(byName.get('editJsonSchemaNode').wireOperation, null);
  assert.equal(byName.get('parseNativeJson').status, 'accepted-opt-in-subset');
  assert.equal(byName.get('parseNativeJson').supportProfile, 'umf-r5-json-schema/0.1.0 parseNativeJson typed-string operation; opt-in; frozen parser subset 11/11');
  assert.equal(byName.get('parseNativeJson').rustOwner, 'umf_core::native_json::NativeJsonTree::parse_json');
  assert.equal(byName.get('parseNativeJson').wireOperation, 'parseNativeJson');
  assert.deepEqual(byName.get('parseNativeJson').bindingRoutes, ['Node native addon', 'WASM browser']);
  assert.match(byName.get('parseNativeJson').hostGate, /TypeScript default root remains active/);
  assert.equal(byName.get('importProtobufDescriptorSet').status, 'candidate-core');
  assert.equal(byName.get('readDescriptorSet').status, 'accepted-opt-in-subset');
  assert.match(byName.get('readDescriptorSet').supportProfile, /CPython 3\.11\.17 Darwin arm64/);
  assert.equal(byName.get('inspectProtobuf').wireOperation, 'protobuf.descriptor.inspect');
  assert.equal(byName.get('importProtobufSources').status, 'partial-host-boundary');
  assert.equal(byName.get('proposeProtobufDescriptorEdit').status, 'unported');
  assert.equal(byName.get('protobufRegistry').status, 'unported');
  assert.equal(byName.get('JSON_SCHEMA_DIALECT').status, 'data-or-constant');
  assert.equal(byName.get('protobufPackage').status, 'data-or-constant');
  for (const row of ledger.rows) {
    assert.equal(row.operationOwnership.defaultRouteStatus, 'TypeScript package-root export remains default; zero rows retired');
    assert.equal(row.operationOwnership.reviewStatus, 'Sol-approved mapping schema; row-level independent review pending');
    assert.ok(row.operationOwnership.sourceClosure.every(item => /^[a-f0-9]{64}$/.test(item.sha256)));
    assert.ok(row.operationOwnership.evidenceClosure.every(item => /^[a-f0-9]{64}$/.test(item.sha256)));
    assert.ok(!Object.hasOwn(row.operationOwnership, 'retired'));
  }
});

test('JSON value serialization maps only the opt-in source-proved Rust profile', () => {
  const symbols = ['readJsonValue', 'writeJsonValue'].map((exportName, index) => ({
    routeId: 'package-root', exportName, declarationName: exportName,
    declarationKind: 'FunctionDeclaration', source: 'src/model/serialization.ts', line: index + 1,
    sourceSha256: 'f'.repeat(64),
  }));
  const ledger = buildLedger({...args, inventory: {symbols}});
  assert.equal(ledger.counts.executableWithAcceptedOptInRustOperation, 2);
  assert.equal(ledger.counts.executableDefaultRouteGaps, 2);
  for (const [name, owner, wireTest, nodeTest, wasmTest] of [
    ['readJsonValue', 'umf_core::serialization::read_typescript_json_value', 'crates/umf-core-wire/tests/r8_json_value_serialization_wire.rs', 'scripts/rust-migration/r8/json-value-serialization-binding-node.mjs', 'scripts/rust-migration/r8/json-value-serialization-wasm-node.mjs'],
    ['writeJsonValue', 'umf_core::serialization::write_typescript_json_value', 'crates/umf-core-wire/tests/r8_json_value_serialization_wire.rs', 'scripts/rust-migration/r8/json-value-serialization-binding-node.mjs', 'scripts/rust-migration/r8/json-value-serialization-wasm-node.mjs'],
  ]) {
    const row = ledger.rows.find(item => item.exportName === name);
    assert.equal(row.acceptedRustOperation, owner);
    assert.equal(row.operationOwnership, null);
    assert.equal(row.defaultRoute, 'TypeScript declaration from current package root');
    assert.ok(row.acceptedOperationEvidence.rustSourceClosure.some(item => item.path === 'crates/umf-core-wire/src/lib.rs'));
    assert.ok(row.acceptedOperationEvidence.rustSourceClosure.some(item => item.path === 'bindings/core/node/src/lib.rs'));
    assert.ok(row.acceptedOperationEvidence.rustSourceClosure.some(item => item.path === 'bindings/core/wasm/src/lib.rs'));
    for (const file of [wireTest, nodeTest, wasmTest, 'scripts/rust-migration/r8/json-value-serialization-browser.mjs']) {
      assert.ok(row.acceptedOperationEvidence.focusedTestClosure.some(item => item.path === file), `${name} evidence omits ${file}`);
    }
    assert.ok(row.acceptedOperationEvidence.evidenceClosure.some(item => item.path === 'docs/helix/04-build/evidence/rust-migration/r8-json-value-serialization/README.md'));
    assert.match(row.acceptedOperationEvidence.scopeRule, /24-case/);
    assert.match(row.acceptedOperationEvidence.scopeRule, /installed package qualification.*remain open/);
    assert.equal(row.disposition, 'opt-in Rust core operation exists; default TypeScript route remains TypeScript');
  }
});

test('reviewed R5 core operations map exact package-root declarations without retirement', () => {
  const mappings = [
    ['inspectCoreSemanticTypes', 'src/model/semantic-types.ts', 'umf_core::core_semantic_types::inspect_core_semantic_types', 'r5-core-semantic-types/README.md'],
    ['getCoreSemanticTypes', 'src/model/semantic-types.ts', 'umf_core::core_semantic_types::get_core_semantic_types', 'r5-core-semantic-types/README.md'],
    ['declareCoreSemanticTypes', 'src/model/semantic-types.ts', 'umf_core::core_semantic_types::declare_core_semantic_types', 'r5-core-semantic-types/README.md'],
    ['verifyCoreSemanticTypeDeclaration', 'src/model/semantic-types.ts', 'umf_core::core_semantic_types::verify_core_semantic_type_declaration', 'r5-core-semantic-types/README.md'],
    ['validateCoreSemanticTypeValue', 'src/model/semantic-types.ts', 'umf_core::core_semantic_types::validate_core_semantic_type_value', 'r5-semantic-value/README.md'],
    ['validateCoreRecordValues', 'src/model/record-values.ts', 'umf_core::record_values::validate_core_record_values', 'r5-record-values/README.md'],
    ['inspectCoreRecordMembers', 'src/model/record-members.ts', 'umf_core::record_members_inspection::inspect_core_record_members', 'r5-record-members-inspection/README.md'],
    ['validateCoreDatasetValues', 'src/model/dataset-values.ts', 'umf_core::dataset_values::validate_core_dataset_values', 'r5-dataset-values/README.md'],
    ['verifyCoreDatasetValues', 'src/model/dataset-values.ts', 'umf_core::dataset_values::verify_core_dataset_values', 'r5-dataset-values/README.md'],
    ['validateCoreDatasetValuesCompact', 'src/model/dataset-values-compact.ts', 'umf_core::dataset_values::validate_core_dataset_values_compact', 'r5-dataset-values-compact/README.md'],
    ['verifyCoreDatasetValuesCompact', 'src/model/dataset-values-compact.ts', 'umf_core::dataset_values::verify_core_dataset_values_compact', 'r5-dataset-values-compact/README.md'],
    ['encodeCoreKeyTuple', 'src/model/key-tuple.ts', 'umf_core::core_key_tuple::encode_core_key_tuple', 'r5-core-key-tuple/README.md'],
    ['verifyCoreKeyTuple', 'src/model/key-tuple.ts', 'umf_core::core_key_tuple::verify_core_key_tuple', 'r5-core-key-tuple/README.md'],
    ['inspectCoreKeys', 'src/model/keys.ts', 'umf_core::core_keys::inspect_core_keys', 'r5-core-keys/README.md'],
    ['lookupCoreKey', 'src/model/keys.ts', 'umf_core::core_keys::lookup_core_key', 'r5-core-keys/README.md'],
    ['declareCoreRecordMembers', 'src/model/keys.ts', 'umf_core::core_keys::declare_core_record_members', 'r5-core-keys/README.md'],
    ['declareCoreKey', 'src/model/keys.ts', 'umf_core::core_keys::declare_core_key', 'r5-core-keys/README.md'],
    ['verifyCoreKeyOperation', 'src/model/keys.ts', 'umf_core::core_keys::verify_core_key_operation', 'r5-core-keys/README.md'],
    ['inspectCoreFacets', 'src/model/facets.ts', 'umf_core::facets::inspect_core_facets', 'r5-core-facets/README.md'],
    ['declareCoreFacets', 'src/model/facets.ts', 'umf_core::facets::declare_core_facets', 'r5-core-facets/README.md'],
    ['verifyCoreFacetDeclaration', 'src/model/facets.ts', 'umf_core::facets::verify_core_facet_declaration', 'r5-core-facets/README.md'],
    ['historicalCoreFacetPatch', 'src/model/facets.ts', 'umf_core::facets::historical_core_facet_patch', 'r5-core-facets/README.md'],
    ['inspectCoreElementKind', 'src/model/field-kind.ts', 'umf_core::core_kind::inspect_core_kind', 'r5-kind-nullability/README.md'],
    ['declareCoreElementKind', 'src/model/field-kind.ts', 'umf_core::core_kind::declare_core_kind', 'r5-kind-nullability/README.md'],
    ['verifyCoreKindDeclaration', 'src/model/field-kind.ts', 'umf_core::core_kind::verify_core_kind_declaration', 'r5-kind-nullability/README.md'],
    ['inspectCoreNullability', 'src/model/nullability.ts', 'umf_core::nullability::inspect_core_nullability', 'r5-kind-nullability/README.md'],
    ['declareCoreNullability', 'src/model/nullability.ts', 'umf_core::nullability::declare_core_nullability', 'r5-kind-nullability/README.md'],
    ['verifyCoreNullabilityDeclaration', 'src/model/nullability.ts', 'umf_core::nullability::verify_core_nullability_declaration', 'r5-kind-nullability/README.md'],
    ['inspectCoreCardinality', 'src/model/cardinality.ts', 'umf_core::cardinality::inspect_core_cardinality', 'r5-cardinality/README.md'],
    ['declareCoreCardinality', 'src/model/cardinality.ts', 'umf_core::cardinality::declare_core_cardinality', 'r5-cardinality/README.md'],
    ['verifyCoreCardinalityDeclaration', 'src/model/cardinality.ts', 'umf_core::cardinality::verify_core_cardinality_declaration', 'r5-cardinality/README.md'],
    ['getSemanticTypes', 'src/extensions/semantic-types/index.ts', 'umf_core::semantic_type_accessors::get_semantic_types', 'r5-semantic-type-accessors/README.md'],
    ['setSemanticTypes', 'src/extensions/semantic-types/index.ts', 'umf_core::semantic_type_accessors::set_semantic_types', 'r5-semantic-type-accessors/README.md'],
    ['parseNativeJson', 'src/model/native-json.ts', 'umf_core::native_json::NativeJsonTree::parse_json', 'r8-native-json-parser/README.md'],
  ];
  const unsupported = [
    ['readCoreKeyTupleBytes', 'src/model/key-tuple.ts'],
    ['prepareCoreKeyTuples', 'src/model/key-tuple.ts'],
    ['SemanticTypeRegistry', 'src/extensions/semantic-types/index.ts'],
    ['semanticTypesRegistry', 'src/extensions/semantic-types/index.ts'],
    ['validateSemanticTypeValue', 'src/extensions/semantic-types/index.ts'],
  ];
  const rows = [...mappings, ...unsupported].map(([exportName, source], index) => ({
    routeId: 'package-root', exportName, declarationName: exportName,
    declarationKind: 'FunctionDeclaration', source, line: index + 1, sourceSha256: 'f'.repeat(64),
  }));
  const ledger = buildLedger({ ...args, inventory: { symbols: rows } });
  const byName = new Map(ledger.rows.map(row => [row.exportName, row]));
  assert.equal(ledger.counts.executableRows, 39);
  assert.equal(ledger.counts.executableWithAcceptedOptInRustOperation, 34);
  assert.equal(ledger.counts.executableWithoutAcceptedRustMapping, 5);
  assert.equal(ledger.counts.executableDefaultRouteGaps, 39);
  for (const [name, source, rustOwner, evidence] of mappings) {
    const row = byName.get(name);
    assert.equal(row.source, source);
    assert.equal(row.acceptedRustOperation, rustOwner);
    assert.equal(row.evidence, `docs/helix/04-build/evidence/rust-migration/${evidence}`);
    assert.match(row.disposition, /default TypeScript route remains TypeScript/);
    assert.equal(row.bindingRoute, null);
    assert.equal(row.bindingRouteStatus, 'unproven');
    const pin = row.acceptedOperationEvidence;
    assert.equal(pin.defaultRouteStatus, 'TypeScript package-root export remains default; zero rows retired');
    assert.match(pin.scopeRule, /linked R5 packet defines the bounded operation subset/);
    for (const field of ['rustSourceClosure', 'evidenceClosure', 'focusedTestClosure']) {
      assert.ok(pin[field].length > 0, `${name} needs a populated ${field}`);
      for (const item of pin[field]) {
        assert.match(item.sha256, /^[a-f0-9]{64}$/);
        const liveHash = createHash('sha256').update(readFileSync(item.path)).digest('hex');
        assert.equal(item.sha256, liveHash, `${name} pin drift: ${item.path}`);
      }
    }
    assert.ok(pin.rustSourceClosure.some(item => item.path.startsWith('crates/umf-core/src/')));
    assert.ok(pin.evidenceClosure.some(item => item.path === row.evidence));
    if (name === 'parseNativeJson') {
      assert.equal(row.sourceSelectedImplementation, null);
      assert.equal(row.bindingRouteStatus, 'unproven');
      assert.equal(row.implementationStatus, 'TypeScript package-root export remains default');
      assert.match(row.disposition, /default TypeScript route remains TypeScript/);
      assert.equal(pin.defaultRouteStatus, 'TypeScript package-root export remains default; zero rows retired');
    }
  }
  for (const [name] of unsupported) {
    const row = byName.get(name);
    assert.equal(row.acceptedRustOperation, null, `${name} must remain unmapped until its exact boundary is reviewed`);
    assert.equal(row.acceptedOperationEvidence, null);
    assert.equal(row.evidence, null);
    assert.match(row.disposition, /^default route remains TypeScript;/);
  }
  assert.ok(ledger.rows.every(row => row.defaultRoute === 'TypeScript declaration from current package root'));
  assert.ok(ledger.rows.every(row => !Object.hasOwn(row, 'retired')));
});

test('exact JSON number has an opt-in Rust operation with host evidence but no default retirement', () => {
  const symbols = ['package-root-node', 'package-root-browser', 'package-reference'].map((routeId, index) => ({
    routeId, exportName: 'assertExactJsonNumber', declarationName: 'assertExactJsonNumber',
    declarationKind: 'FunctionDeclaration', source: 'src/model/internal/json-number.ts',
    line: index + 1, sourceSha256: 'a'.repeat(64),
  }));
  const ledger = buildLedger({ ...args, inventory: { symbols } });
  assert.equal(ledger.counts.executableDefaultRouteGaps, 1);
  assert.equal(ledger.counts.executableWithAcceptedOptInRustOperation, 1);
  for (const row of ledger.rows) {
    assert.equal(row.acceptedRustOperation, 'umf_core::json_number::assert_exact_json_number');
    assert.equal(row.bindingRouteStatus, 'unproven');
    assert.equal(row.bindingRoute, null);
    assert.match(row.disposition, row.routeId === 'package-reference'
      ? /TypeScript reference declaration remains available/
      : /TypeScript implementation remains in route; zero declarations retired/);
    const pin = row.acceptedOperationEvidence;
    assert.match(pin.scopeRule, /R8 JSON-number packet defines string-input parity/);
    for (const filename of ['typescript-predecessor.json', 'node-replay.json', 'bun-replay.json', 'chromium-replay.json']) {
      const file = `docs/helix/04-build/evidence/rust-migration/r8-json-number-predecessor/${filename}`;
      assert.ok(pin.evidenceClosure.some(item => item.path === file), `${row.routeId} misses ${filename}`);
    }
    assert.ok(pin.rustSourceClosure.some(item => item.path === 'crates/umf-core/src/json_number.rs'));
    assert.ok(pin.focusedTestClosure.some(item => item.path === 'crates/umf-core-wire/tests/r8_json_number_wire.rs'));
    if (row.routeId === 'package-reference') assert.equal(row.sourceSelectedImplementation, null);
  }
});

test('relationship selection maps a bounded opt-in Rust operation without replacing Registry-aware defaults', () => {
  const symbols = ['package-root-node', 'package-root-browser', 'package-reference'].map((routeId, index) => ({
    routeId, exportName: 'selectCoreRelationships', declarationName: 'selectCoreRelationships',
    declarationKind: 'FunctionDeclaration', source: 'src/model/relationship-selection.ts',
    line: index + 1, sourceSha256: 'b'.repeat(64),
  }));
  const ledger = buildLedger({ ...args, inventory: { symbols } });
  assert.equal(ledger.counts.executableDefaultRouteGaps, 1);
  assert.equal(ledger.counts.executableWithAcceptedOptInRustOperation, 1);
  for (const row of ledger.rows) {
    assert.equal(row.acceptedRustOperation, 'umf_core::core_relationship_selection::select_core_relationships');
    assert.equal(row.bindingRouteStatus, 'unproven');
    assert.equal(row.bindingRoute, null);
    assert.match(row.disposition, /TypeScript/);
    const pin = row.acceptedOperationEvidence;
    assert.match(pin.scopeRule, /excluding Registry callbacks and JavaScript error class identity/);
    for (const file of [
      'docs/helix/04-build/evidence/rust-migration/r5-core-relationship-selection/frozen-typescript.json',
      'docs/helix/04-build/evidence/rust-migration/r8-core-relationship-selection-binding/README.md',
      'docs/helix/04-build/evidence/rust-migration/r8-core-relationship-selection-binding/receipts.json',
    ]) assert.ok(pin.evidenceClosure.some(item => item.path === file));
    assert.ok(pin.rustSourceClosure.some(item => item.path === 'crates/umf-core/src/core_relationship_selection.rs'));
    assert.ok(pin.focusedTestClosure.some(item => item.path === 'crates/umf-core-wire/tests/r8_core_relationship_selection_wire.rs'));
    if (row.routeId === 'package-reference') assert.equal(row.sourceSelectedImplementation, null);
  }
});

test('security truth and composition map only their four reviewed opt-in operations', () => {
  const operations = [
    ['securityNot', 'security_not'],
    ['securityAnd', 'security_and'],
    ['securityOr', 'security_or'],
    ['composeSecurityRules', 'compose_security_rules'],
  ];
  const symbols = operations.flatMap(([exportName], index) =>
    ['package-root-node', 'package-root-browser', 'package-reference'].map((routeId, routeIndex) => ({
      routeId, exportName, declarationName: exportName,
      declarationKind: 'FunctionDeclaration', source: 'src/extensions/security/logic.ts',
      line: index * 3 + routeIndex + 1, sourceSha256: 'c'.repeat(64),
    })));
  const ledger = buildLedger({ ...args, inventory: { symbols } });
  assert.equal(ledger.counts.executableDefaultRouteGaps, 4);
  assert.equal(ledger.counts.executableWithAcceptedOptInRustOperation, 4);
  assert.equal(ledger.counts.bindingRoutesProven, 0);
  for (const row of ledger.rows) {
    const rustSymbol = operations.find(([name]) => name === row.exportName)[1];
    assert.equal(row.acceptedRustOperation, `umf_core::security_logic::${rustSymbol}`);
    assert.equal(row.bindingRouteStatus, 'unproven');
    assert.equal(row.bindingRoute, null);
    const pin = row.acceptedOperationEvidence;
    assert.match(pin.scopeRule, /already-evaluated rules/);
    assert.ok(pin.evidenceClosure.some(item => item.path === 'docs/helix/04-build/evidence/rust-migration/r8-security-truth-logic-binding/README.md'));
    assert.ok(pin.rustSourceClosure.some(item => item.path === 'crates/umf-core/src/security_logic.rs'));
    assert.ok(pin.focusedTestClosure.some(item => item.path === 'bindings/core/node/tests/security-logic.test.js'));
    if (row.routeId === 'package-reference') assert.equal(row.sourceSelectedImplementation, null);
  }
});

test('all eleven Bit128/UUID operations carry source-selected-only status and authority closure', () => {
  const operations = [
    ['parseBits128', 'src/model/bit128.ts', 'parse_bits128'],
    ['parseUuid', 'src/model/uuid.ts', 'parse_uuid'],
    ['bits128FromBytes', 'src/model/bit128.ts', 'bits128_from_bytes'],
    ['bits128ToBytes', 'src/model/bit128.ts', 'bits128_to_bytes'],
    ['uuidFromBits128', 'src/model/uuid.ts', 'uuid_from_bits128'],
    ['uuidToBits128', 'src/model/uuid.ts', 'uuid_to_bits128'],
    ['compareBits128', 'src/model/bit128.ts', 'compare_bits128'],
    ['bits128ToWords', 'src/model/bit128.ts', 'bits128_to_words'],
    ['bits128FromWords', 'src/model/bit128.ts', 'bits128_from_words'],
    ['bits128ToInteger', 'src/model/bit128.ts', 'bits128_to_integer'],
    ['bits128FromInteger', 'src/model/bit128.ts', 'bits128_from_integer'],
  ];
  const symbols = ['package-root-node', 'package-root-browser', 'package-reference'].flatMap(routeId => operations.map(([exportName, source]) => ({
    routeId,
    exportName,
    declarationName: exportName,
    declarationKind: routeId === 'package-reference' ? 'FunctionDeclaration' : 'BindingElement',
    source: routeId === 'package-root-node' ? 'src/index-node-v4.ts' : routeId === 'package-root-browser' ? 'src/index-browser-v4.ts' : source,
    line: 1,
    sourceSha256: 'a'.repeat(64),
  })));
  const ledger = buildLedger({...args, inventory: {symbols}});
  assert.equal(ledger.counts.uniqueExportNames, 11);
  assert.equal(ledger.counts.executableRows, 11);
  assert.equal(ledger.counts.executableWithAcceptedOptInRustOperation, 11);
  assert.equal(ledger.counts.executableDefaultRouteGaps, 11);
  assert.equal(ledger.counts.sourceSelectedRustOverrides, 22);
  const rows = new Map(ledger.rows.map(row => [`${row.routeId}:${row.exportName}`, row]));
  for (const [name, source, symbol] of operations) {
    for (const [routeId, entry] of [['package-root-node', 'src/index-node-v4.ts'], ['package-root-browser', 'src/index-browser-v4.ts']]) {
      const row = rows.get(`${routeId}:${name}`);
      assert.equal(row.acceptedRustOperation, `umf_core::bit128::${symbol}`);
      assert.equal(row.sourceSelectedImplementation.status, 'source-selected-only');
      assert.equal(row.sourceSelectedImplementation.supportProfile, 'umf-128/1');
      assert.ok(row.sourceSelectedImplementation.sourceClosure.some(item => item.path === entry));
      assert.ok(row.sourceSelectedImplementation.sourceClosure.some(item => item.path === 'src/access/rust-bit128-default.ts'));
      assert.ok(row.sourceSelectedImplementation.sourceClosure.some(item => item.path === 'crates/umf-core-wire/src/lib.rs'));
      for (const path of [
        'bindings/core/node/src/bit128.js', 'bindings/core/node/src/wire.js', 'bindings/core/node/src/lib.rs',
        'bindings/core/wasm/src/bit128.js', 'bindings/core/wasm/src/wire.js', 'bindings/core/wasm/src/lib.rs',
        'scripts/rust-migration/r5/bit128-default-route/predecessor.json', 'tests/rust-bit128-default.test.ts',
        'docs/helix/02-design/contracts/CONTRACT-076-128-bit-uuid.md',
      ]) assert.ok(row.sourceSelectedImplementation.sourceClosure.some(item => item.path === path), `${name} closure misses ${path}`);
      assert.equal(row.bindingRouteStatus, 'unproven');
      assert.match(row.disposition, /installed Node\/Bun\/Chromium qualification pending; zero declarations retired/);
      assert.ok(row.acceptedOperationEvidence.evidenceClosure.some(item => item.path === 'scripts/rust-migration/r5/bit128-default-route/predecessor.json'));
      assert.ok(row.acceptedOperationEvidence.focusedTestClosure.some(item => item.path === 'tests/rust-bit128-default.test.ts'));
    }
    const reference = rows.get(`package-reference:${name}`);
    assert.equal(reference.sourceSelectedImplementation, null);
    assert.equal(reference.source, source);
  }
  assert.ok(ledger.rows.every(row => !Object.hasOwn(row, 'retired')));
});

test('PostgreSQL contract schemas have bounded authority and native AST has exact descriptor writer', () => {
  const output = execFileSync('node', ['scripts/rust-migration/r8/gap-ledger.mjs', '--stdout'], {
    cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024, encoding: 'utf8',
  });
  const current = JSON.parse(output);
  const authored = new Map([
    ['spec/extensions/postgresql/schema.json', { id: 'urn:umf:postgresql:0.1.0', clauses: ['US-015-AC1', 'US-015-AC3'] }],
    ['spec/extensions/postgresql-catalog/schema.json', { id: 'urn:umf:postgresql-catalog:0.1.0', clauses: ['US-015-AC6'] }],
    ['spec/extensions/postgresql-catalog/capture.schema.json', { id: 'urn:umf:postgresql-catalog:capture:0.1.0', clauses: ['US-015-AC6'] }],
  ]);
  const contract = 'docs/helix/02-design/contracts/CONTRACT-015-postgresql.md';
  const story = 'docs/helix/01-frame/user-stories/US-015-postgresql.md';
  assert.deepEqual(
    JSON.parse(readFileSync('spec/extensions/postgresql-catalog/package.json', 'utf8')).schema,
    JSON.parse(readFileSync('spec/extensions/postgresql-catalog/schema.json', 'utf8')),
    'catalog package manifest copy must match the canonical authored representation schema',
  );
  for (const [source, expectation] of authored) {
    const row = current.rows.find(item => item.source === source && item.routeId === 'package-root-node');
    assert.ok(row, `missing resource row ${source}`);
    const authority = row.resourceOwnership.authority;
    assert.equal(authority.status, 'authored-authority-known', source);
    assert.equal(authority.kind, 'authored-normative-contract-schema', source);
    assert.equal(authority.generator, null, source);
    assert.deepEqual(authority.governingArtifacts, [contract, story], source);
    assert.deepEqual(authority.governingClauses, expectation.clauses, source);
    assert.equal(JSON.parse(readFileSync(source, 'utf8')).$id, expectation.id, source);
    for (const file of [contract, story, 'src/index.ts', 'scripts/build.ts',
      'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py']) {
      assert.ok(authority.sourceClosure.some(item => item.path === file && /^[a-f0-9]{64}$/.test(item.sha256)), `${source} closure omits ${file}`);
    }
    assert.ok(row.resourceOwnership.routes.some(route => route.id === 'sdk-archive'
      && route.installedQualification.status === 'not-installed-qualified'));
  }
  const nativePath = 'spec/extensions/postgresql/native-ast.schema.json';
  const native = current.rows.find(item => item.source === nativePath && item.routeId === 'package-root-node');
  assert.ok(native);
  const authority = native.resourceOwnership.authority;
  assert.equal(authority.status, 'generated-authority-known');
  assert.equal(authority.kind, 'generated-from-pinned-postgresql-protobuf-descriptor');
  assert.equal(authority.generator.entrypoints[0], 'scripts/postgresql-schema.ts');
  assert.deepEqual(authority.generatorInputs, ['native/postgresql/protobuf/pg_query.proto',
    'native/postgresql/protobuf/manifest.json', 'package.json', 'bun.lock']);
  assert.deepEqual(authority.governingArtifacts, [contract, story]);
  assert.deepEqual(authority.governingClauses, ['US-015-AC1', 'US-015-AC3', 'US-015-AC4']);
  for (const file of [contract, story, 'scripts/postgresql-schema.ts',
    'native/postgresql/protobuf/pg_query.proto', 'native/postgresql/protobuf/manifest.json',
    'native/postgresql/protobuf/schema-evidence.json', 'package.json', 'bun.lock',
    'src/adapters/postgresql/index.ts', 'tests/postgresql/edit-preservation.test.ts',
    'src/index.ts', 'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py']) {
    assert.ok(authority.sourceClosure.some(item => item.path === file && /^[a-f0-9]{64}$/.test(item.sha256)), `native AST closure omits ${file}`);
  }
  assert.equal(JSON.parse(readFileSync(nativePath, 'utf8')).$id, 'urn:umf:postgresql:native-ast:0.1.0');
  assert.ok(native.resourceOwnership.routes.some(route => route.id === 'sdk-archive'
    && route.installedQualification.status === 'not-installed-qualified'));
});

test('TypeSpec result and projection schemas pin CONTRACT-013 authoring and exact consumers', () => {
  const output = execFileSync('node', ['scripts/rust-migration/r8/gap-ledger.mjs', '--stdout'], {
    cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024, encoding: 'utf8',
  });
  const current = JSON.parse(output);
  const contract = 'docs/helix/02-design/contracts/CONTRACT-013-typespec.md';
  const story = 'docs/helix/01-frame/user-stories/US-013-typespec.md';
  const expected = new Map([
    ['spec/extensions/typespec/syntax-locations.schema.json', {
      id: 'urn:umf:typespec:syntax-locations:0.1.0', clauses: ['US-013-AC1'],
      consumers: ['src/adapters/typespec/index.ts', 'tests/typespec/native.test.ts'],
    }],
    ['spec/extensions/typespec/compiler-report.schema.json', {
      id: 'urn:umf:typespec:compiler-report:0.1.0', clauses: ['US-013-AC1'],
      consumers: ['src/adapters/typespec/compiler.ts', 'tests/typespec/native.test.ts'],
    }],
    ['spec/extensions/typespec/semantic-graph.schema.json', {
      id: 'urn:umf:typespec:semantic-graph:0.1.0', clauses: ['US-013-AC5', 'US-013-AC6'],
      consumers: ['src/adapters/typespec/semantic.ts', 'tests/typespec/semantic.test.ts'],
    }],
    ['spec/extensions/typespec/json-schema-emission.schema.json', {
      id: 'urn:umf:typespec:json-schema-emission:0.1.0', clauses: ['US-013-AC12', 'US-013-AC13'],
      consumers: ['src/adapters/typespec/emission.ts', 'tests/typespec/emission.test.ts'],
    }],
    ['spec/projections/typespec-json-schema.schema.json', {
      id: 'urn:umf:projection:typespec-json-schema:0.1.0', clauses: ['US-013-AC15', 'US-013-AC16'],
      consumers: ['src/projections/typespec-json-schema.ts', 'tests/typespec/projection.test.ts'],
    }],
  ]);
  for (const [source, expectation] of expected) {
    const row = current.rows.find(item => item.source === source && item.routeId === 'package-root-node');
    assert.ok(row, `missing resource row ${source}`);
    const authority = row.resourceOwnership.authority;
    assert.equal(authority.status, 'authored-authority-known', source);
    assert.equal(authority.kind, 'authored-normative-contract-schema', source);
    assert.equal(authority.generator, null, source);
    assert.deepEqual(authority.governingArtifacts, [contract, story], source);
    assert.deepEqual(authority.governingClauses, expectation.clauses, source);
    assert.equal(JSON.parse(readFileSync(source, 'utf8')).$id, expectation.id, source);
    for (const file of [contract, story, ...expectation.consumers, 'src/index.ts',
      'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py']) {
      assert.ok(authority.sourceClosure.some(item => item.path === file && /^[a-f0-9]{64}$/.test(item.sha256)), `${source} closure omits ${file}`);
    }
    assert.ok(row.resourceOwnership.routes.some(route => route.id === 'sdk-archive'
      && route.installedQualification.status === 'not-installed-qualified'));
  }
});

test('three named projection contracts pin authored result schemas and consumers', () => {
  const output = execFileSync('node', ['scripts/rust-migration/r8/gap-ledger.mjs', '--stdout'], {
    cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024, encoding: 'utf8',
  });
  const current = JSON.parse(output);
  const expected = new Map([
    ['spec/projections/avro-json-schema.schema.json', {
      id: 'urn:umf:projection:avro-json-schema:0.1.0',
      contract: 'docs/helix/02-design/contracts/CONTRACT-008-avro-document-projection.md',
      story: 'docs/helix/01-frame/user-stories/US-008-avro-document-projection.md',
      clauses: ['US-008-AC1', 'US-008-AC2'],
      consumer: 'src/projections/avro-json-schema.ts', test: 'tests/avro/projection.test.ts',
    }],
    ['spec/projections/graphql-input-json-schema.schema.json', {
      id: 'urn:umf:projection:graphql-input-json-schema:0.1.0',
      contract: 'docs/helix/02-design/contracts/CONTRACT-010-graphql-input-projection.md',
      story: 'docs/helix/01-frame/user-stories/US-010-graphql-input-projection.md',
      clauses: ['US-010-AC1', 'US-010-AC2', 'US-010-AC3'],
      consumer: 'src/projections/graphql-input-json-schema.ts', test: 'tests/graphql/projection.test.ts',
    }],
    ['spec/projections/json-schema-protobuf.schema.json', {
      id: 'urn:umf:projection:json-schema-protobuf:0.1.0',
      contract: 'docs/helix/02-design/contracts/CONTRACT-004-json-schema-protobuf-projection.md',
      story: 'docs/helix/01-frame/user-stories/US-004-json-schema-protobuf-projection.md',
      clauses: ['US-004-AC1', 'US-004-AC2', 'US-004-AC4'],
      consumer: 'src/projections/json-schema-protobuf.ts', test: 'tests/projections/json-schema-protobuf.test.ts',
    }],
  ]);
  for (const [source, expectation] of expected) {
    const row = current.rows.find(item => item.source === source && item.routeId === 'package-root-node');
    assert.ok(row, `missing resource row ${source}`);
    const authority = row.resourceOwnership.authority;
    assert.equal(authority.status, 'authored-authority-known', source);
    assert.equal(authority.kind, 'authored-normative-contract-schema', source);
    assert.equal(authority.generator, null, source);
    assert.deepEqual(authority.governingArtifacts, [expectation.contract, expectation.story], source);
    assert.deepEqual(authority.governingClauses, expectation.clauses, source);
    assert.equal(JSON.parse(readFileSync(source, 'utf8')).$id, expectation.id, source);
    for (const file of [expectation.contract, expectation.story, expectation.consumer,
      expectation.test, 'src/index.ts', 'scripts/build.ts',
      'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py']) {
      assert.ok(authority.sourceClosure.some(item => item.path === file && /^[a-f0-9]{64}$/.test(item.sha256)), `${source} closure omits ${file}`);
    }
    assert.ok(row.resourceOwnership.routes.some(route => route.id === 'sdk-archive'
      && route.installedQualification.status === 'not-installed-qualified'));
  }
});

test('three named DDD, Bit128 and PostgreSQL projection schemas pin correct authority and consumer paths', () => {
  const output = execFileSync('node', ['scripts/rust-migration/r8/gap-ledger.mjs', '--stdout'], {
    cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024, encoding: 'utf8',
  });
  const current = JSON.parse(output);
  const expected = new Map([
    ['spec/projections/ddd-json-schema.schema.json', {
      id: 'urn:umf:projection:ddd-json-schema:0.1.0',
      governing: ['docs/helix/02-design/contracts/CONTRACT-006-ddd-document-projection.md',
        'docs/helix/01-frame/user-stories/US-006-ddd-document-projection.md'],
      clauses: ['US-006-AC1', 'US-006-AC3'],
      runtime: 'src/projections/ddd-json-schema.ts', test: 'tests/projections/ddd-json-schema.test.ts',
      runtimeImports: false, testEvidence: "from '../../spec/projections/ddd-json-schema.schema.json'",
    }],
    ['spec/projections/bit128-model.schema.json', {
      id: 'urn:umf:projection:bit128-model:1.0.0',
      governing: ['docs/helix/02-design/contracts/CONTRACT-076-128-bit-uuid.md',
        'docs/helix/02-design/solution-designs/SD-005-128-bit-uuid.md'],
      clauses: ['CONTRACT-076 § Model composition profile — uuid-model1'],
      runtime: 'src/projections/bit128-model.ts', test: 'tests/uuid-model.test.ts',
      runtimeImports: true, testEvidence: 'projectBit128Model',
    }],
    ['spec/projections/postgresql-row-json-schema.schema.json', {
      id: 'urn:umf:projection:postgresql-row-json-schema:0.1.0',
      governing: ['docs/helix/02-design/contracts/CONTRACT-015-postgresql.md',
        'docs/helix/01-frame/user-stories/US-015-postgresql.md'],
      clauses: ['US-015-AC9'],
      runtime: 'src/projections/postgresql-json-schema.ts', test: 'tests/postgresql/projection.test.ts',
      runtimeImports: false, testEvidence: 'postgresqlRowProjectionSchema',
    }],
  ]);
  for (const [source, expectation] of expected) {
    const row = current.rows.find(item => item.source === source && item.routeId === 'package-root-node');
    assert.ok(row, `missing resource row ${source}`);
    const authority = row.resourceOwnership.authority;
    assert.equal(authority.status, 'authored-authority-known', source);
    assert.equal(authority.kind, 'authored-normative-contract-schema', source);
    assert.equal(authority.generator, null, source);
    assert.deepEqual(authority.governingArtifacts, expectation.governing, source);
    assert.deepEqual(authority.governingClauses, expectation.clauses, source);
    assert.equal(JSON.parse(readFileSync(source, 'utf8')).$id, expectation.id, source);
    const runtimeText = readFileSync(expectation.runtime, 'utf8');
    assert.equal(runtimeText.includes(source.replace('spec/', '../../spec/')), expectation.runtimeImports, `${source} direct runtime import`);
    const testText = readFileSync(expectation.test, 'utf8');
    assert.ok(testText.includes(expectation.testEvidence), `${source} test evidence reference`);
    for (const file of [...expectation.governing, expectation.runtime, expectation.test,
      'src/index.ts', 'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py']) {
      assert.ok(authority.sourceClosure.some(item => item.path === file && /^[a-f0-9]{64}$/.test(item.sha256)), `${source} closure omits ${file}`);
    }
    assert.ok(row.resourceOwnership.routes.some(route => route.id === 'sdk-archive'
      && route.installedQualification.status === 'not-installed-qualified'));
  }
  assert.match(readFileSync('src/index.ts', 'utf8'), /dddJsonSchemaProjectionSchema.*ddd-json-schema\.schema\.json/);
  assert.match(readFileSync('src/index.ts', 'utf8'), /bit128ModelProjectionSchema.*bit128-model\.schema\.json/);
  assert.match(readFileSync('src/index.ts', 'utf8'), /postgresqlRowProjectionSchema.*postgresql-row-json-schema\.schema\.json/);
});

test('Delta datatype and table-context schemas pin exact writers and isolated full-output bytes', async t => {
  const ledger = JSON.parse(execFileSync('node', ['scripts/rust-migration/r8/gap-ledger.mjs', '--stdout'], {
    cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024, encoding: 'utf8',
  }));
  const expected = new Map([
    ['spec/extensions/delta/datatype-schema.json', {
      id: 'urn:umf:delta:schema-json:0.1.0', generator: 'scripts/delta-schema.ts', clause: 'US-018-AC1',
      outputs: ['spec/extensions/delta/datatype-schema.json', 'spec/extensions/delta/schema.json', 'spec/extensions/delta/package.json'],
      consumer: 'src/adapters/delta/index.ts', test: 'tests/delta/schema.test.ts',
    }],
    ['spec/extensions/delta-table/context-schema.json', {
      id: 'urn:umf:delta:table-context:0.1.0', generator: 'scripts/delta-table-schema.ts', clause: 'US-018-AC4',
      outputs: ['spec/extensions/delta-table/context-schema.json', 'spec/extensions/delta-table/schema.json', 'spec/extensions/delta-table/package.json'],
      consumer: 'src/adapters/delta/table.ts', test: 'tests/delta/table.test.ts',
    }],
  ]);
  const index = readFileSync('src/index.ts', 'utf8');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'umf-r8-delta-schema-writers-'));
  try {
    for (const [resource, details] of expected) {
      const row = ledger.rows.find(item => item.source === resource && item.routeId === 'package-root-node');
      assert.ok(row, `missing resource row ${resource}`);
      const authority = row.resourceOwnership.authority;
      assert.equal(authority.status, 'generated-authority-known', resource);
      assert.equal(authority.kind, 'generated-from-contract-governed-delta-profile-writer', resource);
      assert.deepEqual(authority.governingArtifacts, ['docs/helix/02-design/contracts/CONTRACT-018-delta.md',
        'docs/helix/01-frame/user-stories/US-018-delta-schema.md']);
      assert.deepEqual(authority.governingClauses, [details.clause]);
      assert.deepEqual(authority.generator.entrypoints, [details.generator]);
      assert.deepEqual(authority.generatorInputs, ['src/model/types.ts', 'spec/core/native-json.schema.json']);
      const closure = new Map(authority.sourceClosure.map(item => [item.path, item.sha256]));
      for (const file of [...authority.governingArtifacts, details.generator, ...authority.generatorInputs,
        'src/generated/core-model.ts', 'src/model/errors.ts', 'spec/core/schema.json',
        'spec/core/semantic-type-reference.schema.json', 'spec/core/extension-package.schema.json',
        'spec/metamodel/generated/core-constraints.json', 'spec/metamodel/generated/domain-policy.json',
        'src/index.ts', details.consumer, details.test, 'scripts/build.ts',
        'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py',
        ...details.outputs.filter(output => output !== resource)]) {
        assert.match(closure.get(file) ?? '', /^[a-f0-9]{64}$/, `${resource} closure omits ${file}`);
      }
      assert.equal(JSON.parse(readFileSync(resource, 'utf8')).$id, details.id);
      assert.ok(index.includes(`../${resource}`), `${resource} is not re-exported from src/index.ts`);
      assert.ok(row.resourceOwnership.routes.some(route => route.id === 'sdk-archive'
        && route.artifactPath === `package/dist/spec/${resource.slice('spec/'.length)}`
        && route.installedQualification.status === 'not-installed-qualified'));
    }

    for (const [resource, details] of expected) {
      for (const source of [details.generator, 'src/model/types.ts', 'src/model/errors.ts',
        'src/generated/core-model.ts', 'spec/core/schema.json', 'spec/core/semantic-type-reference.schema.json',
        'spec/core/extension-package.schema.json', 'spec/metamodel/generated/core-constraints.json',
        'spec/metamodel/generated/domain-policy.json', 'spec/core/native-json.schema.json']) {
        const destination = path.join(directory, source);
        await mkdir(path.dirname(destination), { recursive: true });
        await cp(source, destination);
      }
      execFileSync('bun', [details.generator], { cwd: directory, stdio: 'pipe' });
      for (const output of details.outputs) {
        assert.deepEqual(await readFile(path.join(directory, output)), readFileSync(output),
          `${details.generator} isolated full-output mismatch for ${output}`);
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  assert.equal(ledger.counts.resourceAuthorityByStatus['generated-authority-known'], 56);
});

test('Python source census walks nested package modules', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'umf-r8-python-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, 'nested'), { recursive: true });
  await writeFile(path.join(directory, '__init__.py'), '');
  await writeFile(path.join(directory, 'nested', 'api.py'), 'def nested_api(): pass\n');
  await writeFile(path.join(directory, 'nested', 'package.json'), '{"resource":true}\n');
  await writeFile(path.join(directory, '_native.so'), 'ignored build artifact');
  const files = collectPythonSourceFiles(directory, 'pkg');
  assert.deepEqual(files.map(file => file.path), ['pkg/__init__.py', 'pkg/nested/api.py']);
  assert.equal(files[1].bytes.toString('utf8'), await readFile(path.join(directory, 'nested', 'api.py'), 'utf8'));
  const assets = collectPythonPackageAssets(directory, 'pkg', new Set(['pkg/nested/package.json']));
  assert.deepEqual(assets.map(file => file.path), ['pkg/nested/package.json']);
});
