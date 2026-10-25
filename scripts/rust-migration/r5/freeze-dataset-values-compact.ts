// SPDX-License-Identifier: MIT OR Apache-2.0
// Live TypeScript oracle packet for the opt-in compact dataset core port.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readDocument } from '../../../src/model/document';
import { validateCoreDatasetValuesCompact, verifyCoreDatasetValuesCompact } from '../../../src/model/dataset-values-compact';
import { supplyChainDataset } from '../../../tests/helpers/supply-chain-dataset';
import { evaluateCompactWithWork } from '../../../src/model/dataset-values-compact';
import { createValueContext } from '../../../src/model/internal/value-context';

const out = process.env.UMF_R5_DATASET_VALUES_COMPACT_OUT ?? 'docs/helix/04-build/evidence/rust-migration/r5-dataset-values-compact';
mkdirSync(out, { recursive: true });
const cases: Array<{ id: string; source: unknown; input: unknown; result?: unknown; receipt?: unknown; thrown?: unknown; verify?: unknown; work?: unknown; contextWork?: unknown; inputSchemaWork?: unknown }> = [];
const captureInputSchemaWork = (source: any, input: any) => {
  const context = createValueContext(source, input);
  context.reserveInput();
  const categories = Object.fromEntries(Object.entries(context.work.snapshot().categories).filter(([category]) => category.startsWith('input-schema-')));
  return { categories, used: Object.values(categories).reduce((total, visits) => total + visits, 0) };
};
for (const id of ['commerce', 'supply-chain', 'archaeology', 'ecology']) {
  const source = readDocument(await Bun.file(`spec/domain-packs/${id}/ontology.json`).text(), 'json');
  const graph = await Bun.file(`spec/domain-packs/${id}/graph/fixture.json`).json();
  const input = supplyChainDataset(source, graph);
  try {
    const evaluated = evaluateCompactWithWork(source, input);
    const result = evaluated.receipt;
    const verify = verifyCoreDatasetValuesCompact(result, source, input);
    const contextWork = createValueContext(source, input).work.snapshot();
    cases.push({ id, source, input, result, verify, work: evaluated.work, contextWork, inputSchemaWork: captureInputSchemaWork(source, input) });
  } catch (error) {
    cases.push({ id, source, input, thrown: { code: (error as any)?.code, message: (error as Error).message, path: (error as any)?.path } });
  }
}
const commerce = cases[0]!;
if (commerce.result) {
  const freezeCall = (id: string, source: any, input: any) => {
    try { cases.push({ id, source, input, result: validateCoreDatasetValuesCompact(source, input) }); }
    catch (error) { cases.push({ id, source, input, thrown: { code: (error as any)?.code, message: (error as Error).message, path: (error as any)?.path } }); }
  };
  const invalidSource = structuredClone(commerce.source) as any;
  invalidSource.umf = '0.9.0';
  freezeCall('invalid-source-only', invalidSource, commerce.input);
  const invalidInput = structuredClone(commerce.input) as any;
  invalidInput.records = 'not-an-array';
  freezeCall('invalid-input-only', commerce.source, invalidInput);
  const crossedInvalid = structuredClone(commerce.input) as any;
  crossedInvalid.records = 'not-an-array';
  freezeCall('crossed-invalid-source-input', invalidSource, crossedInvalid);
  const source = structuredClone(commerce.source) as any;
  const input = structuredClone(commerce.input) as any;
  source.vocabularies['urn:unknown:compact-freeze'] = { version: '9.1.0' };
  source.extensions = { 'urn:unknown:compact-freeze': { opaque: ['雪', null] } };
  input.context = { retained: ['unknown', null] };
  cases.push({ id: 'unknown-and-residual', source, input, result: validateCoreDatasetValuesCompact(source, input) });
  const absent = structuredClone(commerce.input) as any;
  absent.records[0].values[0] = { field: absent.records[0].values[0].field, state: 'absent' };
  cases.push({ id: 'absent-state', source: commerce.source, input: absent, result: validateCoreDatasetValuesCompact(commerce.source as any, absent) });
  const parallel = structuredClone(commerce.input) as any;
  parallel.relationships.push({ ...structuredClone(parallel.relationships[0]), instanceId: 'compact-parallel-frozen' });
  freezeCall('parallel-links', commerce.source, parallel);
  const duplicate = structuredClone(commerce.input) as any;
  const duplicateRecord = structuredClone(duplicate.records[0]); duplicateRecord.instanceId = 'compact-duplicate-key'; duplicate.records.push(duplicateRecord);
  freezeCall('duplicate-key', commerce.source, duplicate);
  const missing = structuredClone(commerce.input) as any; missing.relationships = [];
  freezeCall('missing-links', commerce.source, missing);
  const duplicateLocator = structuredClone(commerce.input) as any; duplicateLocator.records.push(structuredClone(duplicateLocator.records[0]));
  freezeCall('duplicate-locator', commerce.source, duplicateLocator);
  const structuralLimit = { context: Array.from({ length: 100_001 }, () => null) };
  freezeCall('structural-limit', commerce.source, structuralLimit);
  const workLimit = structuredClone(commerce.input) as any;
  workLimit.records = Array.from({ length: 1000 }, (_, i) => ({ ...structuredClone((commerce.input as any).records[0]), instanceId: `compact-work-${i}` }));
  freezeCall('work-limit', commerce.source, workLimit);
  const repeated = (count: number) => {
    const candidate = structuredClone(commerce.input) as any;
    candidate.records = Array.from({ length: count }, (_, i) => ({ ...structuredClone((commerce.input as any).records[0]), instanceId: `compact-near-${i}` }));
    return candidate;
  };
  let acceptedCount = 1;
  let refusedCount = 1000;
  while (refusedCount - acceptedCount > 1) {
    const middle = Math.floor((acceptedCount + refusedCount) / 2);
    try { evaluateCompactWithWork(commerce.source as any, repeated(middle)); acceptedCount = middle; }
    catch (error) {
      if ((error as any)?.code !== 'LIMIT' || (error as any)?.message !== 'Compact dataset JSON traversal/copy/semantic budget exceeded') throw error;
      refusedCount = middle;
    }
  }
  const nearAcceptedInput = repeated(acceptedCount);
  const nearAccepted = evaluateCompactWithWork(commerce.source as any, nearAcceptedInput);
  if (nearAccepted.work.used > 1_000_000) throw new Error('near-threshold accepted vector exceeds ValueWork limit');
  cases.push({ id: 'near-threshold-accepted', source: commerce.source, input: nearAcceptedInput, result: nearAccepted.receipt, work: nearAccepted.work, contextWork: createValueContext(commerce.source as any, nearAcceptedInput).work.snapshot(), inputSchemaWork: captureInputSchemaWork(commerce.source, nearAcceptedInput) });
  const nearRefusedInput = repeated(refusedCount);
  try {
    evaluateCompactWithWork(commerce.source as any, nearRefusedInput);
    throw new Error('first work-limit successor unexpectedly accepted');
  } catch (error) {
    if ((error as any)?.code !== 'LIMIT' || (error as any)?.message !== 'Compact dataset JSON traversal/copy/semantic budget exceeded') throw error;
    cases.push({ id: 'near-threshold-first-refused', source: commerce.source, input: nearRefusedInput, thrown: { code: (error as any)?.code, message: (error as Error).message, path: (error as any)?.path } });
  }
  const archaeology = cases.find(item => item.id === 'archaeology')!;
  const presentNull = structuredClone(archaeology.input) as any;
  const findPresent = (value: any): any => {
    if (Array.isArray(value)) { for (const child of value) { const found = findPresent(child); if (found) return found; } }
    else if (value && typeof value === 'object') {
      if (value.state === 'present' && value.value !== null && value.value !== undefined) return value;
      for (const child of Object.values(value)) { const found = findPresent(child); if (found) return found; }
    }
    return undefined;
  };
  const present = findPresent(presentNull.records);
  if (!present) throw new Error('archaeology cohort lacks a present value for present-null mutation');
  present.value = null;
  freezeCall('present-null', archaeology.source, presentNull);
  const exactDecimal = structuredClone(archaeology.input) as any;
  const findDecimal = (value: any): any => {
    if (Array.isArray(value)) { for (const child of value) { const found = findDecimal(child); if (found) return found; } }
    else if (value && typeof value === 'object') {
      if (typeof value.decimalToken === 'string') return value;
      for (const child of Object.values(value)) { const found = findDecimal(child); if (found) return found; }
    }
    return undefined;
  };
  const decimal = findDecimal(exactDecimal.records);
  if (!decimal) throw new Error('archaeology cohort lacks an exact decimal token');
  decimal.decimalToken = decimal.decimalToken === '2E+1' ? '2.0E+1' : '2E+1';
  freezeCall('exact-decimal-token', archaeology.source, exactDecimal);
  const forged = structuredClone(commerce.result) as any;
  forged.records[0].result.sourceRef = '#/input';
  try { verifyCoreDatasetValuesCompact(forged, commerce.source as any, commerce.input as any); throw new Error('forged receipt unexpectedly verified'); }
  catch (error) { cases.push({ id: 'forged-receipt', source: commerce.source, input: commerce.input, receipt: forged, thrown: { code: (error as any)?.code, message: (error as Error).message, path: (error as any)?.path } }); }
}
const hashes: string[] = [];
for (const item of cases) {
  const name = `frozen-${item.id}.json`;
  const bytes = `${JSON.stringify(item, null, 2)}\n`;
  writeFileSync(`${out}/${name}`, bytes);
  hashes.push(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`);
}
const sourcePaths = [
  'spec/core/dataset-value-compact-operation.schema.json','spec/core/dataset-value-operation.schema.json','spec/core/extension-package.schema.json','spec/core/facet-operation-v3.schema.json','spec/core/facet-operation-v5.schema.json','spec/core/key-operation-v2.schema.json','spec/core/key-operation-v4.schema.json','spec/core/key-tuple-operation-v4.schema.json','spec/core/schema.json','spec/core/semantic-type-reference.schema.json',
  'spec/metamodel/generated/core-constraints.json','spec/metamodel/generated/domain-policy.json',
  'src/generated/core-model.ts','src/generated/core-validators.ts',
  'src/model/bit128.ts','src/model/dataset-values-compact.ts','src/model/dataset-values.ts','src/model/document.ts','src/model/errors.ts','src/model/facets.ts','src/model/json.ts','src/model/key-tuple.ts','src/model/keys.ts','src/model/record-values.ts','src/model/schema-literals.ts','src/model/schema-properties.ts','src/model/types.ts','src/model/uuid.ts',
  'src/model/internal/field-body.ts','src/model/internal/inspection-meanings.ts','src/model/internal/record-body.ts','src/model/internal/schema-work.ts','src/model/internal/value-context.ts',
  'src/registry/kind-runtime.ts','src/registry/registry.ts',
  'src/validation/constraint-kernel.ts','src/validation/constraint-language.ts','src/validation/current-policy.ts','src/validation/document.ts','src/validation/internal-schema.ts','src/validation/json-equality.ts','src/validation/keys.ts','src/validation/literal-kernel.ts','src/validation/literal-policy.ts','src/validation/schema-properties.ts','src/validation/schema.ts',
  'tests/helpers/supply-chain-dataset.ts',
];
const sourceClosure = sourcePaths.map(path => ({ path, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') }));
const publicRouting = { entryPoint: 'src/index.ts', sha256: createHash('sha256').update(readFileSync('src/index.ts')).digest('hex'), oracleImplementation: 'src/model/dataset-values-compact.ts' };
const index = `${JSON.stringify({ format: 'umf.r5.dataset-values-compact.typescript-freeze/1', sourceClosure, publicRouting, files: cases.map(item => `frozen-${item.id}.json`) }, null, 2)}\n`;
writeFileSync(`${out}/index.json`, index);
hashes.push(`${createHash('sha256').update(index).digest('hex')}  index.json`);
writeFileSync(`${out}/SHA256SUMS`, `${hashes.join('\n')}\n`);
