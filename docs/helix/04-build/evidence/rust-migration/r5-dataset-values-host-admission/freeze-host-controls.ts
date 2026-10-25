// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze predecessor host-object refusal order for a future Rust-owned adapter.
import {readFileSync, writeFileSync} from 'node:fs';
import {validateCoreDatasetValues, verifyCoreDatasetValues} from '../../../../../../src/model/dataset-values';

const root = 'docs/helix/04-build/evidence/rust-migration/r5-dataset-values';
const frozen = JSON.parse(readFileSync(`${root}/frozen-commerce.json`, 'utf8'));
const source = frozen.source;
const input = frozen.input;
const receipt = validateCoreDatasetValues(source, input);

function traced(value: object, name: string, trace: string[]) {
  return new Proxy(value, {
    getPrototypeOf(target) { trace.push(`${name}.getPrototypeOf`); return Reflect.getPrototypeOf(target); },
    ownKeys(target) { trace.push(`${name}.ownKeys`); return Reflect.ownKeys(target); },
    getOwnPropertyDescriptor(target, key) { trace.push(`${name}.descriptor:${String(key)}`); return Reflect.getOwnPropertyDescriptor(target, key); },
  });
}

function capture(run: (trace: string[]) => unknown) {
  const trace: string[] = [];
  try { return {status: 'returned', value: run(trace), trace}; }
  catch (error) {
    return {status: 'threw', error: {name: error instanceof Error ? error.name : 'Error', code: (error as any)?.code ?? null, path: (error as any)?.path ?? null, message: error instanceof Error ? error.message : String(error)}, trace};
  }
}

const cases: Record<string, unknown> = {};
cases.validate_source_accessor_before_input = capture(trace => {
  const invalidSource = traced(Object.defineProperty({}, 'x/value', {enumerable: true, get() { trace.push('source.getter'); return 1; }}), 'source', trace);
  const untouchedInput = traced(input, 'input', trace);
  return validateCoreDatasetValues(invalidSource as any, untouchedInput as any);
});
cases.validate_source_number_before_input = capture(trace => {
  const invalidSource = {...source, 'x-number': Number.NaN};
  const untouchedInput = traced(input, 'input', trace);
  return validateCoreDatasetValues(invalidSource as any, untouchedInput as any);
});
cases.validate_input_sparse = capture(() => {
  const sparse = structuredClone(input);
  sparse.records = new Array(1);
  return validateCoreDatasetValues(source as any, sparse as any);
});
cases.validate_input_cycle = capture(() => {
  const cyclic: any = structuredClone(input);
  cyclic.context = {self: cyclic};
  return validateCoreDatasetValues(source as any, cyclic);
});
cases.validate_input_custom_prototype = capture(() => {
  const custom: any = structuredClone(input);
  Object.setPrototypeOf(custom.context = {}, {future: true});
  return validateCoreDatasetValues(source as any, custom);
});
cases.verify_receipt_schema_before_current = capture(trace => {
  const invalidReceipt = {operation: 'validate-core-dataset-values', version: '1.0.0'};
  const untouchedCurrent = traced(source, 'current', trace);
  const untouchedExpected = traced(input, 'expected', trace);
  return verifyCoreDatasetValues(invalidReceipt as any, untouchedCurrent as any, untouchedExpected as any);
});
cases.verify_current_before_expected_on_stale_source = capture(trace => {
  const stale = structuredClone(source);
  stale.title += ' stale';
  const current = traced(stale, 'current', trace);
  const untouchedExpected = traced(input, 'expected', trace);
  return verifyCoreDatasetValues(receipt as any, current as any, untouchedExpected as any);
});
cases.verify_expected_after_current_match = capture(trace => {
  const current = traced(source, 'current', trace);
  const stale = structuredClone(input);
  stale.scope.id += '-stale';
  const expected = traced(stale, 'expected', trace);
  return verifyCoreDatasetValues(receipt as any, current as any, expected as any);
});

const result = {format: 'umf-r5-dataset-values-host-admission-freeze/1', cases};
writeFileSync(process.env.UMF_R5_DATASET_HOST_FREEZE ?? 'docs/helix/04-build/evidence/rust-migration/r5-dataset-values-host-admission/frozen-host-controls.json', `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(Object.fromEntries(Object.entries(cases).map(([id, value]: [string, any]) => [id, {status: value.status, error: value.error, trace: value.trace}]))));
