import {expect, test} from 'bun:test';
import {CURRENT_CORE_VERSION, SCALAR_TYPES, scalarTypesForVersion} from '../../src/index-node-v4';
import {bindScalarTypesForVersionRust} from '../../src/access/rust-scalar-types-for-version-default';
import {scalarTypesForVersion as referenceScalarTypesForVersion} from '../../src/model/types';

test('Node V4 routes string versions through Rust and preserves predecessor return semantics', () => {
  expect(Object.isFrozen(SCALAR_TYPES)).toBe(true);
  expect(scalarTypesForVersion(CURRENT_CORE_VERSION)).toBe(SCALAR_TYPES);
  expect(scalarTypesForVersion(CURRENT_CORE_VERSION)).toBe(referenceScalarTypesForVersion(CURRENT_CORE_VERSION));
  for (const version of ['0.9.0', '', '0.10.0 ', '0.10.1']) {
    const result = scalarTypesForVersion(version);
    expect(result).toEqual(referenceScalarTypesForVersion(version));
    expect(result).not.toBe(scalarTypesForVersion(version));
  }
}, 20_000);

test('Node V4 preserves predecessor behavior for non-string runtime inputs', () => {
  for (const version of [undefined, null, 0, {}, Symbol('version')]) {
    const result = scalarTypesForVersion(version as unknown as string);
    expect(result).toEqual(referenceScalarTypesForVersion(version as unknown as string));
    expect(result).not.toBe(scalarTypesForVersion(version as unknown as string));
  }
});

test('the Rust result adapter rejects vocabulary drift instead of masking it', () => {
  const calls: string[] = [];
  const bound = bindScalarTypesForVersionRust({
    scalarTypesForVersion(version) {
      calls.push(version);
      return version === CURRENT_CORE_VERSION ? [...SCALAR_TYPES] : [];
    },
  }, CURRENT_CORE_VERSION, SCALAR_TYPES);
  expect(bound(CURRENT_CORE_VERSION)).toBe(SCALAR_TYPES);
  expect(bound('0.9.0')).toEqual([]);
  expect(bound('0.9.0')).not.toBe(bound('0.9.0'));
  expect(bound(undefined as unknown as string)).toEqual([]);
  expect(calls).toEqual([CURRENT_CORE_VERSION, '0.9.0', '0.9.0', '0.9.0']);

  const wrongCurrent = bindScalarTypesForVersionRust({scalarTypesForVersion: () => []}, CURRENT_CORE_VERSION, SCALAR_TYPES);
  const wrongOther = bindScalarTypesForVersionRust({scalarTypesForVersion: () => ['integer']}, CURRENT_CORE_VERSION, SCALAR_TYPES);
  expect(() => wrongCurrent(CURRENT_CORE_VERSION)).toThrow('diverged');
  expect(() => wrongOther('0.9.0')).toThrow('unsupported version');
});
