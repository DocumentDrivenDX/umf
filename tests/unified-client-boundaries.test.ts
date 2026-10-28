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

test('the Cardinality production facade cannot restore TypeScript JSON copying', () => {
	const errors = checkAccessSource(
		'rust-cardinality-default.ts',
		"import {copyJson} from '../model/json';\n",
	);
	expect(errors).toContain('rust-cardinality-default.ts: unapproved import ../model/json');
});

test('the Record Type facade has only its exact audited model imports', () => {
	const allowed = checkAccessSource(
		'rust-record-type-default.ts',
		"import { copyJson } from '../model/json';\n",
	);
	const denied = checkAccessSource(
		'rust-record-type-default.ts',
		"import { readFile } from 'node:fs';\n",
	);

	expect(allowed).toEqual([]);
	expect(denied).toContain('rust-record-type-default.ts: unapproved import node:fs');
});

test('the Record Type facade cannot restore a predecessor value import', () => {
	const allowed = checkAccessSource(
		'rust-record-type-default.ts',
		"import type {CoreRecordTypeDeclaration} from '../model/record-type';\n",
	);
	const denied = checkAccessSource(
		'rust-record-type-default.ts',
		"import {declareCoreRecordType} from '../model/record-type';\n",
	);

	expect(allowed).toEqual([]);
	expect(denied).toContain('rust-record-type-default.ts: value import from type-only module ../model/record-type');
	expect(checkAccessSource('rust-record-type-default.ts', "export * from '../model/record-type';\n"))
		.toContain('rust-record-type-default.ts: value re-export from type-only module ../model/record-type');
});

test('the Record Values facade keeps its predecessor import type-only and isolated', () => {
	const source = "import type {CoreRecordValueCheck} from '../model/record-values';\n";
	expect(checkAccessSource('rust-record-values-default.ts', source)).toEqual([]);
	expect(checkAccessSource('rust-record-type-default.ts', source)).toContain(
		'rust-record-type-default.ts: unapproved import ../model/record-values',
	);
	expect(checkAccessSource('rust-record-values-default.ts',
		"import {validateCoreRecordValues} from '../model/record-values';\n"))
		.toContain('rust-record-values-default.ts: value import from type-only module ../model/record-values');
	expect(checkAccessSource('rust-record-values-default.ts',
		"export * from '../model/record-values';\n"))
		.toContain('rust-record-values-default.ts: value re-export from type-only module ../model/record-values');
});

test('the Core Semantic Types Rust facade grants exact type-only predecessor imports', () => {
	const allowed = checkAccessSource(
		'rust-core-semantic-types-default.ts',
		"import {UmfError} from '../model/errors';\nimport type {CoreSemanticTypeInspection} from '../model/semantic-types';\nimport type {Document} from '../model/types';\n",
	);
	const deniedSemantic = checkAccessSource(
		'rust-core-semantic-types-default.ts',
		"import {inspectCoreSemanticTypes} from '../model/semantic-types';\n",
	);
	const deniedTypes = checkAccessSource(
		'rust-core-semantic-types-default.ts',
		"import {Document} from '../model/types';\n",
	);

	expect(allowed).toEqual([]);
	expect(deniedSemantic).toContain('rust-core-semantic-types-default.ts: value import from type-only module ../model/semantic-types');
	expect(deniedTypes).toContain('rust-core-semantic-types-default.ts: value import from type-only module ../model/types');
});

test('the Core Semantic Types Rust facade preserves predecessor public signatures', () => {
	type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
	type Assert<T extends true> = T;
	type Bound = ReturnType<typeof import('../src/access/rust-core-semantic-types-default').bindCoreSemanticTypesRust>;
	type _Inspect = Assert<Equal<Bound['inspectCoreSemanticTypes'], typeof import('../src/model/semantic-types').inspectCoreSemanticTypes>>;
	type _Get = Assert<Equal<Bound['getCoreSemanticTypes'], typeof import('../src/model/semantic-types').getCoreSemanticTypes>>;
	type _Declare = Assert<Equal<Bound['declareCoreSemanticTypes'], typeof import('../src/model/semantic-types').declareCoreSemanticTypes>>;
	type _Verify = Assert<Equal<Bound['verifyCoreSemanticTypeDeclaration'], typeof import('../src/model/semantic-types').verifyCoreSemanticTypeDeclaration>>;
	expect(true).toBe(true);
});

test('the Semantic Types facade cannot import executable predecessor semantics', () => {
	expect(checkAccessSource('rust-semantic-types-default.ts',
		"import type {CoreSemanticTypeIdentity} from '../model/semantic-types';\n"))
		.toEqual([]);
	expect(checkAccessSource('rust-semantic-types-default.ts',
		"import {validateCoreSemanticTypeValue} from '../model/semantic-types';\n"))
		.toContain('rust-semantic-types-default.ts: value import from type-only module ../model/semantic-types');
	expect(checkAccessSource('rust-semantic-types-default.ts',
		"import {SemanticTypeRegistry} from '../extensions/semantic-types';\n"))
		.toContain('rust-semantic-types-default.ts: value import from type-only module ../extensions/semantic-types');
	expect(checkAccessSource('rust-record-values-default.ts',
		"import type {CoreSemanticTypeIdentity} from '../model/semantic-types';\n"))
		.toContain('rust-record-values-default.ts: unapproved import ../model/semantic-types');
});

