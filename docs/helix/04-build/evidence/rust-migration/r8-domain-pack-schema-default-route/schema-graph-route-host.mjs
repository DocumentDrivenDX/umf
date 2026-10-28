// SPDX-License-Identifier: MIT OR Apache-2.0
// Run the same installed or built schema-graph cohort under Node and Bun.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {canonicalJson, fail, openArtifact, parseReplayOptions} from './schema-graph-route-common.mjs';

const options = parseReplayOptions();
const artifact = await openArtifact(options);
const hostHarness = join(dirname(fileURLToPath(import.meta.url)),'schema-graph-route-host-child.mjs');
const expected = {
  input:artifact.dist,
  'artifact-sha256':artifact.manifestSha,
  'package-json-sha256':artifact.packageSha,
  'source-closure-sha256':artifact.sourceClosureSha256,
};
if (artifact.packageManifestSha256) expected['package-manifest-sha256'] = artifact.packageManifestSha256;

function runHost(host, executable) {
  const args = [hostHarness,'--runtime',host];
  for (const [key,value] of Object.entries(expected)) args.push(`--${key}`,value);
  const child = spawnSync(executable,args,{encoding:'utf8',maxBuffer:8 * 1024 * 1024,timeout:180_000});
  if (child.error) fail(`${host} replay could not start: ${child.error.message}`);
  if (child.status !== 0) fail(`${host} replay failed (${child.status}): ${(child.stderr || child.stdout).slice(-500)}`);
  const line = child.stdout.trim().split(/\r?\n/).at(-1);
  let receipt;
  try { receipt = JSON.parse(line); } catch { fail(`${host} replay did not emit a JSON result`); }
  if (receipt.status !== 'pass' || receipt.host !== host) fail(`${host} replay result is incomplete`);
  return receipt;
}

try {
  const node = runHost('node',process.env.UMF_NODE_BIN ?? 'node');
  const bun = runHost('bun',process.env.UMF_BUN_BIN ?? 'bun');
  const comparable = receipt => ({status:receipt.status,artifact:receipt.artifact,operations:receipt.operations});
  if (canonicalJson(comparable(node)) !== canonicalJson(comparable(bun))) fail('Node and Bun schema-graph receipts differ');
  process.stdout.write(`${JSON.stringify({
    status:'pass',
    artifact:{input:options.input,artifactSha256:artifact.artifactSha,manifestSha256:artifact.manifestSha,packageJsonSha256:artifact.packageSha,packageManifestSha256:artifact.packageManifestSha256,sourceClosureSha256:artifact.sourceClosureSha256},
    operations:node.operations,
    hosts:{node:{runtime:node.runtime,operations:Object.keys(node.operations).length},bun:{runtime:bun.runtime,operations:Object.keys(bun.operations).length}},
    nodeBunExactReceiptParity:true,
  })}\n`);
} finally {
  await artifact.cleanup();
}
