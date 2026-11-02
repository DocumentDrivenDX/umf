// SPDX-License-Identifier: MIT OR Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSameSourceInventory} from './source-inventory.mjs';

test('source inventory accepts an unchanged path set independent of order', () => {
  assert.doesNotThrow(() => assertSameSourceInventory(['src/a.ts', 'src/b.ts'], ['src/b.ts', 'src/a.ts']));
});

test('source inventory rejects files generated after the snapshot was captured', () => {
  assert.throws(
    () => assertSameSourceInventory(['src/a.ts'], ['src/a.ts', 'src/generated/new.ts']),
    /added: src\/generated\/new\.ts/,
  );
});

test('source inventory rejects files removed by snapshot generators', () => {
  assert.throws(
    () => assertSameSourceInventory(['src/a.ts', 'src/b.ts'], ['src/a.ts']),
    /removed: src\/b\.ts/,
  );
});
