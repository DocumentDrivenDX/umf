import {expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {AVRO_EXTENSION, importAvroSchema, inspectAvro, proposeAvroNodeEdit} from '../../src/adapters/avro/index.ts';
import {AVRO_INSPECT_PROFILE, AVRO_CANDIDATE_PROFILE, createAvroInspector, createAvroCandidateEditor} from '../../bindings/core/node/index.js';

const predecessor = JSON.parse(readFileSync(new URL('../../docs/helix/04-build/evidence/rust-migration/r8-avro-inspect-edit-predecessor/predecessor.json', import.meta.url), 'utf8'));
const original = () => {
  const document = importAvroSchema(
    '{"type":"record","name":"Packet","fields":[{"name":"count","type":"long","default":9223372036854775807},{"name":"label","type":"string","custom.field":{"owner":"future"}}],"custom.root":{"keep":true}}',
    {id: 'avro-r8-packet'},
  );
  document.extensions = {'example.future': {payload: ['retain', 7]}};
  document.vocabularies['example.future'] = {version: '1.0.0'};
  return document;
};
const payload = document => document.modules.find(m => m.id === 'schema').elements.find(e => e.id === 'schema').extensions[AVRO_EXTENSION];

test('differential harness pins operation scope and records intended inspector difference', () => {
  expect(predecessor.operations).toEqual(['inspectAvro', 'proposeAvroNodeEdit']);
  const document = original();
  const ts = inspectAvro(document);
  const rust = createAvroInspector().inspect(payload(document).root, payload(document).dependencies ?? []);
  expect(AVRO_INSPECT_PROFILE).toBe('umf-r5-avro-inspect/0.1.0');
  expect(rust).toMatchObject({valid: true, complete: false});
  // Intentional profile difference: Rust adds a persistent profile-limit diagnostic;
  // TS additionally reports its host numeric interpretation warning.
  expect(rust.diagnostics.map(d => d.code)).toContain('AVRO_PROFILE_LIMIT');
  expect(ts.valid).toBe(true);
  expect(ts.complete).toBe(false);
  expect(ts.diagnostics.map(d => d.code)).toContain('AVRO_NUMERIC');
  expect(predecessor.cases.inspectValidWithUnknownNativeContent.value).toEqual(ts);
});

test('candidate comparison checks detached source fidelity and records report-shape difference', () => {
  const document = original();
  const before = structuredClone(document);
  const ts = proposeAvroNodeEdit(document, '/fields/1/type', '"bytes"');
  const rust = createAvroCandidateEditor().proposeNodeEdit(document, '/fields/1/type', '"bytes"');
  expect(AVRO_CANDIDATE_PROFILE).toBe('umf-r5-avro-candidate/0.1.0');
  // Both candidates retain exact UMF source, including unrelated extensions and the
  // large integer token; neither mutates caller input.
  expect(ts.source).toEqual(before);
  expect(rust.source).toEqual(before);
  expect(document).toEqual(before);
  expect(rust.document).not.toBe(document);
  expect(ts.document.extensions['example.future']).toEqual({payload: ['retain', 7]});
  expect(rust.document.extensions['example.future']).toEqual({payload: ['retain', 7]});
  const tsRoot = payload(ts.document).root;
  const rustRoot = payload(rust.document).root;
  expect(tsRoot.members['custom.root']).toEqual(rustRoot.members['custom.root']);
  expect(tsRoot.members.fields.items[1].members['custom.field']).toEqual(rustRoot.members.fields.items[1].members['custom.field']);
  expect(rust).not.toHaveProperty('validation');
  expect(rust).toHaveProperty('admission');
  expect(rust).toHaveProperty('nativeInspection');
  expect(ts).toHaveProperty('validation');
});
