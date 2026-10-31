// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, test} from 'bun:test';
import {createCompactDatasetValueOperations as nodeOperations} from '../src/dataset-values-compact.js';
import {createCompactDatasetValueOperations as wasmOperations} from '../../wasm/src/dataset-values-compact.js';

for (const [host, factory] of [['Node/Bun', nodeOperations], ['WASM', wasmOperations]]) {
  test(`${host} routes compact dataset validation and verification without reshaping values`, () => {
    const calls = [];
    const api = factory((op, args) => {
      calls.push([op, args]);
      if (op === 'model/prepareCoreDatasetValuesCompactVerification') return args.receipt;
      return {op, args};
    });
    const source = {umf: '0.10.0', modules: [], unknown: {'\ud800': null}};
    const input = {scope: {id: 'fixture', closure: 'supplied-dataset-only'}, records: [], relationships: []};
    const receipt = {operation: 'validate-core-dataset-values-compact', source, input};

    expect(api.validateCoreDatasetValuesCompact(source, input).op).toBe('model/validateCoreDatasetValuesCompact');
    expect(api.verifyCoreDatasetValuesCompact(receipt, source, input).args.receipt).toBe(receipt);
    expect(calls).toEqual([
      ['model/validateCoreDatasetValuesCompact', {source, input}],
      ['model/prepareCoreDatasetValuesCompactVerification', {receipt}],
      ['model/verifyCoreDatasetValuesCompact', {receipt, current: source, expectedInput: input}],
    ]);
    expect(Object.isFrozen(api)).toBe(true);
  });
}

for (const [host, factory] of [['Node/Bun', nodeOperations], ['WASM', wasmOperations]]) {
  test(`${host} compact verify admits receipt before visiting later arguments`, () => {
    const visits = [];
    const invalidReceipt = {};
    const current = new Proxy({}, {ownKeys() { visits.push('current'); return []; }});
    let calls = 0;
    const api = factory((op, args) => {
      calls++;
      if (op === 'model/prepareCoreDatasetValuesCompactVerification') throw new Error('invalid receipt');
      return args;
    });
    expect(() => api.verifyCoreDatasetValuesCompact(invalidReceipt, current, {})).toThrow('invalid receipt');
    expect(calls).toBe(1);
    expect(visits).toEqual([]);
  });

  test(`${host} compact verify stages current before expected input`, () => {
    const visits = [];
    const current = new Proxy({id: 'current'}, {ownKeys(target) { visits.push('current'); return Reflect.ownKeys(target); }});
    const expectedInput = new Proxy({id: 'input'}, {ownKeys(target) { visits.push('expectedInput'); return Reflect.ownKeys(target); }});
    const api = factory((op, args) => {
      // Model the binding's ordered wire traversal of the operation object.
      JSON.stringify(args);
      return op === 'model/prepareCoreDatasetValuesCompactVerification' ? {prepared: true} : args;
    });
    api.verifyCoreDatasetValuesCompact({}, current, expectedInput);
    expect(visits).toEqual(['current', 'expectedInput']);
  });
}
