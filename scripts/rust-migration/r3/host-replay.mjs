#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0
// Installed host adapter for the frozen full-result differential corpus.
import {readFileSync, writeFileSync} from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {runCliWire} from '../../../scripts/rust-core/cli-wire-transport.mjs';
import {encodeRequestWire, fromWire, resultError} from '../../../bindings/core/node/src/wire.js';
const root = resolve(process.argv[2] ?? '.');
const entry = process.env.UMF_R3_NODE_PACKAGE ?? resolve(root, 'bindings/core/node/index.js');
const cli = process.env.UMF_R3_HOST === 'cli';
const {createCodegenEngine} = cli ? {} : await import(pathToFileURL(entry).href);
const paths = {
  coreSchema: 'spec/core/schema.json', referenceSchema: 'spec/core/semantic-type-reference.schema.json',
  packageSchema: 'spec/core/extension-package.schema.json', constraints: 'spec/metamodel/generated/core-constraints.json',
  domainPolicy: 'spec/metamodel/generated/domain-policy.json', tablesPackage: 'spec/extensions/tables/package.json',
  actionsPackage: 'spec/extensions/actions/package.json',bindingPackage:'spec/extensions/binding/package.json',stableBindingPackage:'spec/extensions/binding-stable/package.json',
};
const resources = Object.fromEntries(Object.entries(paths).map(([name, file]) => [name, JSON.parse(readFileSync(resolve(root, file), 'utf8'))]));
const engine = cli ? {async call(operation, request, label) {
  const wireBytes = Buffer.from(encodeRequestWire({op:`codegen/${operation}`,resources,request}), 'utf8');
  const run = await runCliWire({
    command: process.env.UMF_R3_CLI ?? resolve(root, 'target/release/umf'),
    args: ['core', '--stdin-wire'],
    wireBytes,
    cwd: process.cwd(),
    env: process.env,
    maxBuffer: 128*1024*1024,
    // One reviewed row-scope fixture takes 28.8s on a qualified macOS runner.
    // Keep the timeout fatal while allowing shared-runner headroom.
    timeoutMs: 120_000,
    label,
  });
  if (run.status !== 0) throw new Error(run.stderr || `CLI exited ${run.status ?? run.signal}`);
  const outer = JSON.parse(run.stdout);
  const failure = resultError(outer);
  if (failure) throw new Error(JSON.stringify(failure));
  return fromWire(JSON.parse(outer.wire));
}} : createCodegenEngine(resources);
if (process.argv[3]) {
  const bytes = readFileSync(resolve(root, process.argv[3]));
  const corpus = JSON.parse((process.argv[3].endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8'));
  const rows = corpus.cases ?? [...corpus.vectors, ...corpus.diffs];
  if (!rows.length || new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Expected nonempty corpus with unique IDs');
  const results = [];
  for (const row of rows) {
    const actual = await engine.call(row.operation, row.request, `${process.argv[3]}#${row.id}`);
    results.push({id:row.id, matches:isDeepStrictEqual(JSON.parse(JSON.stringify(actual)),row.expected), actual});
  }
  const report = {runtime:process.versions, host:cli?'cli':'native', cases:rows.length, matches:results.filter(row=>row.matches).length, results};
  if (process.env.UMF_R3_REPORT) writeFileSync(process.env.UMF_R3_REPORT, JSON.stringify(report)+'\n');
  console.log(JSON.stringify({cases:report.cases,matches:report.matches,runtime:report.runtime,host:report.host}));
  if (report.cases !== report.matches) process.exitCode=1;
} else {
  for (const [index, line] of readFileSync(0, 'utf8').split('\n').filter(Boolean).entries()) {
    const {operation, request} = JSON.parse(line);
    process.stdout.write(JSON.stringify(await engine.call(operation, request, `stdin#${index}:${operation}`)) + '\n');
  }
}
