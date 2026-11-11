import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeWasm} from '../index.js';

test('preserves caller-supplied loader initialization errors', async () => {
  const expected = new Error('custom loader initialization failed');
  await assert.rejects(
    initializeWasm(async () => ({default: async () => { throw expected; }}), globalThis),
    error => error === expected,
  );
});
