import {expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const nodeBindingEntry = process.env.UMF_NODE_BINDING_DIR
  ? pathToFileURL(resolve(process.env.UMF_NODE_BINDING_DIR, 'index.js')).href
  : new URL('../../bindings/core/node/index.js', import.meta.url).href;
const {createAvroFieldsEngine, AVRO_FIELDS_PROFILE} = await import(nodeBindingEntry);
const packet = JSON.parse(readFileSync(resolve(import.meta.dir, '../../tests/rust-core/fixtures/r5-avro-fields/predecessor.json'), 'utf8'));
const engine = createAvroFieldsEngine();
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
const capture = fn => { try { return {status: 'ok', value: fn()}; } catch (error) { return {status: 'error', code: error.code, message: error.message, path: error.path}; } };

test('Node/Bun Avro fields binding replays all frozen predecessor outputs', () => {
  expect(AVRO_FIELDS_PROFILE).toBe('umf-r5-avro-fields/0.1.0');
  expect(packet.cases).toHaveLength(100);
  let total = 0;
  for (const row of packet.cases) {
    expect(row.status).toBe('ok');
    const {root, dependencies = []} = row.payload;
    const actual = engine.deriveAvroFields(root, dependencies);
    expect(canonical(actual)).toBe(canonical(row.fields));
    total += actual.length;
  }
  expect(total).toBe(294);
});

test('Avro fields binding retains unknown source content, UTF-16 units, order and copy isolation', () => {
  const input = packet.cases.find(row => row.label === '26-field-shape-baseline').payload.root;
  const first = engine.deriveAvroFields(input);
  expect(first.map(field => field.element.name)).toEqual(Array.from({length: 26}, (_, i) => `f${i}`));
  first[0].nativeField.bindingMutation = true;
  expect(engine.deriveAvroFields(input)[0].nativeField.bindingMutation).toBeUndefined();
  const field = {kind: 'object', members: {
    name: {kind: 'string', value: 'surrogate\ud800'},
    type: {kind: 'object', members: {type: {kind: 'string', value: 'bytes'}, logicalType: {kind: 'string', value: 'decimal'}, precision: {kind: 'number', value: '1.00e0'}, scale: {kind: 'number', value: '0'}}},
  }, futureRepresentationField: {keep: ['future', 4]}};
  const root = {kind: 'object', members: {type: {kind: 'string', value: 'record'}, name: {kind: 'string', value: 'R'}, fields: {kind: 'array', items: [field]}}};
  const result = engine.deriveAvroFields(root)[0];
  expect(result.element.name.charCodeAt(result.element.name.length - 1)).toBe(0xd800);
  expect(result.element.scalarType).toBe('decimal');
  expect(result.nativeField.futureRepresentationField).toEqual({keep: ['future', 4]});
});

test('Avro fields binding applies per-call work, cancellation, deadline and callback envelopes', () => {
  const root = packet.cases[0].payload.root;
  let work = 0;
  createAvroFieldsEngine({controls: {meter: amount => { work += amount; }}}).deriveAvroFields(root);
  expect(work).toBeGreaterThan(0);
  expect(capture(() => createAvroFieldsEngine({controls: {maxWork: 0}}).deriveAvroFields(root))).toEqual({status: 'error', code: 'RESOURCE_LIMIT', message: 'Host work budget exceeded', path: ''});
  expect(capture(() => createAvroFieldsEngine({controls: {isCancelled: () => true}}).deriveAvroFields(root))).toEqual({status: 'error', code: 'CANCELLED', message: 'Operation cancelled by host', path: ''});
  expect(capture(() => createAvroFieldsEngine({controls: {now: () => 12, deadlineMs: 11}}).deriveAvroFields(root))).toEqual({status: 'error', code: 'DEADLINE', message: 'Deadline elapsed', path: ''});
  expect(capture(() => createAvroFieldsEngine({controls: {meter() { throw new Error('meter stopped'); }}}).deriveAvroFields(root))).toEqual({status: 'error', code: 'METER_FAILURE', message: 'Error: meter stopped', path: ''});
  expect(capture(() => createAvroFieldsEngine({controls: {isCancelled() { throw new Error('cancel stopped'); }}}).deriveAvroFields(root))).toEqual({status: 'error', code: 'CANCELLATION_CHECK_FAILURE', message: 'Error: cancel stopped', path: ''});
});

test('Avro fields binding rejects malformed tagged trees with a versioned error envelope', () => {
  const error = capture(() => engine.deriveAvroFields({kind: 'number', value: 1}));
  expect(error.status).toBe('error');
  expect(error.code).toBe('NATIVE_JSON_TREE');
});
