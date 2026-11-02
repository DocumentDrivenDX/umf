// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, test} from 'bun:test';
import {createDatasetValueOperations as nodeOperations} from '../src/dataset-values.js';
import {createDatasetValueOperations as wasmOperations} from '../../wasm/src/dataset-values.js';

class TestError extends Error {
  constructor(code, message, path = '') {
    super(message);
    this.code = code;
    this.path = path;
  }
}

for (const [host, factory] of [['Node/Bun', nodeOperations], ['WASM', wasmOperations]]) {
  test(`${host} routes full Dataset operations without reshaping arguments`, () => {
    const calls = [];
    const api = factory((op, args) => { calls.push([op, args]); return {op, args}; });
    const source = {umf: '0.10.0', modules: [], unknown: {'\ud800': null}};
    const input = {scope: {id: 'fixture', closure: 'supplied-dataset-only'}, records: [], relationships: []};
    const receipt = {operation: 'validate-core-dataset-values', source, input};
    expect(api.validateCoreDatasetValues(source, input).op).toBe('model/validateCoreDatasetValues');
    expect(api.verifyCoreDatasetValues(receipt, source, input).op).toBe('model/verifyCoreDatasetValues');
    expect(calls).toEqual([
      ['model/validateCoreDatasetValues', {source, input}],
      ['model/verifyCoreDatasetValues', {receipt, current: source, expectedInput: input}],
    ]);
    expect(Object.isFrozen(api)).toBe(true);
  });

  test(`${host} strips only the two top-level transport path prefixes`, () => {
    const api = factory((op) => {
      if (op === 'model/validateCoreDatasetValues') throw new TestError('CORE_DATASET_INPUT', 'bad input', '/input');
      if (op === 'model/verifyCoreDatasetValues') throw new TestError('CORE_DATASET_SOURCE', 'bad source', '/source');
    }, {ErrorType: TestError});
    try { api.validateCoreDatasetValues({}, {}); throw new Error('expected refusal'); }
    catch (error) { expect([error.code, error.path, error.message]).toEqual(['CORE_DATASET_INPUT', '', 'bad input']); }
    try { api.verifyCoreDatasetValues({}, {}, {}); throw new Error('expected refusal'); }
    catch (error) { expect([error.code, error.path, error.message]).toEqual(['CORE_DATASET_SOURCE', '', 'bad source']); }
    const nestedApi = factory(() => { throw new TestError('CORE_DATASET_INPUT', 'nested input', '/input/records/0'); }, {ErrorType: TestError});
    try { nestedApi.verifyCoreDatasetValues({}, {}, {}); throw new Error('expected refusal'); }
    catch (error) { expect([error.code, error.path, error.message]).toEqual(['CORE_DATASET_INPUT', '/input/records/0', 'nested input']); }
  });

  test(`${host} leaves non-semantic host controls untouched`, () => {
    const control = new TestError('CANCELLED', 'cancelled', '/input');
    const api = factory(() => { throw control; }, {ErrorType: TestError});
    try { api.validateCoreDatasetValues({}, {}); throw new Error('expected control'); }
    catch (error) { expect(error).toBe(control); }
  });
}
