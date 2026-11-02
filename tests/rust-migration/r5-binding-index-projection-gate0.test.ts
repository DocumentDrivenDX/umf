import {readFile, stat} from 'node:fs/promises';
import {dirname, extname, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {expect, test} from 'bun:test';
import {projectBindingIndexes, type Document} from '../../src';
import deltaCase from '../../fixtures/binding/delta/case.json';
import icebergCase from '../../fixtures/binding/iceberg/case.json';
import parquetCase from '../../fixtures/binding/parquet/case.json';
import postgresCase from '../../fixtures/binding/postgresql-indexes/case.json';
import sqlserverCase from '../../fixtures/binding/sqlserver-indexes/case.json';
import frozen from '../../tests/rust-core/fixtures/r5-binding-index-projection/frozen-projections.json';

const frozenCases = frozen.cases as Record<string, {report: any; strict: any}>;
const pair = (value: {logical: unknown; binding: unknown}) => ({
  logical: structuredClone(value.logical) as Document,
  binding: structuredClone(value.binding) as Document,
});
const extension = (binding: Document) => binding.extensions!['umf.binding'] as any;
const indexes = (binding: Document) => extension(binding).indexes as any[];
const resolveLocal = async (from: string, specifier: string) => {
  const base = resolve(dirname(from), specifier);
  const suffix = extname(base);
  const candidates = suffix
    ? [base, ...(suffix === '.js' ? [base.slice(0, -3) + '.ts', base.slice(0, -3) + '.tsx'] : [])]
    : [base, ...['.ts', '.tsx', '.js', '.json'].map(ext => base + ext), ...['.ts', '.tsx', '.js'].map(ext => resolve(base, 'index' + ext))];
  for (const candidate of candidates) {
    try { if ((await stat(candidate)).isFile()) return candidate; } catch {}
  }
  return undefined;
};
const importClosure = async (entry: string) => {
  const visited = new Set<string>();
  const pending = [entry];
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
const structuredError = (action: () => unknown) => {
  try { action(); } catch (error) {
    const candidate = error as {code?: string; message?: string; path?: string};
    return {code: candidate.code, message: candidate.message, path: candidate.path};
  }
  throw new Error('Expected projection refusal');
};
const expectedVariant = (base: any, binding: Document, logical: Document, outcome: any) => {
  const expected = structuredClone(base);
  expected.source = binding;
  expected.logical = logical;
  expected.target = structuredClone(extension(binding).target);
  const position = Number(outcome.path.split('/').at(-1));
  expected.outcomes[position] = outcome;
  expected.status = expected.outcomes.every((row: any) => row.outcome === 'exact') ? 'projected' : 'reported';
  expected.candidate = indexes(binding).filter((_, index) => expected.outcomes[index]!.outcome === 'exact');
  return expected;
};
const multiFieldPair = (value: {logical: unknown; binding: unknown}) => {
  const {binding} = pair(value);
  const logical: Document = {
    umf: '0.10.0', id: 'order-model', vocabularies: {'umf.ddd': {version: '0.1.0'}},
    modules: [{id: 'sales', namespace: 'sales', elements: [{id: 'Order', extensions: {'umf.ddd': {
      kind: 'entity', fields: {
        id: {type: {kind: 'scalar', name: 'integer'}, cardinality: 'one'},
        details: {type: {kind: 'scalar', name: 'string'}, cardinality: 'optional'},
        region: {type: {kind: 'scalar', name: 'string'}, cardinality: 'one'},
      }, identity: {fields: ['id'], scope: 'context'},
    }}}]}],
  };
  const payload = extension(binding);
  payload.logical = {documentId: logical.id, coreVersion: logical.umf};
  payload.fields = [
    {module: 'sales', element: 'Order', field: 'id', storage: 'column', column: 'id'},
    {module: 'sales', element: 'Order', field: 'details', storage: 'embedded', documentColumn: 'payload', path: ['details']},
    {module: 'sales', element: 'Order', field: 'region', storage: 'column', column: 'region'},
  ];
  const refs: Record<string, string>[] = [];
  const addColumnField = (field: string) => {
    const entity = logical.modules[0]!.elements[0]!.extensions['umf.ddd'] as any;
    entity.fields[field] = {type: {kind: 'scalar', name: 'string'}, cardinality: 'one'};
    payload.fields.push({module: 'sales', element: 'Order', field, storage: 'column', column: field});
    return {module: 'sales', element: 'Order', field};
  };
  for (const field of ['id', 'details', 'region']) refs.push({module: 'sales', element: 'Order', field});
  return {binding, logical, addColumnField, refs};
};

test('Gate0 freezes full ordered reports, retained source/model copies, target and exact-only candidates', () => {
  const inputs = {delta: deltaCase, iceberg: icebergCase, parquet: parquetCase, postgresql: postgresCase, sqlserver: sqlserverCase};
  for (const [name, value] of Object.entries(inputs)) {
    const {logical, binding} = pair(value);
    const beforeBinding = structuredClone(binding);
    const beforeLogical = structuredClone(logical);
    expect(projectBindingIndexes(binding, logical, 'report'), `${name} report`).toEqual(frozenCases[name]!.report);
    expect(projectBindingIndexes(binding, logical, 'strict'), `${name} strict`).toEqual(frozenCases[name]!.strict);
    expect(binding).toEqual(beforeBinding);
    expect(logical).toEqual(beforeLogical);
  }
});

test('unknown content crossed with an invalid index refuses with the exact host error', () => {
  const {logical, binding} = pair(postgresCase);
  indexes(binding)[0]!.future = {operator: 'opaque'};
  indexes(binding)[0]!.kind = 'unique';
  indexes(binding)[0]!.unique = false;
  expect(structuredError(() => projectBindingIndexes(binding, logical, 'report'))).toEqual({
    code: 'BINDING_INCOMPLETE',
    message: 'Unknown binding content may affect index projection',
    path: '',
  });
  expect(indexes(binding)[0]!.future).toEqual({operator: 'opaque'});
});

test('mismatched paired logical identity reports exact diagnostic code, message, and path', () => {
  const {logical, binding} = pair(postgresCase);
  extension(binding).logical.documentId = 'other-model';
  expect(structuredError(() => projectBindingIndexes(binding, logical, 'report'))).toEqual({
    code: 'BINDING_DOCUMENT',
    message: '[{"code":"BINDING_MODEL","path":"/extensions/umf.binding/logical","message":"Logical document id/version mismatch","severity":"error"}]',
    path: '',
  });
});

test('PostgreSQL predicate language and version mismatches have exact unknown outcomes', () => {
  for (const [field, value] of [['language', 'tsql'], ['version', '16.0']] as const) {
    const {logical, binding} = pair(postgresCase);
    const predicate = indexes(binding)[5]!.predicate;
    predicate[field] = value;
    const expected = expectedVariant(frozenCases.postgresql!.report, binding, logical, {
      name: 'orders_partial', path: '/extensions/umf.binding/indexes/5', outcome: 'unknown',
      reason: 'Predicate language/version is not the selected PostgreSQL profile',
    });
    expect(projectBindingIndexes(binding, logical, 'report')).toEqual(expected);
  }
});

test('Delta four-column, include, and document-path boundaries preserve exact outcomes', () => {
  {
    const {logical, binding} = pair(deltaCase);
    extension(binding).target.version = '3.1';
    expect(projectBindingIndexes(binding, logical, 'report')).toEqual(expectedVariant(
      frozenCases.delta!.report, binding, logical,
      {name: 'order_cluster', path: '/extensions/umf.binding/indexes/0', outcome: 'unknown', reason: 'Liquid-clustering profile requires pinned Delta 3.2 or later 3.x'},
    ));
  }
  {
    const {logical, binding, addColumnField, refs} = multiFieldPair(deltaCase);
    refs.push(addColumnField('second'), addColumnField('third'), addColumnField('fourth'), addColumnField('fifth'));
    indexes(binding)[0]!.on = [refs[0]!, refs[2]!, ...refs.slice(3, 6)].map(field => ({field}));
    expect(projectBindingIndexes(binding, logical, 'report')).toEqual(expectedVariant(
      frozenCases.delta!.report, binding, logical,
      {name: 'order_cluster', path: '/extensions/umf.binding/indexes/0', outcome: 'not-expressible', reason: 'Liquid clustering requires at most four direct columns and no included or document-path targets'},
    ));
  }
  {
    const {logical, binding, addColumnField, refs} = multiFieldPair(deltaCase);
    const ref = addColumnField('included');
    indexes(binding)[0]!.on = [{field: refs[0]}];
    indexes(binding)[0]!.include = [ref];
    expect(projectBindingIndexes(binding, logical, 'report')).toEqual(expectedVariant(
      frozenCases.delta!.report, binding, logical,
      {name: 'order_cluster', path: '/extensions/umf.binding/indexes/0', outcome: 'not-expressible', reason: 'Liquid clustering requires at most four direct columns and no included or document-path targets'},
    ));
  }
  {
    const {logical, binding, refs} = multiFieldPair(deltaCase);
    const row = extension(binding).fields[1];
    row.path = ['details'];
    indexes(binding)[0]!.on = [{documentPath: {field: refs[1], path: ['details']}}];
    expect(projectBindingIndexes(binding, logical, 'report')).toEqual(expectedVariant(
      frozenCases.delta!.report, binding, logical,
      {name: 'order_cluster', path: '/extensions/umf.binding/indexes/0', outcome: 'not-expressible', reason: 'Liquid clustering requires at most four direct columns and no included or document-path targets'},
    ));
  }
});

test('Iceberg version, include, and document-path boundaries remain qualified', () => {
  {
    const {logical, binding} = pair(icebergCase);
    extension(binding).target.version = '1.6';
    expect(projectBindingIndexes(binding, logical, 'report')).toEqual(expectedVariant(
      frozenCases.iceberg!.report, binding, logical,
      {name: 'sort_by_y', path: '/extensions/umf.binding/indexes/0', outcome: 'unknown', reason: 'Sort-order analogue requires a pinned Iceberg v2 or v3 metadata profile'},
    ));
  }
  {
    const {logical, binding, addColumnField, refs} = multiFieldPair(icebergCase);
    const ref = addColumnField('included');
    indexes(binding)[0]!.on = [{field: refs[0]}];
    indexes(binding)[0]!.include = [ref];
    expect(projectBindingIndexes(binding, logical, 'report')).toEqual(expectedVariant(
      frozenCases.iceberg!.report, binding, logical,
      {name: 'sort_by_y', path: '/extensions/umf.binding/indexes/0', outcome: 'not-expressible', reason: 'This Iceberg profile maps direct columns only; includes and document paths are unsupported'},
    ));
  }
  {
    const {logical, binding, refs} = multiFieldPair(icebergCase);
    const row = extension(binding).fields[1];
    indexes(binding)[0]!.on = [{documentPath: {field: refs[1], path: ['details']}}];
    expect(projectBindingIndexes(binding, logical, 'report')).toEqual(expectedVariant(
      frozenCases.iceberg!.report, binding, logical,
      {name: 'sort_by_y', path: '/extensions/umf.binding/indexes/0', outcome: 'not-expressible', reason: 'This Iceberg profile maps direct columns only; includes and document paths are unsupported'},
    ));
  }
});
