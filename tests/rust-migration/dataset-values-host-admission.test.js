// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, test, setDefaultTimeout} from 'bun:test';
import {createCoreDatasetValuesHostInputEngine} from '../../bindings/core/node/index.js';
import {validateCoreDatasetValues, verifyCoreDatasetValues} from '../../src/model/dataset-values.ts';
import coreSchema from '../../spec/core/schema.json' with {type: 'json'};
import referenceSchema from '../../spec/core/semantic-type-reference.schema.json' with {type: 'json'};
import packageSchema from '../../spec/core/extension-package.schema.json' with {type: 'json'};
import constraints from '../../spec/metamodel/generated/core-constraints.json' with {type: 'json'};
import domainPolicy from '../../spec/metamodel/generated/domain-policy.json' with {type: 'json'};
import {readFileSync} from 'node:fs';

setDefaultTimeout(300_000);
const resources = {coreSchema, referenceSchema, packageSchema, constraints, domainPolicy};
const frozen = JSON.parse(readFileSync(new URL('../../docs/helix/04-build/evidence/rust-migration/r5-dataset-values/frozen-commerce.json', import.meta.url), 'utf8'));
const engine = createCoreDatasetValuesHostInputEngine(resources);
const source = frozen.source;
const input = frozen.input;
const receipt = validateCoreDatasetValues(source, input);

function traced(value, name, trace) {
  return new Proxy(value, {
    getPrototypeOf(target) { trace.push(`${name}.getPrototypeOf`); return Reflect.getPrototypeOf(target); },
    ownKeys(target) { trace.push(`${name}.ownKeys`); return Reflect.ownKeys(target); },
    getOwnPropertyDescriptor(target, key) { trace.push(`${name}.descriptor:${String(key)}`); return Reflect.getOwnPropertyDescriptor(target, key); },
  });
}
function capture(run) {
  const trace = [];
  try { run(trace); return {status: 'returned', trace}; }
  catch (error) { return {status: 'threw', error: {name: error.name, code: error.code ?? null, path: error.path ?? null, message: error.message}, trace}; }
}
function assertFrozen(name, actual) {
  const packet = JSON.parse(readFileSync(new URL('../../docs/helix/04-build/evidence/rust-migration/r5-dataset-values-host-admission/frozen-host-controls.json', import.meta.url), 'utf8'));
  const expected = packet.cases[name];
  expect(actual.status).toBe(expected.status);
  expect(actual.error).toEqual(expected.error);
  expect(actual.trace).toEqual(expected.trace);
}

test('Rust host admission matches frozen predecessor refusal order and paths', () => {
  assertFrozen('validate_source_accessor_before_input', capture(trace => engine.validateCoreDatasetValues(
    traced(Object.defineProperty({}, 'x/value', {enumerable: true, get() { trace.push('source.getter'); return 1; }}), 'source', trace),
    traced(input, 'input', trace))));
  assertFrozen('validate_source_number_before_input', capture(trace => engine.validateCoreDatasetValues(
    {...source, 'x-number': Number.NaN}, traced(input, 'input', trace))));
  const sparse = structuredClone(input); sparse.records = new Array(1);
  assertFrozen('validate_input_sparse', capture(() => engine.validateCoreDatasetValues(source, sparse)));
  const cyclic = structuredClone(input); cyclic.context = {self: cyclic};
  assertFrozen('validate_input_cycle', capture(() => engine.validateCoreDatasetValues(source, cyclic)));
  const custom = structuredClone(input); Object.setPrototypeOf(custom.context = {}, {future: true});
  assertFrozen('validate_input_custom_prototype', capture(() => engine.validateCoreDatasetValues(source, custom)));
  assertFrozen('verify_receipt_schema_before_current', capture(trace => engine.verifyCoreDatasetValues(
    {operation: 'validate-core-dataset-values', version: '1.0.0'}, traced(source, 'current', trace), traced(input, 'expected', trace))));
  const staleSource = structuredClone(source); staleSource.title += ' stale';
  assertFrozen('verify_current_before_expected_on_stale_source', capture(trace => engine.verifyCoreDatasetValues(
    receipt, traced(staleSource, 'current', trace), traced(input, 'expected', trace))));
  const staleInput = structuredClone(input); staleInput.scope.id += '-stale';
  assertFrozen('verify_expected_after_current_match', capture(trace => engine.verifyCoreDatasetValues(
    receipt, traced(source, 'current', trace), traced(staleInput, 'expected', trace))));
});

test('verify Rust host result remains equal to the TypeScript predecessor', () => {
  expect(engine.verifyCoreDatasetValues(receipt, source, input)).toEqual(verifyCoreDatasetValues(receipt, source, input));
});

test('host admission returns an isolated copy of both inputs', () => {
  const sourceInput = structuredClone(source);
  const datasetInput = structuredClone(input);
  const result = engine.validateCoreDatasetValues(sourceInput, datasetInput);
  sourceInput.title = 'mutated after admission';
  datasetInput.scope.id = 'mutated after admission';
  expect(result.source.title).toBe(source.title);
  expect(result.input.scope.id).toBe(input.scope.id);
  expect(result.source).not.toBe(sourceInput);
  expect(result.input).not.toBe(datasetInput);
});

test('setup controls refuse before touching resource accessors', () => {
  let touched = 0;
  const unsafeResources = Object.defineProperty({}, 'coreSchema', {enumerable: true, get() { touched++; return coreSchema; }});
  expect(() => createCoreDatasetValuesHostInputEngine(unsafeResources, {controls: {maxWork: 0}}))
    .toThrow(expect.objectContaining({code: 'RESOURCE_LIMIT'}));
  expect(touched).toBe(0);
  expect(() => createCoreDatasetValuesHostInputEngine(unsafeResources, {controls: {isCancelled: () => true}}))
    .toThrow(expect.objectContaining({code: 'CANCELLED'}));
  expect(touched).toBe(0);
});
