// SPDX-License-Identifier: MIT OR Apache-2.0
// Source-coherent installed qualification for the selected nine core exports.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cp, mkdir, readFile, mkdtemp, rm} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

const repo = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const [archiveArg, expectedClosure, outputArg] = process.argv.slice(2);
if (!archiveArg || !/^[a-f0-9]{64}$/.test(expectedClosure ?? '') || !outputArg) {
  throw new Error('Usage: bun scripts/rust-migration/r8/core-nine-default-retirement.mjs <fixed-point-sdk.tgz> <source-closure-sha256> <receipt-directory>');
}
const archive = resolve(archiveArg), output = resolve(outputArg);
let archiveSha256 = '';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const tmp = await mkdtemp(join(tmpdir(), 'umf-r8-core-nine-'));
const packageRoot = join(tmp, 'package');
const receiptRoot = join(tmp, 'receipts');
const run = async (command, args, env = {}) => {
  const proc = Bun.spawn([command, ...args], {cwd: repo, env: {...process.env, ...env}, stdout: 'pipe', stderr: 'pipe'});
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  const code = await proc.exited;
  if (code !== 0) throw new Error(`${command} ${args.join(' ')} failed (${code})\n${stdout}\n${stderr}`);
  return {stdout: stdout.trim(), stderr: stderr.trim()};
};
const hostEnv = prefix => ({
  [`${prefix}_ARCHIVE_ROOT`]: packageRoot,
  [`${prefix}_RECEIPT_DIR`]: receiptRoot,
  [`${prefix}_ARCHIVE_SHA256`]: archiveSha256,
  [`${prefix}_SOURCE_CLOSURE_SHA256`]: expectedClosure,
});

