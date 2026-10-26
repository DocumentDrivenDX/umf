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

test('an audited Rust facade import grant does not transfer to another facade', () => {
	const approved = checkAccessSource(
		'rust-facets-default.ts',
		"import { validateFacets } from '../model/facets';\n",
	);
	const unapproved = checkAccessSource(
		'rust-cardinality-default.ts',
		"import { validateFacets } from '../model/facets';\n",
	);

	expect(approved).toEqual([]);
	expect(unapproved).toContain(
		'rust-cardinality-default.ts: unapproved import ../model/facets',
	);
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

test('new host access hooks remain forbidden in an allowlisted Rust facade', () => {
	const errors = checkAccessSource(
		'rust-facets-default.ts',
		'const response = fetch("https://example.test");\n' +
			'const runtime = Bun.env;\n' +
			'const socket = new WebSocket("wss://example.test");\n',
	);

	expect(errors).toContain('rust-facets-default.ts: host or executable hook fetch');
	expect(errors).toContain('rust-facets-default.ts: host or executable hook Bun');
	expect(errors).toContain('rust-facets-default.ts: host or executable hook WebSocket');
});

test('import type nodes obey the exact per-file allowlist', () => {
	const errors = checkAccessSource(
		'rust-facets-default.ts',
		"type Host = import('node:fs').Stats;\n",
	);

	expect(errors).toContain('rust-facets-default.ts: unapproved import type node:fs');
});