test('the Core Evolution candidate keeps predecessor declarations type-only', () => {
	const allowed = checkAccessSource(
		'rust-core-evolution-candidate.ts',
		"import type {CoreEvolutionPolicy} from '../model/evolution';\n",
	);
	const denied = checkAccessSource(
		'rust-core-evolution-candidate.ts',
		"import {inspectCoreEvolution} from '../model/evolution';\n",
	);

	expect(allowed).toEqual([]);
	expect(denied).toContain('rust-core-evolution-candidate.ts: value import from type-only module ../model/evolution');
});

test('the Selection facade grants only audited type imports and no host hooks', () => {
	const allowed = checkAccessSource(
		'rust-selection-default.ts',
		"import type {CoreElementQuery} from '../model/selection';\nimport type {Registry} from '../registry/registry';\n",
	);
	const denied = checkAccessSource(
		'rust-selection-default.ts',
		"import {selectCoreElements} from '../model/selection';\nimport {readFile} from 'node:fs';\nconst environment = process.env;\n",
	);

	expect(allowed).toEqual([]);
	expect(denied).toContain('rust-selection-default.ts: value import from type-only module ../model/selection');
	expect(denied).toContain('rust-selection-default.ts: unapproved import node:fs');
	expect(denied).toContain('rust-selection-default.ts: host or executable hook process');
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

test('external import-equals cannot bypass the per-file import policy', () => {
	const errors = checkAccessSource(
		'rust-candidate.ts',
		'import fs = require("node:fs"); export const read = fs.readFileSync;\n',
	);

	expect(errors).toContain('rust-candidate.ts: external import equals node:fs');
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

test('runtime-global escape hatches remain forbidden in an allowlisted Rust facade', () => {
	const errors = checkAccessSource(
		'rust-facets-default.ts',
		'const runtime = globalThis;\n' +
		'const worker = new Worker("worker.js");\n' +
		'importScripts("runtime.js");\n' +
		'const deno = Deno.core;\n',
	);

	expect(errors).toContain('rust-facets-default.ts: host or executable hook globalThis');
	expect(errors).toContain('rust-facets-default.ts: host or executable hook Worker');
	expect(errors).toContain('rust-facets-default.ts: host or executable hook importScripts');
	expect(errors).toContain('rust-facets-default.ts: host or executable hook Deno');
});

test('host roots cannot be used to reach hooks through properties', () => {
	const errors = checkAccessSource(
		'rust-facets-default.ts',
		'window.fetch("https://example.invalid"); self.location.href; global.process.env; document.cookie; navigator.sendBeacon("/x", "y");\n',
	);

	for (const hook of ['window', 'self', 'global', 'document', 'navigator', 'location']) {
		expect(errors).toContain(`rust-facets-default.ts: host or executable hook ${hook}`);
	}
});

test('the Key Tuple facade has exact type-only declarations and error imports', () => {
	const allowed = checkAccessSource(
		'rust-key-tuple-default.ts',
		"import type {CoreKeyTupleReceipt} from '../model/key-tuple';\nimport type {Json} from '../model/types';\nimport {UmfError} from '../model/errors';\n",
	);
	const deniedValue = checkAccessSource(
		'rust-key-tuple-default.ts',
		"import {prepareCoreKeyTuples} from '../model/key-tuple';\n",
	);
	const deniedImport = checkAccessSource(
		'rust-key-tuple-default.ts',
		"import {readFile} from 'node:fs';\n",
	);

	expect(allowed).toEqual([]);
	expect(deniedValue).toContain('rust-key-tuple-default.ts: value import from type-only module ../model/key-tuple');
	expect(deniedImport).toContain('rust-key-tuple-default.ts: unapproved import node:fs');
});

test('malformed TypeScript cannot pass the source boundary check through parser recovery', () => {
	const errors = checkAccessSource('rust-facets-default.ts', 'import { value from \'../model/errors\';');

	expect(errors.some((error) => error.startsWith('rust-facets-default.ts: TypeScript parse error '))).toBe(true);
});

test('import type nodes obey the exact per-file allowlist', () => {
	const errors = checkAccessSource(
		'rust-facets-default.ts',
		"type Host = import('node:fs').Stats;\n",
	);

	expect(errors).toContain('rust-facets-default.ts: unapproved import type node:fs');
});

test('ordinary Rust JSON facade allows only its audited error and type imports', () => {
	const allowed = checkAccessSource(
		'read-json-value-ordinary.ts',
		"import {UmfError} from '../model/errors';\nimport type {Json} from '../model/types';\n",
	);
	expect(allowed).toEqual([]);
	const denied = checkAccessSource(
		'read-json-value-ordinary.ts',
		"import {copyJson} from '../model/json';\nimport {Json} from '../model/types';\nconst env = process.env;\n",
	);
	expect(denied).toContain('read-json-value-ordinary.ts: unapproved import ../model/json');
	expect(denied).toContain('read-json-value-ordinary.ts: value import from type-only module ../model/types');
	expect(denied).toContain('read-json-value-ordinary.ts: host or executable hook process');
});
