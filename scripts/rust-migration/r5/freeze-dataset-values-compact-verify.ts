// SPDX-License-Identifier: MIT OR Apache-2.0
// Separate live-TypeScript predecessor packet for compact verification's
// cumulative ValueWork and short-circuit behavior. Never rewrites validate.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { verifyCompactWithWork } from '../../../src/model/dataset-values-compact';
import { evaluateCompactWithWork } from '../../../src/model/dataset-values-compact';
import { ValueWork } from '../../../src/model/internal/value-context';
import type { CoreDatasetInput } from '../../../src/model/dataset-values';
import type { Document } from '../../../src/model/types';

const out = process.env.UMF_R5_DATASET_VALUES_COMPACT_VERIFY_OUT ??
  'docs/helix/04-build/evidence/rust-migration/r5-dataset-values-compact-verify';
mkdirSync(out, { recursive: true });
const predecessor = 'docs/helix/04-build/evidence/rust-migration/r5-dataset-values-compact-default-cutover/frozen-commerce.json';
const base = JSON.parse(readFileSync(predecessor, 'utf8')) as {
  source: Record<string, any>;
  input: Record<string, any>;
  result: Record<string, any>;
};

const outcomes: Array<Record<string, unknown>> = [];
function capture(id: string, receipt: any, current: any, expectedInput: any) {
  const work = new ValueWork();
  try {
    const evaluated = verifyCompactWithWork(receipt, current, expectedInput, work);
    outcomes.push({ id, receipt, current, expectedInput, result: evaluated.receipt, work: work.snapshot() });
  } catch (error) {
    outcomes.push({
      id,
      receipt,
      current,
      expectedInput,
      thrown: {
        code: (error as any)?.code,
        message: (error as Error).message,
        path: (error as any)?.path,
      },
      work: work.snapshot(),
    });
  }
}

capture('commerce-complete', base.result, base.source, base.input);
const staleSource = structuredClone(base.source);
staleSource.umf = '0.10.0-stale';
capture('stale-source-input-canonical-skipped', base.result, staleSource, base.input);

// Crossed dual fault: both current and expectedInput are copied before the
// stale-source comparison. A deliberately over-limit expectedInput must
// therefore refuse during copy before the stale receipt result is examined.
const oversizedExpected = { context: Array.from({ length: 100_001 }, () => null) };
capture('stale-source-expected-input-copy-limit', base.result, staleSource, oversizedExpected);

// A distinct verify-only threshold pair. Each receipt is independently
// recomputed for the truncated input; this exercises natural cumulative work
// across receipt admission, copies, canonical comparisons, and recomputation.
const near = JSON.parse(readFileSync(
  'docs/helix/04-build/evidence/rust-migration/r5-dataset-values-compact/frozen-near-threshold-accepted.json',
  'utf8',
)) as { source: Record<string, any>; input: Record<string, any> };
for (const [id, count] of [['near-limit-accepted', 267], ['near-limit-first-refused', 268]] as const) {
  const input = { ...near.input, records: near.input.records.slice(0, count) };
  const fresh = evaluateCompactWithWork(near.source as Document, input as CoreDatasetInput);
  capture(id, fresh.receipt, near.source, input);
}

const files: string[] = [];
for (const item of outcomes) {
  const filename = `frozen-${item.id}.json`;
  const bytes = `${JSON.stringify(item, null, 2)}\n`;
  writeFileSync(`${out}/${filename}`, bytes);
  files.push(`${createHash('sha256').update(bytes).digest('hex')}  ${filename}`);
}
const sourcePaths = [
  'src/model/dataset-values-compact.ts',
  'src/model/internal/value-context.ts',
  'src/model/internal/schema-work.ts',
  'src/model/dataset-values.ts',
  'src/model/record-values.ts',
  'src/model/key-tuple.ts',
  'src/model/document.ts',
  'src/validation/schema.ts',
  'src/validation/internal-schema.ts',
  'scripts/rust-migration/r5/freeze-dataset-values-compact-verify.ts',
  'spec/core/dataset-value-compact-operation.schema.json',
  'spec/core/dataset-value-operation.schema.json',
  'spec/core/key-tuple-operation-v4.schema.json',
  'spec/core/schema.json',
  'spec/core/semantic-type-reference.schema.json',
  predecessor,
  'docs/helix/04-build/evidence/rust-migration/r5-dataset-values-compact/frozen-near-threshold-accepted.json',
];
const closure = sourcePaths.map(path => ({
  path,
  sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
}));
const index = { format: 'r5-dataset-values-compact-verify-v1', oracle: 'live TypeScript verifyCompactWithWork', predecessorPacket: predecessor, cases: outcomes.map(({ id }) => id), sourceClosure: closure };
const indexBytes = `${JSON.stringify(index, null, 2)}\n`;
writeFileSync(`${out}/index.json`, indexBytes);
files.push(`${createHash('sha256').update(indexBytes).digest('hex')}  index.json`);
writeFileSync(`${out}/SHA256SUMS`, `${files.join('\n')}\n`);
