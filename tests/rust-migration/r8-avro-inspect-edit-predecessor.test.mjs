import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { importAvroSchema, inspectAvro, proposeAvroNodeEdit, AVRO_EXTENSION } from '../../src/adapters/avro/index.ts';

const packetBytes = readFileSync(new URL('../../docs/helix/04-build/evidence/rust-migration/r8-avro-inspect-edit-predecessor/predecessor.json', import.meta.url));
const packet = JSON.parse(packetBytes.toString('utf8'));
const valid = importAvroSchema(
  '{"type":"record","name":"Packet","fields":[{"name":"count","type":"long","default":9223372036854775807},{"name":"label","type":"string","custom.field":{"owner":"future"}}],"custom.root":{"keep":true}}',
  { id: 'avro-r8-packet' },
);
valid.extensions = { 'example.future': { payload: ['retain', 7] } };
valid.vocabularies['example.future'] = { version: '1.0.0' };

test('frozen packet hash, source cohort and operation roster are stable', () => {
  expect(createHash('sha256').update(packetBytes).digest('hex')).toBe('06961649e4873ee01fb14b19d7004e8f34c50592c8582a0cd88aef8dd7417303');
  expect(packet.operations).toEqual(['inspectAvro', 'proposeAvroNodeEdit']);
  expect(packet.sourceCohort.bun).toBe('1.4.3');
  expect(packet.sourceCohort.avsc).toBe('5.7.9');
  expect(Object.keys(packet.cases)).toHaveLength(8);
});

test('inspection keeps structural validity distinct from incomplete native semantics', () => {
  const observed = inspectAvro(valid);
  expect(observed).toEqual(packet.cases.inspectValidWithUnknownNativeContent.value);
  expect(observed).toMatchObject({ valid: true, complete: false });
  expect(observed.diagnostics.map(item => item.code)).toEqual(['UNKNOWN_EXTENSION', 'AVRO_METADATA', 'AVRO_METADATA', 'AVRO_NUMERIC']);
  const invalid = inspectAvro({});
  expect(invalid).toEqual(packet.cases.inspectInvalidUmfDocument.value);
  expect(invalid.valid).toBe(false);
  const unresolved = importAvroSchema('{"type":"record","name":"Unresolved","fields":[{"name":"value","type":"Missing.Type"}]}', { id: 'unresolved' });
  expect(inspectAvro(unresolved)).toEqual(packet.cases.inspectUnresolvedName.value);
});

test('candidate edit retains opaque content and freezes replacement and failures', () => {
  const proposal = proposeAvroNodeEdit(valid, '/fields/1/type', '"bytes"');
  expect({ status: proposal.status, source: proposal.source, document: proposal.document, validation: proposal.validation, edit: proposal.edit })
    .toEqual(packet.cases.proposeKnownFieldTypeChange.value);
  expect(proposal.document.modules[0].elements[0].extensions[AVRO_EXTENSION].root.members['custom.root']).toBeDefined();
  expect(proposal.document.modules[0].elements[0].extensions[AVRO_EXTENSION].root.members.fields.items[1].members['custom.field']).toBeDefined();
  expect(proposal.source.extensions['example.future']).toEqual({ payload: ['retain', 7] });
  expect(proposal.validation.diagnostics.map(item => item.code)).toContain('AVRO_NUMERIC');
  expect(packet.cases.proposeInvalidTarget).toMatchObject({ status: 'error', code: 'JSON_SCHEMA_POINTER', publicUmfError: true });
  expect(packet.cases.proposeUnknownRepresentation).toMatchObject({ status: 'error', code: 'AVRO_REPRESENTATION', publicUmfError: true });
});

test('host admission rejects accessors for proposals and reports them during inspection', () => {
  expect(packet.cases.inspectAccessorDocument.value).toMatchObject({ valid: false, diagnostics: [{ code: 'NON_JSON', path: '/modules' }] });
  expect(packet.cases.proposeAccessorDocument).toMatchObject({ status: 'error', name: 'UmfError', code: 'NON_JSON', path: '/modules' });
  const getter = {};
  Object.defineProperty(getter, 'modules', { enumerable: true, get() { throw new Error('modules getter observed'); } });
  expect(inspectAvro(getter)).toEqual(packet.cases.inspectAccessorDocument.value);
  expect(() => proposeAvroNodeEdit(getter, '', '"string"')).toThrow('Hidden fields and accessors');
});
