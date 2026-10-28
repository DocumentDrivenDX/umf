import {expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {AVRO_DOCUMENT_INSPECT_PROFILE, createAvroDocumentInspector} from '../index.js';
const fixture = JSON.parse(readFileSync(new URL('../../../../fixtures/avro/candidate-edits.json', import.meta.url), 'utf8'));

test('whole-document inspector uses its opt-in profile and separates admission from native inspection', () => {
  const report = createAvroDocumentInspector().inspect({});
  expect(AVRO_DOCUMENT_INSPECT_PROFILE).toBe('umf-r5-avro-document-inspect/0.1.0');
  expect(report.profile).toBe(AVRO_DOCUMENT_INSPECT_PROFILE);
  expect(report.admission.valid).toBe(false);
  expect(report.nativeInspection.status).toBe('not-run');
}, 60_000);

test('whole-document inspector reaches native inspection and preserves source extensions', () => {
  const document = structuredClone(fixture.cases[0].result.source);
  const before = structuredClone(document);
  const report = createAvroDocumentInspector().inspect(document);
  expect(report.admission.valid).toBe(true);
  expect(report.nativeInspection.status).toBe('inspected');
  expect(report.nativeInspection.complete).toBe(false);
  expect(document).toEqual(before);
  expect(document.vocabularies['example.future']).toEqual({version: '7.0.0'});
}, 60_000);

test('whole-document inspector guards native profile and forwards host controls', () => {
  let charged = 0;
  const controlled = createAvroDocumentInspector({controls: {meter(amount) { charged += amount; }}});
  controlled.inspect({});
  expect(charged).toBeGreaterThan(0);
  expect(() => createAvroDocumentInspector({controls: {maxWork: 0}}).inspect({})).toThrow(/Host work budget exceeded/);
}, 60_000);
