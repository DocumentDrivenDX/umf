import {describe, expect, test} from 'bun:test';
import {createCoreEvolutionOperations} from '../src/core-evolution.js';

describe('core evolution wrapper', () => {
  test('routes inspection and verification through the tagged model operations', () => {
    const calls = [];
    const api = createCoreEvolutionOperations((operation, args) => {
      calls.push({operation, args});
      return {operation, args};
    });
    const before = {umf: '0.10.0'};
    const after = {umf: '0.10.0'};
    const policy = {profile: 'core-0.8-absent-string-additions/0.1'};
    expect(api.inspectCoreEvolution(before, after, policy)).toEqual({
      operation: 'model/inspectCoreEvolution', args: {before, after, policy},
    });
    const receipt = {operation: 'inspect-core-evolution'};
    expect(api.verifyCoreEvolution(receipt, before, after, policy)).toEqual({
      operation: 'model/verifyCoreEvolution', args: {receipt, before, after, policy},
    });
    expect(calls.map(({operation}) => operation)).toEqual([
      'model/inspectCoreEvolution', 'model/verifyCoreEvolution',
    ]);
    expect(Object.isFrozen(api)).toBe(true);
  });

  test('preserves thrown error identity', () => {
    const refusal = Object.assign(new Error('meter stopped'), {code: 'EVOLUTION_METER_STOP'});
    const api = createCoreEvolutionOperations(() => { throw refusal; });
    expect(() => api.inspectCoreEvolution({}, {}, {})).toThrow(refusal);
    expect(() => api.verifyCoreEvolution({}, {}, {}, {})).toThrow(refusal);
  });
});
