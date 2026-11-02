// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, test} from 'bun:test';
import {
  exportIcebergSchema,
  getIcebergNode,
  importIcebergSchema,
  proposeIcebergNodeEdit,
  icebergRegistry,
  validateDocument,
} from '../../src/index-node-v4';
import {UmfError} from '../../src/index-node-v4';

test('native default Iceberg schema root imports, reads, edits and exports exact schema content', () => {
  const source = JSON.stringify({
    type: 'struct',
    fields: [{id: 1, name: 'id', type: 'long', required: true}],
    future: {opaque: 'preserved'},
  });
  const document = importIcebergSchema(source, {id: 'iceberg-root'});
  const validation = validateDocument(document, icebergRegistry());
  expect(validation.diagnostics.some(diagnostic => diagnostic.code === 'ICEBERG_CONTEXT_UNVERIFIED')).toBe(true);
  expect(getIcebergNode(document, '/fields/0/name')).toEqual({kind: 'string', value: 'id'});
  const proposal = proposeIcebergNodeEdit(document, '/fields/0/name', '"identifier"');
  expect(proposal.validation.valid).toBe(true);
  const output = JSON.parse(exportIcebergSchema(proposal.document));
  expect(output.fields[0].name).toBe('identifier');
  expect(output.future).toEqual({opaque: 'preserved'});
}, 60_000);

test('native default Iceberg schema root maps invalid JSON to the public error class', () => {
  let refusal: unknown;
  try { importIcebergSchema('{', {id: 'invalid'}); } catch (error) { refusal = error; }
  expect(refusal).toBeInstanceOf(UmfError);
  expect(refusal).toMatchObject({name: 'UmfError', code: 'JSON_SCHEMA_SYNTAX'});
}, 30_000);
