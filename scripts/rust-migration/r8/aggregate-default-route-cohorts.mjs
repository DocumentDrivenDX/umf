// SPDX-License-Identifier: MIT OR Apache-2.0
// Join two independently captured installed SDK cohorts and run the exact-row gate.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { validateBoundedDefaultRouteEvidence } from './default-route-retirement-evidence.mjs';

const root = process.cwd();
const matrixRoot = resolve(process.argv[2] ?? '');
if (!process.argv[2] || relative(root, matrixRoot).startsWith('..')) {
  throw new Error('Usage: node aggregate-default-route-cohorts.mjs <repository-local matrix directory>');
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const repoPath = absolute => {
  const value = relative(root, absolute).replaceAll('\\', '/');
  if (!value || value.startsWith('..')) throw new Error(`Evidence path leaves repository: ${absolute}`);
  return value;
};
const pin = async file => ({ path: repoPath(file), sha256: sha(await readFile(file)) });
const expected = {
  'darwin-arm64': { os: 'darwin', arch: 'aarch64', nodeArch: 'arm64', nativeTarget: 'aarch64-apple-darwin' },
  'linux-x86_64': { os: 'linux', arch: 'x86_64', nodeArch: 'x64', nativeTarget: 'x86_64-unknown-linux-gnu' },
};
const cohortIds = Object.keys(expected);
const cohorts = [];
const captures = new Map();
for (const id of cohortIds) {
  const base = join(matrixRoot, id);
  const capture = join(base, 'retirement-cohort');
  const summary = JSON.parse(await readFile(join(capture, 'cohort.json'), 'utf8'));
  assert.equal(summary.format, 'umf.r8.default-route-retirement-cohort/1');
  assert.equal(summary.status, 'pass');
  assert.equal(summary.cohortId, id);
  for (const [key, value] of Object.entries(expected[id])) assert.equal(summary.platform?.[key], value);
  const archive = await pin(join(base, 'umf-sdk.tgz'));
  assert.equal(archive.sha256, summary.archiveSha256, `${id} archive digest`);
  const memberManifest = await pin(join(capture, 'archive-members.json'));
  const archivePackageManifest = await pin(join(capture, 'archive-package.json'));
  const liveSourceManifest = await pin(join(capture, 'archive-source-cohort.json'));
  assert.equal(memberManifest.sha256, summary.memberManifestSha256, `${id} member manifest`);
  assert.equal(archivePackageManifest.sha256, summary.packageManifestSha256, `${id} package manifest`);
  assert.equal(liveSourceManifest.sha256, summary.liveSourceManifestSha256, `${id} source manifest`);
  cohorts.push({
    id, platform: expected[id],
    archive: { ...archive, sourceClosureSha256: summary.sourceClosureSha256, sourceInputCount: summary.sourceInputCount,
      generatedTransformCount: 0, packageManifestSha256: summary.packageManifestSha256 },
    memberManifest, archivePackageManifest,
  });
  captures.set(id, { capture, summary, liveSourceManifest });
}
assert.equal(captures.get(cohortIds[0]).summary.sourceClosureSha256, captures.get(cohortIds[1]).summary.sourceClosureSha256, 'cohort source closures differ');
assert.equal(captures.get(cohortIds[0]).liveSourceManifest.sha256, captures.get(cohortIds[1]).liveSourceManifest.sha256, 'cohort live-source manifests differ');
const ledgerBytes = await readFile('docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/gap-ledger.json');
const ledger = JSON.parse(ledgerBytes.toString('utf8'));
const metadata = [
  ['inspectCoreRelationships', 'CONTRACT-041', 'docs/helix/02-design/contracts/CONTRACT-041-relationship.md', 'r8-relationships-default-retirement-replay'],
  ['lookupCoreRelationship', 'CONTRACT-041', 'docs/helix/02-design/contracts/CONTRACT-041-relationship.md', 'r8-relationships-default-retirement-replay'],
  ['declareCoreRelationship', 'CONTRACT-041', 'docs/helix/02-design/contracts/CONTRACT-041-relationship.md', 'r8-relationships-default-retirement-replay'],
  ['verifyCoreRelationshipOperation', 'CONTRACT-041', 'docs/helix/02-design/contracts/CONTRACT-041-relationship.md', 'r8-relationships-default-retirement-replay'],
  ['inspectCoreScalarType', 'CONTRACT-040', 'docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md', 'r8-inspectors-default-retirement-replay'],
  ['inspectCoreRecordMembers', 'CONTRACT-040', 'docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md', 'r8-inspectors-default-retirement-replay'],
  ['inspectCoreReferenceLinks', 'CONTRACT-040', 'docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md', 'r8-inspectors-default-retirement-replay'],
  ['validateCsvBooleanLexical', 'CONTRACT-053', 'docs/helix/02-design/contracts/CONTRACT-053-domain-pack-profiles.md', 'r8-csv-boolean-default-retirement-replay'],
  ['verifyCsvBooleanLexical', 'CONTRACT-053', 'docs/helix/02-design/contracts/CONTRACT-053-domain-pack-profiles.md', 'r8-csv-boolean-default-retirement-replay'],
];
const operations = [];
for (const [exportName, contractId, contractPath, packetDir] of metadata) {
  const rows = ledger.rows.filter(row => row.exportName === exportName && ['package-root-node', 'package-root-browser'].includes(row.routeId));
  assert.equal(rows.length, 2, `${exportName} default row count`);
  assert.equal(rows[0].logicalDeclarationKey, rows[1].logicalDeclarationKey, `${exportName} logical identity`);
  const rustOwner = rows[0].sourceSelectedImplementation?.rustOwner;
  assert(rustOwner && rows.every(row => row.acceptedRustOperation === rustOwner && row.sourceSelectedImplementation?.rustOwner === rustOwner), `${exportName} accepted owner`);
  const contract = { id: contractId, ...await pin(resolve(contractPath)) };
  const packet = await pin(resolve('docs/helix/04-build/evidence/rust-migration', packetDir, `${exportName}.packet.json`));
  const receiptCohorts = [];
  for (const id of cohortIds) {
    const { capture, summary } = captures.get(id);
    const receipts = [];
    for (const runtime of ['node', 'bun', 'chromium']) {
      const receipt = await pin(join(capture, 'receipts', `${exportName}-${runtime}.json`));
      assert.equal(receipt.sha256, summary.receipts?.[exportName]?.[runtime], `${id}/${exportName}/${runtime} receipt digest`);
      receipts.push({ runtime, ...receipt });
    }
    receiptCohorts.push({ cohortId: id, receipts });
  }
  operations.push({ exportName, logicalDeclarationKey: rows[0].logicalDeclarationKey, contract, rustOwner,
    rows: rows.map(({ routeId, logicalDeclarationKey, exportName, source, sourceSha256, declarationKind }) =>
      ({ routeId, logicalDeclarationKey, exportName, source, sourceSha256, declarationKind })), packet, receiptCohorts });
}
const manifest = {
  format: 'umf.r8.default-route-retirement-evidence/2', status: 'pass',
  liveSourceManifest: captures.get(cohortIds[0]).liveSourceManifest,
  cohorts, operations,
};
const output = join(matrixRoot, 'default-route-retirement-manifest.json');
await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
const routePairs = validateBoundedDefaultRouteEvidence(manifest, ledger.rows, { root });
assert.equal(routePairs.size, operations.length * 2, 'bounded matrix route pair count');
for (const operation of operations) {
  for (const row of operation.rows) {
    const current = ledger.rows.find(candidate => candidate.routeId === row.routeId && candidate.logicalDeclarationKey === row.logicalDeclarationKey);
    assert.equal(current?.defaultRouteRetirement?.status, 'open', `${operation.exportName}/${row.routeId} was promoted before contract acceptance coverage`);
    assert.equal(routePairs.get(`${row.routeId}\0${row.logicalDeclarationKey}`)?.status, 'bounded', `${operation.exportName}/${row.routeId} did not pass the bounded matrix`);
  }
}
const bounded = {
  format: 'umf.r8.default-route-bounded-matrix/1', status: 'pass',
  scope: 'exact frozen packets and default/reference route dispatch on two archive cohorts; contract acceptance coverage remains open',
  sourceClosureSha256: cohorts[0].archive.sourceClosureSha256,
  cohortIds, operations: operations.map(item => item.exportName),
  passingRoutePairs: routePairs.size, retiredRows: 0,
  remainingLogicalGaps: ledger.counts.executableDefaultRouteGaps,
  manifest: await pin(output), ledger: { path: 'docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/gap-ledger.json', sha256: sha(ledgerBytes) },
};
await writeFile(join(matrixRoot, 'bounded-route-evidence.json'), `${JSON.stringify(bounded, null, 2)}\n`);
console.log(JSON.stringify(bounded));
