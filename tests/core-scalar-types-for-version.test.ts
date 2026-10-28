import {expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {SCALAR_TYPES,scalarTypesForVersion} from '../src/model/types';

const predecessor = JSON.parse(readFileSync(new URL('../docs/helix/04-build/evidence/rust-migration/r8-scalar-types-for-version/predecessor.json', import.meta.url), 'utf8'));

test('the TypeScript predecessor still matches the pre-implementation version lookup capture', () => {
  for (const item of predecessor.cases) {
    expect(scalarTypesForVersion(item.version), item.id).toEqual(item.result);
  }
});

test('the TypeScript predecessor preserves the shared frozen current vocabulary and JS invalid-input behavior', () => {
  expect(Object.isFrozen(SCALAR_TYPES)).toBe(true);
  expect(scalarTypesForVersion('0.10.0')).toBe(SCALAR_TYPES);
  for (const version of [undefined, null, 0, {}, Symbol('version')]) {
    const result = scalarTypesForVersion(version as unknown as string);
    expect(result).toEqual([]);
    expect(result).not.toBe(scalarTypesForVersion(version as unknown as string));
  }
});
