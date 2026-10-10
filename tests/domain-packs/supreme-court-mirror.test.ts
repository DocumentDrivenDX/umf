import { test, expect } from 'bun:test';
import { resolve } from 'node:path';

/** @covers US-061-AC13 @covers US-061-AC14 @covers US-061-AC15 */
test('Supreme Court authored HTML regression preserves counsel, rejected filings and PDF associations', () => {
  const python = process.env.PYTHON ?? 'python3';
  const result = Bun.spawnSync([python, resolve('tests/domain-packs/supreme-court-mirror_test.py')]);
  expect(new TextDecoder().decode(result.stderr)).toBe('');
  expect(result.exitCode).toBe(0);
  expect(new TextDecoder().decode(result.stdout)).toContain('mirror checks passed');
});
