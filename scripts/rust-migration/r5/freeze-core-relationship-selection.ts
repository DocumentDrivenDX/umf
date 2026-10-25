// SPDX-License-Identifier: MIT OR Apache-2.0
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { selectCoreRelationships } from '../../../src/model/relationship-selection';
import { relationshipCandidate } from '../../core-relationship-cases';

const root = resolve(import.meta.dir, '../../..');
const closure = [
  'src/model/relationship-selection.ts', 'src/model/relationships.ts',
  'src/model/json.ts', 'src/model/errors.ts', 'src/model/types.ts',
  'src/validation/relationships.ts', 'src/validation/document.ts',
  'src/validation/schema.ts', 'src/validation/internal-schema.ts',
  'src/registry/registry.ts', 'src/generated/core-model.ts',
  'src/generated/core-validators.ts', 'spec/core/schema.json',
  'spec/core/relationship-metadata-selection-v2.schema.json',
  'spec/metamodel/generated/core-constraints.json',
  'spec/metamodel/generated/domain-policy.json',
  'scripts/core-relationship-cases.ts', 'tests/core/relationship-selection.test.ts',
  'docs/helix/02-design/contracts/CONTRACT-041-relationship.md',
  'docs/helix/03-test/test-plan.md', 'docs/helix/04-build/rust-migration-plan.md',
];
const hashes = Object.fromEntries(await Promise.all(closure.map(async path => [
  path, createHash('sha256').update(await readFile(resolve(root, path))).digest('hex'),
])));
const canonical = (value: unknown): string => Array.isArray(value)
  ? '[' + value.map(canonical).join(',') + ']'
  : value !== null && typeof value === 'object'
    ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}'
    : JSON.stringify(value);
const base = relationshipCandidate();
const rel = base.modules[0]!.relationships![0]!;
const association = relationshipCandidate();
association.modules[0]!.relationships![0]!.associationRecord = { module: 'm', element: 'Enrollment' };
association.modules[0]!.relationships![0]!.target[0]!.key = 'account-number';
const multi = relationshipCandidate();
multi.modules.push({ id: 'other', namespace: 'other', elements: [], relationships: [{
  ...structuredClone(rel), source: [{ module: 'm', element: 'Product' }], inverse: 'otherOrders',
}] });
const unknown = relationshipCandidate();
(unknown.modules[0]!.relationships![0] as any)['a/b~c😀'] = { opaque: true };
(unknown.modules[0]!.relationships![0]!.source[0] as any).future = 'retain';
const withUnknownRecordFields = (fieldsFirst: boolean) => {
  const document = relationshipCandidate();
  const extras = Object.fromEntries(Array.from({ length: 256 }, (_, index) => [`futureRecord${index}`, null]));
  const record = document.modules[0]!.elements.find((element: { id: string }) => element.id === 'Customer')! as any;
  const key = record.keys[0];
  record.keys[0] = fieldsFirst ? Object.assign({}, extras, key) : Object.assign({}, key, extras);
  document.modules[0]!.elements[document.modules[0]!.elements.indexOf(record)] = fieldsFirst
    ? Object.assign({}, extras, record)
    : Object.assign({}, record, extras);
  return document;
};
const unknownFieldsFirst = withUnknownRecordFields(true);
const unknownFieldsLast = withUnknownRecordFields(false);
const utf16 = relationshipCandidate();
utf16.modules[0]!.id = 'lone-\ud800';
const rewriteModuleIds = (value: any): void => {
  if (Array.isArray(value)) { for (const item of value) rewriteModuleIds(item); return; }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key === 'module' && child === 'm') value[key] = 'lone-\ud800';
      else rewriteModuleIds(child);
    }
  }
};
rewriteModuleIds(utf16.modules[0]);
const aggregate = relationshipCandidate() as any;
aggregate.unknownPayload = Array.from({ length: 99_742 }, () => null);
const invalidSource = relationshipCandidate();
invalidSource.umf = '0.6.0';
const badSource = { umf: 'bad' } as any;
const malformedQuery = { sources: [{ module: 'm', element: 'Order', extra: true }] } as any;

