import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { checkAccessSource } from '../scripts/check-unified-client-boundaries';

test('an existing facade cannot add an import outside its exact allowlist', async () => {
	const path = new URL('../src/access/rust-facets-default.ts', import.meta.url);
	const source = await readFile(path, 'utf8');
	const errors = checkAccessSource(
		'rust-facets-default.ts',
		`${source}\nimport { readFile } from 'node:fs';\n`,
	);

	expect(errors).toContain('rust-facets-default.ts: unapproved import node:fs');
});

test('a per-file allowlist also governs re-export module references', () => {
	const errors = checkAccessSource(
		'rust-facets-default.ts',
		"export * from 'node:fs';\n",
	);

	expect(errors).toContain('rust-facets-default.ts: unapproved import node:fs');
});

test('a newly added access source requires its own allowlist entry', () => {
	const errors = checkAccessSource('new-rust-facade.ts', 'export const value = 1;');

	expect(errors).toContain('new-rust-facade.ts: missing per-file import allowlist');
});

test('dynamic imports and host hooks remain forbidden for allowlisted files', () => {
	const errors = checkAccessSource(
		'rust-facets-default.ts',
		"const loaded = import('../model/errors');\nconst env = process.env;\n",
	);

	expect(errors).toContain('rust-facets-default.ts: dynamic import');
	expect(errors).toContain('rust-facets-default.ts: host or executable hook process');
});

test('import type nodes obey the exact per-file allowlist', () => {
	const errors = checkAccessSource(
		'rust-facets-default.ts',
		"type Host = import('node:fs').Stats;\n",
	);

	expect(errors).toContain('rust-facets-default.ts: unapproved import type node:fs');
});