let succeeded = false;
try {
  await mkdir(packageRoot, {recursive: true});
  await mkdir(receiptRoot, {recursive: true});
  const archiveBytes = await readFile(archive);
  archiveSha256 = sha(archiveBytes);
  const extracted = await run('tar', ['-xzf', archive, '--strip-components=1', '-C', packageRoot]);
  const archiveManifestBytes = await readFile(join(packageRoot, 'manifest.json'));
  const archiveManifest = JSON.parse(archiveManifestBytes);
  const sdkManifest = JSON.parse(await readFile(join(packageRoot, 'dist/rust-default-manifest.json'), 'utf8'));
  assert.equal(archiveManifest.profile, 'umf.sdk.distribution.rust-default/1');
  assert.equal(archiveManifest.sourceTransformStatus, 'fixed-point');
  assert.equal(archiveManifest.sourceTreeSha256, expectedClosure, 'archive source closure pin');
  assert.equal(sdkManifest.sourceClosure.sha256, expectedClosure, 'SDK source closure pin');
  assert.equal(archiveManifest.capturedLiveSourceTreeSha256, expectedClosure, 'captured live source closure pin');
  assert.equal(sdkManifest.sourceClosure.capturedLiveSha256, expectedClosure, 'SDK captured live source closure pin');
  const liveInputs = sdkManifest.sourceClosure.liveInputs;
  const sourceHash = createHash('sha256');
  for (const [relativePath, expected] of Object.entries(liveInputs).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    const bytes = await readFile(join(repo, relativePath));
    assert.equal(sha(bytes), expected, `current source input ${relativePath}`);
    sourceHash.update(relativePath); sourceHash.update('\0'); sourceHash.update(bytes); sourceHash.update('\0');
  }
  assert.equal(sourceHash.digest('hex'), expectedClosure, 'current full source closure');
  const externalInputs = sdkManifest.sourceClosure.externalInputs ?? {};
  for (const [relativePath, expected] of Object.entries(externalInputs)) {
    assert.equal(sha(await readFile(join(repo, relativePath))), expected, `external build dependency ${relativePath}`);
  }

  // Verify every packaged asset, including native/WASM bindings and transitive
  // package files, before the operation-specific replays load the installation.
  const members = Object.entries(archiveManifest.sha256);
  for (const [member, expected] of members) {
    assert.equal(sha(await readFile(join(packageRoot, member))), expected, `package member ${member}`);
  }

  const evidence = 'docs/helix/04-build/evidence/rust-migration';
  const schemaReceipt = join(receiptRoot, 'schema-properties.json');
  await run('bun', ['scripts/rust-migration/r8/schema-properties-installed.mjs', archive, expectedClosure, schemaReceipt]);

  for (const [label, prefix, replay] of [
    ['inspectors', 'UMF_R8_INSPECTOR', 'inspectors-default-retirement-replay-node.mjs'],
    ['csv-boolean', 'UMF_R8_CSV', 'csv-boolean-default-retirement-replay-node.mjs'],
  ]) {
    const env = hostEnv(prefix);
    const base = `scripts/rust-migration/r8/${replay}`;
    await run('node', [base], env);
    await run('bun', [base], env);
    const browserReplay = label === 'inspectors'
      ? 'inspectors-default-retirement-replay-browser.mjs'
      : 'csv-boolean-default-retirement-replay-browser.mjs';
    await run('bun', [`scripts/rust-migration/r8/${browserReplay}`], env);
  }

  const schemaBytes = await readFile(schemaReceipt);
  const schema = JSON.parse(schemaBytes);
  assert.equal(schema.status, 'pass');
  assert.equal(schema.archive.sha256, archiveSha256);
  assert.equal(schema.sourceClosure.sha256, expectedClosure);
  const operations = [
    ['inspectCoreSchemaProperties', 'schema-properties'],
    ['declareCoreSchemaProperties', 'schema-properties'],
    ['resolveCoreDefault', 'schema-properties'],
    ['validateCoreFieldValue', 'schema-properties'],
    ['inspectCoreRecordMembers', 'inspectors'],
    ['inspectCoreReferenceLinks', 'inspectors'],
    ['inspectCoreScalarType', 'inspectors'],
    ['validateCsvBooleanLexical', 'csv-boolean'],
    ['verifyCsvBooleanLexical', 'csv-boolean'],
  ];
  const hostReceipts = [];
  for (const [operation, family] of operations.slice(4)) {
    for (const runtime of ['node', 'bun', 'chromium']) {
      const path = join(receiptRoot, `${operation}-${runtime}.json`);
      const receiptBytes = await readFile(path);
      const receipt = JSON.parse(receiptBytes);
      assert.equal(receipt.status, 'pass', `${operation}/${runtime}`);
      assert.equal(receipt.archiveSha256, archiveSha256, `${operation}/${runtime} archive`);
      assert.equal(receipt.sourceClosureSha256, expectedClosure, `${operation}/${runtime} source closure`);
      hostReceipts.push({operation, family, runtime, caseCount: receipt.cases.length, receipt: `receipts/${operation}-${runtime}.json`, sha256: sha(receiptBytes)});
    }
  }
  const receipt = {
    format: 'umf.r8.core-nine-archive-candidate/1', status: 'pass',
    scope: 'source-pinned archive-extracted Node/Bun/Chromium candidate; dependency-resolved installed consumer and release qualification remain open',
    archive: {path: archive, sha256: archiveSha256, bytes: archiveBytes.length, manifestSha256: sha(archiveManifestBytes), verifiedMemberCount: members.length},
    sourceClosure: {sha256: expectedClosure, fileCount: sdkManifest.sourceClosure.fileCount, capturedLiveSha256: sdkManifest.sourceClosure.capturedLiveSha256, transform: sdkManifest.sourceClosure.transform},
    operations: operations.map(([name, family]) => ({name, family})),
    schemaProperties: {receipt: 'receipts/schema-properties.json', sha256: sha(schemaBytes), routeCount: 4, packetOutcomes: 83},
    installedReceipts: hostReceipts,
    replayCommands: {archiveExtraction: extracted.stdout, packageAssetCheck: 'all manifest.sha256 members verified before replay'},
    retirement: {eligibleNames: 0, reason: 'Archive replay is not a dependency-resolved installed-package receipt and does not itself edit or approve the R8 retirement ledger.'},
  };
  await mkdir(output, {recursive: true});
  await cp(receiptRoot, join(output, 'receipts'), {recursive: true});
  await Bun.write(join(output, 'installed-assets.json'), JSON.stringify({archiveSha256, members: Object.fromEntries(members)}, null, 2) + '\n');
  await Bun.write(join(output, 'source-and-dependency-inputs.json'), JSON.stringify({sourceClosureSha256: expectedClosure, sourceInputs: liveInputs, externalInputs}, null, 2) + '\n');
  await Bun.write(join(output, 'cohort.json'), JSON.stringify(receipt, null, 2) + '\n');
  succeeded = true;
  console.log(JSON.stringify({status: receipt.status, operations: operations.length, installedHostReceipts: hostReceipts.length, verifiedPackageMembers: members.length, archiveSha256, sourceClosureSha256: expectedClosure, output: join(output, 'cohort.json')}, null, 2));
} finally {
  await rm(tmp, {recursive: true, force: true});
}
if (!succeeded) process.exitCode = 1;
