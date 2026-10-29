// SPDX-License-Identifier: MIT OR Apache-2.0
// Current rule-program work counts; immutable predecessor inputs/outcomes stay
// in their original packets. This command never rewrites those packets.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {verifyCompactWithWork} from '../../../src/model/dataset-values-compact';
import {createValueContext, ValueWork} from '../../../src/model/internal/value-context';
import type {CoreDatasetInput} from '../../../src/model/dataset-values';
import type {Document} from '../../../src/model/types';

const output = 'docs/helix/04-build/evidence/rust-migration/r5-dataset-values-compact-default-cutover/current-work-oracle.json';
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const read = (file: string) => readFileSync(file, 'utf8');
const inputs: Record<string, string> = {};
function pin(file: string) { inputs[file] = digest(read(file)); }
function pinTree(directory: string) {
  for (const entry of readdirSync(directory, {withFileTypes: true}).sort((a,b) => a.name.localeCompare(b.name))) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) pinTree(file);
    else if (/\.(?:ts|json|ya?ml)$/.test(entry.name)) pin(file);
  }
}
for (const directory of ['src', 'spec']) pinTree(directory);
pin('package.json');
pin('bun.lock');
pin('scripts/rust-migration/r5/compact-current-work-oracle.ts');
const cases: Record<string, unknown> = {};
for (const name of ['near-limit-accepted', 'near-limit-first-refused']) {
  const predecessor = `docs/helix/04-build/evidence/rust-migration/r5-dataset-values-compact-verify/frozen-${name}.json`;
  const text = read(predecessor), frozen = JSON.parse(text), work = new ValueWork();
  let outcome: unknown;
  try {
    const evaluated = verifyCompactWithWork(frozen.receipt, frozen.current, frozen.expectedInput, work);
    outcome = {result: JSON.parse(JSON.stringify(evaluated.receipt))};
  } catch (error) {
    const value = error as {code?: string; message?: string; path?: string};
    outcome = {thrown: {code: value.code, message: value.message, path: value.path}};
  }
  const expected = frozen.thrown ? {thrown: frozen.thrown} : {result: frozen.result};
  assert.deepEqual(outcome, expected, `${name}: current TypeScript public outcome changed`);
  pin(predecessor);
  cases[name] = {predecessor, predecessorSha256: digest(text), outcomeSha256: digest(JSON.stringify(outcome)), work: work.snapshot()};
}
const predecessor = 'docs/helix/04-build/evidence/rust-migration/r5-dataset-values-compact/frozen-commerce.json';
const text = read(predecessor), commerce = JSON.parse(text);
pin(predecessor);
cases.commerce = {
  predecessor, predecessorSha256: digest(text),
  contextWork: createValueContext(commerce.source as Document, commerce.input as CoreDatasetInput).work.snapshot(),
};
const packet = {format: 'umf.r8.compact-current-work-oracle/1',
  scope: 'Current authored constraint program work counters. Exact predecessor inputs and public outcomes remain unchanged; historical work snapshots are retained separately.',
  inputs: Object.fromEntries(Object.entries(inputs).sort(([a],[b]) => a.localeCompare(b))), cases};
const bytes = JSON.stringify(packet, null, 2) + '\n';
if (process.argv.includes('--check')) assert.equal(read(output), bytes, 'Current compact work oracle is stale');
else writeFileSync(output, bytes);
console.log(`Current compact work oracle ${process.argv.includes('--check') ? 'verified' : 'written'}: 3 cases, ${Object.keys(inputs).length} pinned inputs.`);
