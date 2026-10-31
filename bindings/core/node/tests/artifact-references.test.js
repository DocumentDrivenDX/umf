import {expect, test} from 'bun:test';
import {executeArtifactReferencesBindingWire} from '../index.js';
import {encodeWire, fromWire, resultError} from '../src/wire.js';
import {inspectArtifactReferences} from '../../../../src/domain-packs/artifacts.ts';
import {generateDomainPackSchema} from '../../../../src/domain-packs/schema.ts';
import {createValidator} from '../../../../src/validation/schema.ts';

test('Rust artifact reference wire matches TypeScript after structural validation', () => {
  const loneSurrogate = '\ud800';
  const pack = {
    id: 'artifact-reference-fixture', version: '1.0.0',
    domain_types: {identity: {description: 'fixture'}},
    sources: {[loneSurrogate]: {kind: 'external', data_kind: 'unknown', reference: 'https://example.org/file', format: 'json'}},
    schemas: [{id: 'wrong-format', format: 'json', reference: 'schema.json'}],
    artifact_collections: [
      {version: '1.0.0', id: 'same', title: 'First', view: 'other', semantic_kinds: ['fixture'], source_ids: [loneSurrogate, 'missing-source'], loader_inventory_source_id: 'missing-inventory', metadata_schema_ids: ['wrong-format'], derived_schema_ids: ['missing-schema'], ontology_schema_ids: ['wrong-format']},
      {version: '1.0.0', id: 'same', title: 'Second', view: 'other', semantic_kinds: ['fixture'], source_ids: [loneSurrogate]},
    ],
  };
  const validateStructure = createValidator().compile(generateDomainPackSchema());
  if (!validateStructure(pack)) throw new Error(JSON.stringify(validateStructure.errors));

  const expected = inspectArtifactReferences(pack);
  const envelope = JSON.parse(executeArtifactReferencesBindingWire(encodeWire({op: 'artifactReferences/inspect', pack})));
  expect(resultError(envelope)).toBeNull();
  expect(fromWire(JSON.parse(envelope.wire))).toEqual(expected);
  expect(expected).toEqual([
    'Duplicate artifact collection identity',
    'Unresolved artifact source: missing-source',
    'Unresolved artifact inventory source',
    'Artifact schema format mismatch: wrong-format',
    'Unresolved artifact schema: missing-schema',
    'Artifact schema format mismatch: wrong-format',
  ]);
});

test('artifact reference wire refuses a missing validated pack', () => {
  const envelope = JSON.parse(executeArtifactReferencesBindingWire(encodeWire({op: 'artifactReferences/inspect'})));
  expect(resultError(envelope)?.code).toBe('REQUEST');
});

test('artifact reference wire honors a host work refusal during admission', () => {
  const denied = encodeWire({ok: false, code: 'TEST_DENIED', message: 'denied'});
  const envelope = JSON.parse(executeArtifactReferencesBindingWire(
    encodeWire({op: 'artifactReferences/inspect', pack: {artifact_collections: []}}),
    () => denied,
  ));
  expect(resultError(envelope)?.code).toBe('TEST_DENIED');
});

test('artifact reference wire refuses inputs outside its bounded inspection profile', () => {
  const collection = (id, prefix) => ({
    version: '1.0.0', id, title: id, view: 'other', semantic_kinds: ['fixture'],
    source_ids: Array.from({length: 5_000}, (_, index) => `${prefix}-${index}`),
    loader_inventory_source_id: `${prefix}-inventory`,
  });
  const pack = {
    id: 'bounded-fixture', version: '1.0.0', domain_types: {identity: {}},
    sources: {present: {kind: 'external', data_kind: 'unknown', reference: 'https://example.org', format: 'json'}},
    artifact_collections: [collection('first', 'a'), collection('second', 'b')],
  };
  const validateStructure = createValidator().compile(generateDomainPackSchema());
  if (!validateStructure(pack)) throw new Error(JSON.stringify(validateStructure.errors));
  const envelope = JSON.parse(executeArtifactReferencesBindingWire(encodeWire({op: 'artifactReferences/inspect', pack})));
  expect(resultError(envelope)?.code).toBe('RESOURCE_LIMIT');
});
