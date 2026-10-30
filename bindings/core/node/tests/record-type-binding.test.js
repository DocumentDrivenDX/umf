import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {expect, test} from 'bun:test';
import {encodeRequestWire, fromWire} from '../src/wire.js';

const require = createRequire(import.meta.url);
const addon = require(process.env.UMF_RECORD_TYPE_NODE_ADDON ?? '../umf_core_node.node');
const facadeRoot = process.env.UMF_RECORD_TYPE_NODE_PACKAGE ?? new URL('..', import.meta.url).pathname;
const facade = await import(pathToFileURL(resolve(facadeRoot, 'index.js')).href);
const RECORD_TYPE_BINDING_PROFILE = 'umf.record-type-binding/1.0.0';
function executeRecordTypeBindingWire(wireJson, controlDispatcher) {
  if (addon.recordTypeBindingProfileVersion() !== RECORD_TYPE_BINDING_PROFILE) throw new Error('profile mismatch');
  return addon.executeRecordTypeWire(wireJson, controlDispatcher);
}

const avroPacket = JSON.parse(readFileSync(new URL('../../../../../../../../tests/rust-core/fixtures/r8-avro-record-type/typescript-predecessor.json', import.meta.url), 'utf8'));
const parquetPacket = JSON.parse(readFileSync(new URL('../../../../../../../../tests/rust-core/fixtures/r8-parquet-record-type/typescript-predecessor.json', import.meta.url), 'utf8'));

function call(op, fields, control) {
  const text = executeRecordTypeBindingWire(encodeRequestWire({profile: RECORD_TYPE_BINDING_PROFILE, op, ...fields}), control);
  const envelope = JSON.parse(text);
  if (envelope.status === 'error') return envelope;
  return {envelope, value: fromWire(JSON.parse(envelope.wire))};
}

test('Node tagged wire classifies and recovers the frozen Avro Record Type case', () => {
  const expected = avroPacket.outcomes['matrix/direct/child/strict'].result;
  const {value: receipt} = call('classifyAvroRecordType', {source: expected.source, request: expected.request});
  expect(receipt.status).toBe('classified');
  const {value: recovered} = call('recoverAvroRecordTypeBundle', {receipt, current: receipt.target});
  expect(recovered.schema).toBeDefined();
}, 120_000);

test('Node tagged wire matches full Avro Record Type matrix receipts and recoveries', () => {
  const canonical = (value) => JSON.stringify(value, (key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map((name) => [name, item[name]]))
    : item);
  const matrix = Object.entries(avroPacket.outcomes).filter(([name]) => name.startsWith('matrix/'));
  expect(matrix).toHaveLength(30);
  let classified = 0;
  for (const [name, item] of matrix) {
    const expected = item.result;
    const {value: receipt} = call('classifyAvroRecordType', {source: expected.source, request: expected.request});
    expect(canonical(receipt), `${name} full receipt`).toBe(canonical(expected));
    if (expected.status === 'classified') {
      const {value: recovered} = call('recoverAvroRecordTypeBundle', {receipt, current: receipt.target});
      expect(canonical(recovered), `${name} exact recovery`).toBe(canonical(item.recovery.json));
      classified++;
    }
  }
  expect(classified).toBe(10);
}, 900_000);

test('Node public package facade forwards the opt-in profile through classify and recover', () => {
  expect(facade.RECORD_TYPE_BINDING_PROFILE).toBe(RECORD_TYPE_BINDING_PROFILE);
  const profileRefusal = JSON.parse(facade.executeRecordTypeBindingWire(encodeRequestWire({profile: 'wrong', op: 'classifyAvroRecordType'})));
  expect(profileRefusal.code).toBe('REQUEST');
  const expected = avroPacket.outcomes['matrix/direct/child/strict'].result;
  const response = JSON.parse(facade.executeRecordTypeBindingWire(encodeRequestWire({
    profile: RECORD_TYPE_BINDING_PROFILE, op: 'classifyAvroRecordType', source: expected.source, request: expected.request,
  })));
  const receipt = fromWire(JSON.parse(response.wire));
  const recovered = JSON.parse(facade.executeRecordTypeBindingWire(encodeRequestWire({
    profile: RECORD_TYPE_BINDING_PROFILE, op: 'recoverAvroRecordTypeBundle', receipt, current: receipt.target,
  })));
  expect(fromWire(JSON.parse(recovered.wire)).schema).toBeDefined();
}, 120_000);

test('Node tagged wire classifies and recovers the frozen Parquet Record Type case', () => {
  const expected = parquetPacket.outcomes['classified/list-tuple/strict'].result;
  const {value: receipt} = call('classifyParquetRecordType', {source: expected.source, request: expected.request});
  expect(receipt.status).toBe('classified');
  const {value: recovered} = call('recoverParquetRecordTypeBytes', {receipt, current: receipt.target});
  expect(recovered.bytesHex).toBe(parquetPacket.outcomes['classified/list-tuple/strict'].recoveryHex.json);
}, 120_000);

test('Node tagged wire returns the shared error envelope for malformed requests and host limits', () => {
  expect(call('classifyParquetRecordType', {source: null, request: {index: 1.5}}).code).toBe('REQUEST');
  const limited = call('classifyAvroRecordType', {source: null, request: null}, () => encodeRequestWire({ok: false, code: 'TEST_BUDGET', message: 'host budget exhausted'}));
  expect(limited.status).toBe('error');
  expect(limited.code).toBe('TEST_BUDGET');
});