const cases: Record<string, { source: any; query: any; getter?: boolean }> = {
  all_paths_and_navigation: { source: association, query: {} },
  filters_intersection: { source: multi, query: { modules: ['other'], names: ['customer'], identities: [{ module: 'other', id: rel.id }], sources: [{ module: 'm', element: 'Product' }], targets: [{ module: 'm', element: 'Customer' }] } },
  empty_filters: { source: multi, query: { modules: [], names: [], identities: [], sources: [], targets: [] } },
  source_filter_or_match: { source: multi, query: { sources: [{ module: 'm', element: 'Order' }, { module: 'm', element: 'Product' }] } },
  target_key_filter_ignores_key: { source: association, query: { targets: [{ module: 'm', element: 'Customer' }] } },
  unknown_qualifier_paths: { source: unknown, query: {} },
  unknown_record_key_fields_first: { source: unknownFieldsFirst, query: {} },
  unknown_record_key_fields_last: { source: unknownFieldsLast, query: {} },
  undirected_reverse_navigation: { source: (() => { const d = relationshipCandidate(); d.modules[0]!.relationships![0]!.directed = false; d.modules[0]!.relationships![0]!.targetLifecycle = 'unspecified'; delete d.modules[0]!.relationships![0]!.inverse; return d; })(), query: {} },
  inverse_navigation: { source: base, query: { names: ['customer'] } },
  no_relationships: { source: (() => { const d = relationshipCandidate(); delete d.modules[0]!.relationships; return d; })(), query: {} },
  utf16_identity: { source: utf16, query: { modules: ['lone-\ud800'] } },
  malformed_query: { source: base, query: malformedQuery },
  malformed_query_before_invalid_source: { source: badSource, query: malformedQuery },
  legacy_source_refusal: { source: invalidSource, query: {} },
  aggregate_output_limit: { source: aggregate, query: {} },
};
const outcomes: Record<string, unknown> = {};
for (const [name, item] of Object.entries(cases)) {
  const before = canonical(item.source);
  try { outcomes[name] = { ok: true, value: selectCoreRelationships(item.source, item.query) }; }
  catch (error) {
    const e = error as { code?: string; message?: string; path?: string };
    outcomes[name] = { ok: false, error: { code: e.code ?? '', message: e.message ?? String(error), path: e.path ?? '' } };
  }
  outcomes[`${name}_source_unchanged`] = { sourceUnchanged: canonical(item.source) === before };
}
let getterCalls = 0;
try { selectCoreRelationships(base, { get modules() { getterCalls++; return ['m']; } } as any); }
catch (error) {
  const e = error as { code?: string; message?: string; path?: string };
  outcomes.getter_query_refusal_before_invocation = { ok: false, error: { code: e.code ?? '', message: e.message ?? String(error), path: e.path ?? '' } };
}
outcomes.getter_query_refusal_before_invocation_calls = { calls: getterCalls };
const pathCase = selectCoreRelationships(association, {}).selection[0]!;
outcomes.path_resolution = {
  relationshipPath: pathCase.path,
  sourceRecordPath: pathCase.sources[0]!.recordPath,
  targetRecordPath: pathCase.targets[0]!.recordPath,
  keyPath: pathCase.targets[0]!.keyPath,
  associationRecordPath: pathCase.associationRecord!.recordPath,
};
const output = 'docs/helix/04-build/evidence/rust-migration/r5-core-relationship-selection/frozen-typescript.json';
await mkdir(dirname(resolve(root, output)), { recursive: true });
await writeFile(resolve(root, output), JSON.stringify({
  profile: 'core-relationship-selection/2.0.0/core-0.10.0',
  predecessor: 'src/model/relationship-selection.ts',
  sourceClosureSha256: hashes,
  cases: Object.fromEntries(Object.entries(cases).map(([name, item]) => [name, { source: item.source, query: item.query }])),
  outcomes,
}, null, 2) + '\n');
console.log(output);
