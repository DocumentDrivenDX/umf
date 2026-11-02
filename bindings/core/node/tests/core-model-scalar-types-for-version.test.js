import {expect, test} from 'bun:test';
import {createCoreModelOperations as nodeOperations} from '../src/core-model.js';
import {createCoreModelOperations as wasmOperations} from '../../wasm/src/core-model.js';

for (const [host, factory] of [['Node/Bun', nodeOperations], ['WASM', wasmOperations]]) {
  test(`${host} routes scalarTypesForVersion through the opt-in Rust operation`, () => {
    const calls = [];
    const api = factory((...args) => {
      calls.push(args);
      return args[1].version === '0.10.0'
        ? ['boolean', 'integer', 'decimal', 'float', 'string', 'binary', 'date', 'time', 'timestamp', 'bits128', 'uuid']
        : [];
    });

    expect(api.scalarTypesForVersion('0.10.0')).toEqual([
      'boolean', 'integer', 'decimal', 'float', 'string', 'binary', 'date', 'time', 'timestamp', 'bits128', 'uuid',
    ]);
    expect(api.scalarTypesForVersion('0.10.1')).toEqual([]);
    expect(calls).toEqual([
      ['model/scalarTypesForVersion', {version: '0.10.0'}],
      ['model/scalarTypesForVersion', {version: '0.10.1'}],
    ]);
  });
}
