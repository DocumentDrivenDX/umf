// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze complete outputs from the retained TypeScript cardinality API before binding comparison.
import {mkdir, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const run = spawnSync('bun', ['run','docs/helix/04-build/evidence/rust-migration/r5-cardinality/capture-vectors.ts'], {encoding:'utf8'});
if (run.status !== 0) throw new Error(run.stderr || 'Retained TypeScript cardinality capture failed');
const output = JSON.parse(run.stdout);
const path = 'docs/helix/04-build/evidence/rust-migration/r5-model-bindings/frozen-cardinality-typescript.json';
await mkdir('docs/helix/04-build/evidence/rust-migration/r5-model-bindings', {recursive:true});
await writeFile(path, JSON.stringify(output, null, 2) + '\n');
process.stdout.write(`Frozen complete retained TypeScript cardinality envelopes at ${path}\n`);
