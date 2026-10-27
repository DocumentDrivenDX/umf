// SPDX-License-Identifier: MIT OR Apache-2.0
// Capture one installed SDK operation cohort for the two-platform retirement gate.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { tarMembers } from './default-route-retirement-evidence.mjs';

const root = process.cwd();
const archive = resolve(process.argv[2] ?? '');
const out = resolve(process.argv[3] ?? '');
if (!process.argv[2] || !process.argv[3] || relative(root, out).startsWith('..')) {
  throw new Error('Usage: node capture-default-route-cohort.mjs <SDK archive> <new repository-local output directory>');
}
const cohortId = process.platform === 'darwin' && process.arch === 'arm64' ? 'darwin-arm64'
  : process.platform === 'linux' && process.arch === 'x64' ? 'linux-x86_64' : null;
if (!cohortId) throw new Error(`Unsupported retirement cohort: ${process.platform}/${process.arch}`);
try { await stat(out); throw new Error(`Refusing to reuse cohort output directory: ${out}`); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const archiveBytes = await readFile(archive);
const archiveSha256 = sha(archiveBytes);
const { members, files } = tarMembers(archiveBytes);
const rustManifest = JSON.parse(files['dist/rust-default-manifest.json']?.toString('utf8') ?? 'null');
const source = rustManifest?.sourceClosure;
const platform = rustManifest?.platform;
const expectedPlatform = cohortId === 'darwin-arm64'
  ? { os: 'darwin', arch: 'aarch64', nodeArch: 'arm64', nativeTarget: 'aarch64-apple-darwin' }
  : { os: 'linux', arch: 'x86_64', nodeArch: 'x64', nativeTarget: 'x86_64-unknown-linux-gnu' };
for (const [key, value] of Object.entries(expectedPlatform)) {
  assert.equal(platform?.[key], value, `SDK archive platform.${key}`);
}
assert.equal(source?.sha256, source?.capturedLiveSha256, 'archive source was not captured live');
assert.equal(source?.transform?.status, 'fixed-point', 'archive source is not fixed-point');
assert.deepEqual(source?.transform?.generatedInputs, [], 'archive generated inputs changed');
assert.equal(Object.keys(source?.liveInputs ?? {}).length, source?.fileCount, 'archive live-source map is incomplete');
const packageBytes = files['package.json'];
assert(packageBytes, 'SDK archive omits package.json');
await mkdir(join(out, 'package'), { recursive: true });
for (const [name, bytes] of Object.entries(files)) {
  const target = join(out, 'package', name);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
}
await mkdir(join(out, 'receipts'), { recursive: true });
const writeJson = async (name, value) => {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  await writeFile(join(out, name), bytes);
  return sha(bytes);
};
const liveSourceManifestSha256 = await writeJson('archive-source-cohort.json', {
  sourceClosure: {
    sha256: source.sha256,
    capturedLiveSha256: source.capturedLiveSha256,
    fileCount: source.fileCount,
    transform: source.transform,
    inputs: source.liveInputs,
  },
});
const packageManifestSha256 = sha(packageBytes);
await writeFile(join(out, 'archive-package.json'), packageBytes);
const memberManifestSha256 = await writeJson('archive-members.json', {
  status: 'pass', algorithm: 'sha256', archiveSha256, packageManifestSha256,
  archiveMemberCount: Object.keys(members).length,
  verifiedMemberCount: Object.keys(members).length,
  members,
});
const run = (runtime, script, env) => new Promise((done, fail) => {
  const child = spawn(runtime, [script], { cwd: root, env: { ...process.env, ...env }, stdio: 'inherit' });
  child.once('error', fail);
  child.once('exit', (code, signal) => code === 0 ? done() : fail(new Error(`${runtime} ${script} failed (${code ?? signal})`)));
});
const receiptDir = join(out, 'receipts');
const relationshipEnv = {
  UMF_R8_RETIREMENT_ARCHIVE_ROOT: join(out, 'package'),
  UMF_R8_RETIREMENT_RECEIPT_DIR: receiptDir,
  UMF_R8_RETIREMENT_ARCHIVE_SHA256: archiveSha256,
  UMF_R8_RETIREMENT_SOURCE_CLOSURE_SHA256: source.sha256,
};
const inspectorEnv = {
  UMF_R8_INSPECTOR_ARCHIVE_ROOT: join(out, 'package'),
  UMF_R8_INSPECTOR_RECEIPT_DIR: receiptDir,
  UMF_R8_INSPECTOR_ARCHIVE_SHA256: archiveSha256,
  UMF_R8_INSPECTOR_SOURCE_CLOSURE_SHA256: source.sha256,
};
const csvEnv = {
  UMF_R8_CSV_ARCHIVE_ROOT: join(out, 'package'),
  UMF_R8_CSV_RECEIPT_DIR: receiptDir,
  UMF_R8_CSV_ARCHIVE_SHA256: archiveSha256,
  UMF_R8_CSV_SOURCE_CLOSURE_SHA256: source.sha256,
};
for (const runtime of ['node', 'bun']) {
  await run(runtime, 'scripts/rust-migration/r8/relationships-default-retirement-replay-node.mjs', relationshipEnv);
  await run(runtime, 'scripts/rust-migration/r8/inspectors-default-retirement-replay-node.mjs', inspectorEnv);
  await run(runtime, 'scripts/rust-migration/r8/csv-boolean-default-retirement-replay-node.mjs', csvEnv);
}
await run('node', 'scripts/rust-migration/r8/relationships-default-retirement-replay-browser.mjs', relationshipEnv);
await run('node', 'scripts/rust-migration/r8/inspectors-default-retirement-replay-browser.mjs', inspectorEnv);
await run('node', 'scripts/rust-migration/r8/csv-boolean-default-retirement-replay-browser.mjs', csvEnv);
const names = [
  'inspectCoreRelationships', 'lookupCoreRelationship', 'declareCoreRelationship', 'verifyCoreRelationshipOperation',
  'inspectCoreScalarType', 'inspectCoreRecordMembers', 'inspectCoreReferenceLinks',
  'validateCsvBooleanLexical', 'verifyCsvBooleanLexical',
];
const receipts = {};
for (const name of names) {
  receipts[name] = {};
  for (const runtime of ['node', 'bun', 'chromium']) {
    const filename = `${name}-${runtime}.json`;
    const bytes = await readFile(join(receiptDir, filename));
    const receipt = JSON.parse(bytes.toString('utf8'));
    assert.equal(receipt.format, 'umf.r8.default-route-retirement-host-receipt/2', `${filename} format`);
    assert.equal(receipt.cohortId, cohortId, `${filename} cohort`);
    assert.deepEqual(receipt.hostPlatform, { os: process.platform, arch: process.arch }, `${filename} host`);
    assert.equal(receipt.archiveSha256, archiveSha256, `${filename} archive`);
    assert.equal(receipt.sourceClosureSha256, source.sha256, `${filename} source`);
    receipts[name][runtime] = sha(bytes);
  }
}
await writeJson('cohort.json', {
  format: 'umf.r8.default-route-retirement-cohort/1', status: 'pass', cohortId,
  platform: expectedPlatform, archiveSha256, sourceClosureSha256: source.sha256,
  sourceInputCount: source.fileCount, packageManifestSha256,
  liveSourceManifestSha256, memberManifestSha256,
  archiveMemberCount: Object.keys(members).length, receipts,
});
console.log(JSON.stringify({ cohortId, archiveSha256, sourceClosureSha256: source.sha256, operationCount: names.length, receiptCount: names.length * 3 }));
