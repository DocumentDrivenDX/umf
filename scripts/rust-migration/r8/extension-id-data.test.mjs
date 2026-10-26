import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../../..');
const evidence = path.join(root, 'docs/helix/04-build/evidence/rust-migration/r8-extension-id-data');
const receipt = JSON.parse(fs.readFileSync(path.join(evidence, 'receipt.json'), 'utf8'));
const hostMatrix = JSON.parse(fs.readFileSync(path.join(evidence, 'host-matrix.json'), 'utf8'));
const ledger = JSON.parse(fs.readFileSync(path.join(root, 'docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/gap-ledger.json'), 'utf8'));

test('AST receipt is current against all three route roots', () => {
  const result = spawnSync(process.execPath, [
    path.join(root, 'scripts/rust-migration/r8/extension-id-data-capture.mjs'), '--check',
  ], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /63 direct string exports/);
});

test('candidate data family preserves exact IDs and package multiplicity', () => {
  assert.equal(receipt.status, 'candidate-static-data; declarations and 922-gap ledger are unchanged');
  assert.equal(receipt.counts.exports, 63);
  assert.equal(receipt.counts.distinctStringIds, 63);
  assert.ok(receipt.symbols.every(symbol => symbol.packageIdentityStatus === 'exact-id-match'));
  const binding = receipt.symbols.find(symbol => symbol.exportName === 'BINDING_EXTENSION');
  const security = receipt.symbols.find(symbol => symbol.exportName === 'SECURITY_EXTENSION');
  assert.equal(binding.matchingPackageIds.length, 3);
  assert.equal(security.matchingPackageIds.length, 2);
  assert.equal(ledger.counts.executableDefaultRouteGaps, 922);
  const ledgerHash = createHash('sha256').update(fs.readFileSync(path.join(root, 'docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/gap-ledger.json'))).digest('hex');
  assert.equal(receipt.inputs.gapLedger.sha256, ledgerHash);
});

test('host matrix pins a fixed-point source tree matching the private dist manifest', () => {
  const manifestPath = path.join(root, 'dist/rust-default-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(hostMatrix.sourceFixedPoint.status, 'fixed-point');
  assert.equal(hostMatrix.sourceFixedPoint.sourceTransformCount, 0);
  assert.equal(hostMatrix.sourceFixedPoint.sourceTreeSha256, hostMatrix.sourceFixedPoint.capturedLiveSourceTreeSha256);
  assert.equal(hostMatrix.sourceFixedPoint.privateDist, path.join(root, 'dist'));
  assert.equal(hostMatrix.sourceFixedPoint.sourceTreeSha256, manifest.sourceClosure.sha256);
  assert.equal(hostMatrix.sourceFixedPoint.capturedLiveSourceTreeSha256, manifest.sourceClosure.capturedLiveSha256);
  assert.deepEqual(hostMatrix.hosts.map(host => host.status), ['pass', 'pass', 'pass']);
});

test('generated values, profiles, descriptors and executable roots are negative controls', () => {
  const candidates = new Set(receipt.symbols.map(symbol => symbol.exportName));
  for (const name of [
    'CURRENT_CORE_VERSION', 'ELEMENT_KINDS', 'CARDINALITIES', 'NULLABILITIES',
    'SCALAR_TYPES', 'scalarTypesForVersion', 'RFC3339_EXACT_INSTANT_PROFILE',
    'PARQUET_MAX_BYTES', 'actionsPackage', 'securityPackage', 'generatePythonClient',
  ]) assert.equal(candidates.has(name), false, `${name} must be excluded`);
  assert.ok(receipt.negativeControls.length >= 10);
});
