// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe, expect, test} from 'bun:test';
import {createRowScopeRustDefault} from '../../src/table-authoring/rust-default';

describe('Rust row-scope staged admission', () => {
  test('invokes the caller policy callback between prepare and native completion', () => {
    const order: string[] = [];
    let nativeContext: unknown;
    const prepared = {
      valid: true,
      source: {commands: ['select']},
      policy: {mode: 'native-rls'},
      diagnostics: [],
      sourceToOutput: {'/commands/0': ['/policy/person/select']},
    };
    const engine = {
      prepareRowScope(input: unknown, context: unknown) {
        order.push('prepare');
        expect(input).toEqual({commands: ['select']});
        expect(context).not.toHaveProperty('admitPolicy');
        expect(context).toHaveProperty('record', {module: 'm', element: 'r'});
        nativeContext = context;
        return prepared;
      },
      completeRowScope(input: unknown, context: unknown, value: unknown, diagnostics: unknown) {
        order.push('complete');
        expect(input).toEqual({commands: ['select']});
        expect(context).toBe(nativeContext);
        expect(value).toBe(prepared);
        expect(diagnostics).toEqual([]);
        return {...prepared, valid: true};
      },
    };
    const bindingContext = {
      record: {module: 'm', element: 'r'},
      ownerColumns: {},
      via: [],
      admitPolicy(policy: unknown) {
        order.push('host-policy');
        expect(policy).toEqual(prepared.policy);
        return [];
      },
    };
    const normalize = createRowScopeRustDefault(() => engine, () => false);
    expect(normalize({commands: ['select']}, bindingContext as never)).toEqual(prepared);
    expect(order).toEqual(['prepare', 'host-policy', 'complete']);
  });

  test('preserves callback exception identity and does not complete after refusal', () => {
    const callbackFailure = new Error('caller registry failed');
    let completeCalls = 0;
    const prepared = {
      valid: true,
      policy: {mode: 'native-rls'},
      diagnostics: [],
      sourceToOutput: {},
    };
    const normalize = createRowScopeRustDefault(
      () => ({
        prepareRowScope: () => prepared,
        completeRowScope: () => {
          completeCalls++;
          return prepared;
        },
      }),
      () => false,
    );
    const context = {
      record: {module: 'm', element: 'r'},
      ownerColumns: {},
      via: [],
      admitPolicy() {
        throw callbackFailure;
      },
    };
    expect(() => normalize({}, context as never)).toThrow(callbackFailure);
    expect(completeCalls).toBe(0);
  });
});
