// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze complete public outcomes for the bounded Iceberg Rust wire corpus.
// Run with `bun tests/rust-core/iceberg-parity-freeze.ts` only when refreshing
// the predecessor packet intentionally.
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {toWire} from '../../bindings/core/node/src/wire.js';
import {
  exportIcebergSchema,
  getIcebergNode,
  importIcebergSchema,
  inspectIceberg,
  proposeIcebergNodeEdit,
} from '../../src/adapters/iceberg/index.ts';

type Outcome = {status: 'ok'; wire: unknown} | {
  status: 'error'; name: string; code: unknown; path: unknown; message: string;
};

function outcome(run: () => unknown): Outcome {
  try {
    return {status: 'ok', wire: toWire(run())};
  } catch (error) {
    const item = error as Error & {code?: unknown; path?: unknown};
    return {
      status: 'error',
      name: item.name,
      code: item.code ?? null,
      path: item.path ?? '',
      message: item.message,
    };
  }
}

const fixtureRoot = resolve('fixtures/iceberg');
const validCases: {id: string; path?: string; source?: string; get: string}[] = [
  {id: 'nested', path: 'nested.json', get: '/fields/1/type/fields/0/name'},
  {id: 'exact-defaults', path: 'exact-defaults.json', get: '/fields/0/initial-default'},
  {id: 'future-object', path: 'future-object.json', get: '/fields/0/type/shape'},
  {id: 'zero-id', path: 'zero-id.json', get: '/fields/0/id'},
  {
    id: 'utf16-unknown',
    source: '{"type":"struct","schema-id":0,"fields":[{"id":1,"name":"\\ud800","type":"string","required":true}],"future-\\ud800":{"value":"\\ud800"}}',
    get: '/future-\ud800/value',
  },
];

const cases: unknown[] = [];
for (const item of validCases) {
  const source = item.source ?? readFileSync(resolve(fixtureRoot, item.path!), 'utf8');
  const imported = outcome(() => importIcebergSchema(source, {id: item.id}));
  const record: Record<string, unknown> = {
    id: item.id,
    ...(item.path ? {path: `fixtures/iceberg/${item.path}`} : {source}),
    operations: {import: imported},
  };
  if (imported.status === 'ok') {
    const document = importIcebergSchema(source, {id: item.id});
    record.operations = {
      import: imported,
      inspect: outcome(() => inspectIceberg(document)),
      export: outcome(() => exportIcebergSchema(document)),
      get: outcome(() => getIcebergNode(document, item.get)),
      getMissing: outcome(() => getIcebergNode(document, '/not-present')),
      edit: outcome(() => proposeIcebergNodeEdit(document, '/fields/0/name', '"edited"')),
      editBadPointerBeforeSource: outcome(() => proposeIcebergNodeEdit(document, '/bad~2pointer', '{')),
      editInvalidReplacement: outcome(() => proposeIcebergNodeEdit(document, '/fields/0/name', '{')),
      exportAfterEditProposal: outcome(() => exportIcebergSchema(document)),
    };
  }
  cases.push(record);
}

for (const [id, path] of [
  ['duplicate-id', 'duplicate-id.json'],
  ['decimal-range', 'decimal-range.json'],
] as const) {
  const source = readFileSync(resolve(fixtureRoot, path), 'utf8');
  cases.push({
    id,
    path: `fixtures/iceberg/${path}`,
    operations: {import: outcome(() => importIcebergSchema(source, {id}))},
  });
}

cases.push({
  id: 'malformed-source',
  source: '{',
  operations: {import: outcome(() => importIcebergSchema('{', {id: 'malformed-source'}))},
});

writeFileSync(
  resolve('tests/rust-core/iceberg-parity-freeze.json'),
  JSON.stringify({profile: 'umf-r5-iceberg-schema/0.1.0', cases}, null, 2) + '\n',
);
