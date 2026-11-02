// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, test} from 'bun:test';
import {createCoreRelationshipOperations as nodeOperations} from '../src/core-relationships.js';
import {createCoreRelationshipOperations as wasmOperations} from '../../wasm/src/core-relationships.js';

for (const [host, factory] of [['Node/Bun', nodeOperations], ['WASM', wasmOperations]]) {
  test(`${host} routes relationship operations with exact request envelopes`, () => {
    const calls = [];
    const invoke = (operation, args) => {
      calls.push([operation, args]);
      return {operation, args};
    };
    const api = factory(invoke);
    const source = {umf: '0.10.0', modules: []};
    const identity = {module: 'm'};
    const request = {id: 'r', name: 'relation'};
    const receipt = {operation: 'inspect-core-relationships'};
    const current = structuredClone(source);

    expect(api.inspectCoreRelationships(source, identity)).toEqual({operation: 'model/inspectCoreRelationships', args: {source, identity}});
    expect(api.lookupCoreRelationship(source, {...identity, id: 'r'})).toEqual({operation: 'model/lookupCoreRelationship', args: {source, identity: {...identity, id: 'r'}}});
    expect(api.declareCoreRelationship(source, identity, request)).toEqual({operation: 'model/declareCoreRelationship', args: {source, identity, request}});
    expect(api.verifyCoreRelationshipOperation(receipt, current)).toEqual({operation: 'model/verifyCoreRelationshipOperation', args: {receipt, current}});
    expect(Object.isFrozen(api)).toBe(true);
    expect(calls.map(([operation]) => operation)).toEqual([
      'model/inspectCoreRelationships',
      'model/lookupCoreRelationship',
      'model/declareCoreRelationship',
      'model/verifyCoreRelationshipOperation',
    ]);
  });

  test(`${host} preserves underlying wire refusal identity`, () => {
    const refusal = new Error('wire refusal');
    const api = factory(() => { throw refusal; });
    expect(() => api.inspectCoreRelationships({}, {})).toThrow(refusal);
  });

  test(`${host} keeps relationship verification stages private and one-use`, () => {
    const prepared = Object.freeze({receipt: true});
    const calls = [];
    const api = factory((operation, args) => {
      calls.push([operation, args]);
      if (operation === 'model/prepareCoreRelationshipVerification') return prepared;
      return {operation, args};
    });
    const handle = api.prepareCoreRelationshipVerification({operation: 'inspect-core-relationships'});
    expect(Object.getPrototypeOf(handle)).toBe(null);
    expect(Object.isFrozen(handle)).toBe(true);
    expect(api.finishCoreRelationshipVerification(handle, {umf: 'current'})).toEqual({
      operation: 'model/finishCoreRelationshipVerification',
      args: {prepared, current: {umf: 'current'}},
    });
    expect(() => api.finishCoreRelationshipVerification(handle, {})).toThrow(TypeError);
    expect(calls.map(([operation]) => operation)).toEqual([
      'model/prepareCoreRelationshipVerification',
      'model/finishCoreRelationshipVerification',
    ]);
  });
}
