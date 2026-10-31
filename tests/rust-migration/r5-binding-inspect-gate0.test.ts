import {readFile, stat} from 'node:fs/promises';
import {dirname, extname, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {expect, test} from 'bun:test';
import {inspectBinding, type Document} from '../../src';
import delta from '../../fixtures/binding/delta/case.json';
import iceberg from '../../fixtures/binding/iceberg/case.json';
import parquet from '../../fixtures/binding/parquet/case.json';
import postgresql from '../../fixtures/binding/postgresql-indexes/case.json';
import sqlserver from '../../fixtures/binding/sqlserver-indexes/case.json';
import {uuidBinding, uuidDocument} from '../helpers/uuid-fixtures';
import frozen from '../../tests/rust-core/fixtures/r5-binding-inspect/frozen-inspections.json';

const reports = frozen.cases as Record<string, unknown>;
const clone = <T>(value: T): T => structuredClone(value);
const payload = (binding: Document) => binding.extensions!['umf.binding'] as any;
const cases = {delta, iceberg, parquet, postgresql, sqlserver};
const resolveLocal = async (from: string, specifier: string) => {
  const base = resolve(dirname(from), specifier);
  const suffix = extname(base);
  const candidates = suffix ? [base, ...(suffix === '.js' ? [base.slice(0, -3) + '.ts', base.slice(0, -3) + '.tsx'] : [])] : [base, ...['.ts', '.tsx', '.js', '.json'].map(ext => base + ext), ...['.ts', '.tsx', '.js'].map(ext => resolve(base, 'index' + ext))];
  for (const candidate of candidates) { try { if ((await stat(candidate)).isFile()) return candidate; } catch {} }
  return undefined;
};
const importClosure = async (entry: string) => {
  const visited = new Set<string>(), pending = [entry];
  const pattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"]([^'"]+)['"]/g;
  while (pending.length) {
    const path = pending.pop()!;
    if (visited.has(path)) continue;
    visited.add(path);
    if (extname(path) === '.json') continue;
    const source = await readFile(path, 'utf8');
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]!;
      if (!specifier.startsWith('.')) continue;
      const target = await resolveLocal(path, specifier);
      if (!target) throw new Error(`Unresolved relative import ${specifier} from ${path}`);
      pending.push(target);
    }
  }
  return visited;
};

test('Gate0 freezes complete 0.1, 0.2, and 0.3 validation reports and leaves paired inputs unchanged', () => {
  for (const [name, fixture] of Object.entries(cases)) {
    const binding = clone(fixture.binding) as Document, logical = clone(fixture.logical) as Document;
    const before = {binding: clone(binding), logical: clone(logical)};
    expect(inspectBinding(binding, logical), `profile/${name}`).toEqual(reports[`profile/${name}`] as any);
    expect({binding, logical}).toEqual(before);
  }
  {
    const binding = clone(sqlserver.binding) as Document, logical = clone(sqlserver.logical) as Document;
    binding.vocabularies['umf.binding']!.version = '0.2.0'; payload(binding).profile = 'umf-binding-2';
    const before = {binding: clone(binding), logical: clone(logical)};
    expect(inspectBinding(binding, logical)).toEqual(reports['profile/stable-ids-0.2'] as any);
    expect({binding, logical}).toEqual(before);
  }
  {
    const binding = uuidBinding(), logical = uuidDocument(), before = {binding: clone(uuidBinding()), logical: clone(uuidDocument())};
    expect(inspectBinding(binding, logical)).toEqual(reports['profile/bit128-0.3'] as any);
    expect({binding, logical}).toEqual(before);
  }
});

test('Gate0 retains unknown content, diagnoses crossed invalid choices, and freezes precedence and exact paths', () => {
  const unknown = clone(postgresql.binding) as Document, logical = clone(postgresql.logical) as Document;
  payload(unknown).future = {opaque: ['retain', 7]};
  const unknownBefore = clone(unknown);
  expect(inspectBinding(unknown, logical)).toEqual(reports['unknown/retained-only'] as any);
  expect(unknown).toEqual(unknownBefore);
  const crossed = clone(postgresql.binding) as Document;
  payload(crossed).indexes[0].future = {operator: 'opaque'};
  payload(crossed).indexes[0].kind = 'unique'; payload(crossed).indexes[0].unique = false;
  expect(inspectBinding(crossed, clone(postgresql.logical) as Document)).toEqual(reports['unknown/crossed-invalid-index'] as any);
  const missing = clone(postgresql.binding) as Document;
  payload(missing).elements[0].element = 'missing-element';
  expect(inspectBinding(missing, clone(postgresql.logical) as Document)).toEqual(reports['reference/missing-element'] as any);
  const mismatch = clone(postgresql.binding) as Document;
  payload(mismatch).logical.documentId = 'other-model';
  expect(inspectBinding(mismatch, clone(postgresql.logical) as Document)).toEqual(reports['model/identity-mismatch'] as any);
  const invalidLogical = clone(postgresql.logical) as Document;
  (invalidLogical as {umf: string}).umf = '9.99.0';
  expect(inspectBinding(clone(postgresql.binding) as Document, invalidLogical)).toEqual(reports['model/invalid-logical'] as any);
  const invalidBinding = clone(postgresql.binding) as Document;
  invalidBinding.vocabularies['umf.binding']!.version = '9.9.9'; payload(invalidBinding).logical.documentId = 'other-model';
  expect(inspectBinding(invalidBinding, clone(postgresql.logical) as Document)).toEqual(reports['precedence/invalid-binding-before-pair-check'] as any);
});

test('0.3 dispatch preserves its exact paired-model refusal report', () => {
  const binding = uuidBinding(), logical = uuidDocument();
  payload(binding).logical.documentId = 'other-model';
  expect(inspectBinding(binding, logical)).toEqual(reports['profile/bit128-pair-mismatch'] as any);
});
