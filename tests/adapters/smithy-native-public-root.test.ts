// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, test} from 'bun:test';
import {
  assembleSmithyDocument,
  createSmithyJavaScriptSelectionBackend,
  importSmithySources,
  selectSmithyShapes,
} from '../../src/index-node-v4';

test('pinned Smithy runtime assembles and selects through the public Rust default', async () => {
  const runtime = await import(new URL('../../native/smithy/browser/target/javascript/smithy.js', import.meta.url).href);
  const backend = createSmithyJavaScriptSelectionBackend(runtime);
  const document = importSmithySources({files: {
    'model.smithy': '$version: "2.0"\nnamespace demo\nstring Thing',
  }}, {id: 'smithy-public'});

  const assembly = await assembleSmithyDocument(document, backend, {id: 'smithy-assembled'});
  expect(assembly.status).toBe('assembled');
  expect(assembly.model?.id).toBe('smithy-assembled');

  const selected = await selectSmithyShapes(document, backend, 'string', {id: 'smithy-selected'});
  expect(selected.status).toBe('selected');
  expect(selected.shapeIds).toContain('demo#Thing');
}, 30_000);

test('Smithy Rust default refuses invalid source filenames before invoking the runtime', async () => {
  let calls = 0;
  const backend = {
    identity: 'smithy-model@1.73.0/teavm@0.15.0/umf-compat-v1',
    assemble() { calls += 1; throw new Error('must not be called'); },
    select() { calls += 1; throw new Error('must not be called'); },
  };
  const document = importSmithySources({files: {'model.smithy': 'namespace demo'}}, {id: 'smithy-invalid'});
  const payload = document.modules.find(module => module.id === 'schema')!.elements.find(element => element.id === 'schema')!.extensions['umf.smithy'] as any;
  payload.files = {'../escape.smithy': 'namespace demo'};
  await expect(assembleSmithyDocument(document, backend, {id: 'out'})).rejects.toMatchObject({code: 'SMITHY_DOCUMENT'});
  expect(calls).toBe(0);
}, 30_000);
