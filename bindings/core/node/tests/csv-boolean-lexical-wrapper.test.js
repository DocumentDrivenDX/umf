// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe, expect, test} from 'bun:test';
import {createCsvBooleanLexicalOperations} from '../src/csv-boolean-lexical.js';

describe('CSV Boolean lexical wrapper', () => {
  test('routes validate and receipt-first verification through Rust', () => {
    const calls = [];
    const invoke = (operation, args) => {
      calls.push({operation, args});
      if (operation === 'model/prepareCsvBooleanLexicalVerification') return {prepared: true};
      return {operation, args};
    };
    const api = createCsvBooleanLexicalOperations(invoke);
    const source = {umf: '0.10.0'};
    const request = {profile: 'umf.csv-boolean-lexical/1.0.0', token: 'true'};
    expect(api.validateCsvBooleanLexical(source, request)).toEqual({
      operation: 'model/validateCsvBooleanLexical', args: {source, csvRequest: request},
    });
    const receipt = {operation: 'validate-csv-boolean-lexical'};
    expect(api.verifyCsvBooleanLexical(receipt, source, request)).toEqual({
      operation: 'model/finishCsvBooleanLexicalVerification',
      args: {preparedReceipt: {prepared: true}, source, csvRequest: request},
    });
    expect(calls.map(({operation}) => operation)).toEqual([
      'model/validateCsvBooleanLexical',
      'model/prepareCsvBooleanLexicalVerification',
      'model/finishCsvBooleanLexicalVerification',
    ]);
    expect(Object.isFrozen(api)).toBe(true);
  });

  test('does not read expected inputs after receipt admission refuses', () => {
    const refusal = Object.assign(new Error('bad receipt'), {code: 'CSV_BOOLEAN_LEXICAL'});
    let calls = 0;
    const api = createCsvBooleanLexicalOperations(() => { calls++; throw refusal; });
    const source = Object.defineProperty({}, 'umf', {enumerable: true, get() { throw new Error('source read'); }});
    expect(() => api.verifyCsvBooleanLexical({}, source, {})).toThrow(refusal);
    expect(calls).toBe(1);
  });

  test('preserves finish refusal identity and does not substitute prepared response', () => {
    const refusal = Object.assign(new Error('stale receipt'), {code: 'CSV_BOOLEAN_LEXICAL'});
    const prepared = {untrusted: true};
    const calls = [];
    const api = createCsvBooleanLexicalOperations((operation, args) => {
      calls.push({operation, args});
      if (operation === 'model/prepareCsvBooleanLexicalVerification') return prepared;
      throw refusal;
    });
    expect(() => api.verifyCsvBooleanLexical({}, {}, {})).toThrow(refusal);
    expect(calls[1].args.preparedReceipt).toBe(prepared);
  });
});
