import {expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {scalarTypesForVersion} from '../src/model/types';

const predecessor = JSON.parse(readFileSync(new URL('../docs/helix/04-build/evidence/rust-migration/r8-scalar-types-for-version/predecessor.json', import.meta.url), 'utf8'));

test('the TypeScript predecessor still matches the pre-implementation version lookup capture', () => {
  for (const item of predecessor.cases) {
    expect(scalarTypesForVersion(item.version), item.id).toEqual(item.result);
  }
});
