import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const analysisPath = 'docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/package-reference-variable-analysis.json';
const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
const hash = path => crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');

test('AST inventory classifies every package-reference variable declaration by initializer and resolved authority', () => {
  assert.equal(analysis.method, 'TypeScript compiler AST declarations resolved through the package-reference entry; no name/regex-based initializer inference.');
  assert.equal(analysis.packageReferenceVariableDeclarationCount, 167);
  assert.deepEqual(analysis.initializerClasses, {
    'alias-or-property-read': 69,
    'dynamic-executable': 4,
    'frozen-data-expression': 2,
    'function-valued': 13,
    'static-literal-data': 79,
  });
  assert.deepEqual(analysis.authorityClasses, {
    'authored-json-data-alias': 2,
    'authored-package-descriptor-alias': 64,
    'authored-static-data': 78,
    'dynamic-executable': 4,
    'frozen-authored-data-expression': 1,
    'function-valued': 13,
    'generated-data-alias': 3,
    'generated-frozen-data-alias': 1,
    'generated-source-declaration': 1,
  });
  assert.equal(analysis.symbols.length, 167);
  assert.equal(analysis.symbols.filter(row => row.initializerClass === 'function-valued').length, 13);
  assert.equal(analysis.symbols.filter(row => row.authorityClass === 'authored-package-descriptor-alias').every(row => row.resolvedInitializerDeclarations.some(target => target.path.endsWith('/package.json'))), true);
  assert.equal(analysis.symbols.filter(row => row.authorityClass === 'dynamic-executable').every(row => row.initializerClass === 'dynamic-executable'), true);
});

test('the only generated-source variable is a runtime-consumed version constant, not inert-only data', () => {
  assert.equal(analysis.generatedVariableDeclarationCount, 1);
  assert.deepEqual(analysis.generatedVariableDeclarations.map(row => [row.source, row.exportName, row.initializerClass]), [
    ['src/generated/core-model.ts', 'CURRENT_CORE_VERSION', 'static-literal-data'],
  ]);
  const generatedBackedRows = analysis.symbols.filter(row => ['generated-source-declaration', 'generated-data-alias', 'generated-frozen-data-alias'].includes(row.authorityClass)).map(row => row.exportName).sort();
  assert.deepEqual(generatedBackedRows, ['CARDINALITIES', 'CURRENT_CORE_VERSION', 'ELEMENT_KINDS', 'NULLABILITIES', 'SCALAR_TYPES']);
  const versionGate = analysis.symbols.find(row => row.exportName === 'scalarTypesForVersion');
  assert.equal(versionGate.initializerClass, 'function-valued');
  assert.equal(versionGate.authorityClass, 'function-valued');
  assert.equal(analysis.generatedCoreModel.disposition, 'generated semantic constant; compile-time generated data with runtime version-gating consumers, not inert-only data');
  assert.equal(analysis.generatedCoreModel.sourceSha256, hash('src/generated/core-model.ts'));
  assert.equal(analysis.generatedCoreModel.metamodelSha256, '42144576e3b15da4945ca744623a31967e3b29efa54da8ba3961e446b1c0e34b');
  const manifest = JSON.parse(fs.readFileSync('spec/metamodel/generated/manifest.json', 'utf8'));
  assert.equal(analysis.generatedCoreModel.currentOutputMatchesCapturedManifest, true);
  assert.equal(analysis.generatedCoreModel.currentWriterMatchesCapturedManifest, true);
  assert.equal(analysis.generatedCoreModel.capturedSourceFileCount, 460);
  assert.equal(analysis.generatedCoreModel.generatedOutputFreshness, 'captured-output-matches-manifest; current full source closure unverified');
  assert.equal(manifest.outputs['src/generated/core-model.ts'].sha256, analysis.generatedCoreModel.sourceSha256);
  assert.equal(manifest.sources['spec/metamodel/umf.yaml'], analysis.generatedCoreModel.metamodelSha256);
  for (const consumer of analysis.generatedCoreModel.currentCoreVersionConsumers) assert.equal(fs.existsSync(consumer), true);
});

test('analysis is reproducible and does not mutate retirement or default-route counts', () => {
  const result = spawnSync(process.execPath, ['scripts/rust-migration/r8/package-reference-variable-analysis.mjs', '--check'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(analysis.limitations.some(text => text.includes('No ledger status, logical retirement gap, or default-route claim is changed')), true);
  assert.equal(JSON.parse(fs.readFileSync('docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/gap-ledger.json', 'utf8')).counts.executableDefaultRouteGaps, 922);
});
