import {expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {encodeRequestWire} from '../../bindings/core/node/src/wire.js';

const nodeBindingEntry = process.env.UMF_NODE_BINDING_DIR
  ? pathToFileURL(resolve(process.env.UMF_NODE_BINDING_DIR, 'index.js')).href
  : new URL('../../bindings/core/node/index.js', import.meta.url).href;
const {createProtobufInspector, PROTOBUF_INSPECT_PROFILE} = await import(nodeBindingEntry);

const root = resolve(import.meta.dir, '../..');
const predecessor = JSON.parse(readFileSync(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r5-protobuf-descriptor-codec/inspector-predecessor.json'), 'utf8'));
const frozen = label => predecessor.observations.find(row => row.label === label).value;
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
const capture = operation => { try { return {status: 'ok', value: operation()}; } catch (error) { return {status: 'error', code: error.code, message: error.message, path: error.path}; } };
const node = (type, fields = {}, unknown = []) => ({type, fields, unknown});
const document = descriptorSet => ({
  umf: '0.10.0', id: 'inspect', vocabularies: {'umf.protobuf': {version: '0.1.0'}},
  modules: [{id: 'schema', namespace: '', elements: [{id: 'schema', extensions: {'umf.protobuf': {descriptorProfile: 'protobuf-es-2.15.0', descriptorSet}}}]}],
});

test('Node/Bun inspector reproduces frozen empty and unknown-wire predecessor observations', () => {
  expect(PROTOBUF_INSPECT_PROFILE).toBe('umf-r5-protobuf-inspect/0.1.0');
  const inspector = createProtobufInspector();
  const empty = inspector.inspect(document(node('google.protobuf.FileDescriptorSet')));
  expect(canonical(empty.diagnostics)).toBe(canonical(frozen('empty-document-diagnostics')));
  expect(empty.complete).toBe(false);
  const unknown = inspector.inspect(document(node('google.protobuf.FileDescriptorSet', {}, [{number: 50000, wireType: 2, data: '04000102ff'}])));
  expect(canonical(unknown.diagnostics)).toBe(canonical(frozen('unknown-root-diagnostic-order')));
  expect(unknown.valid).toBe(true);
});

test('Node/Bun inspector preserves UTF-16 paths and scopes metering, cancellation and deadlines per call', () => {
  const source = document(node('google.protobuf.FileDescriptorSet'));
  source.id = '\ud800';
  source.modules[0].elements[0].extensions['umf.protobuf']['future\ud800'] = true;
  const baseline = createProtobufInspector().inspect(source);
  expect(baseline.diagnostics.find(item => item.code === 'PROTOBUF_REPRESENTATION').path).toBe('/future\ud800');
  expect(createProtobufInspector().inspect({...source})).toEqual(baseline);
  let work = 0;
  const metered = createProtobufInspector({controls: {meter: amount => { work += amount; }}});
  metered.inspect(source);
  const oneCall = work;
  expect(oneCall).toBeGreaterThan(0);
  metered.inspect(source);
  expect(work).toBe(oneCall * 2);
  expect(capture(() => createProtobufInspector({controls: {maxWork: 0}}).inspect(source)).code).toBe('RESOURCE_LIMIT');
  expect(capture(() => createProtobufInspector({controls: {isCancelled: () => true}}).inspect(source)).code).toBe('CANCELLED');
  expect(capture(() => createProtobufInspector({controls: {now: () => 11, deadlineMs: 10}}).inspect(source)).code).toBe('DEADLINE');
  const request = {op: 'protobuf.descriptor.inspect', document: source};
  let preRustMeterCalls = 1;
  encodeRequestWire(request, () => { preRustMeterCalls++; });
  let meterCalls = 0;
  let failedInsideRust = false;
  const meterFailure = capture(() => createProtobufInspector({controls: {meter() {
    meterCalls++;
    if (!failedInsideRust && meterCalls > preRustMeterCalls) { failedInsideRust = true; throw new Error('meter stopped'); }
  }}}).inspect(source));
  expect(meterFailure).toEqual({status: 'error', code: 'METER_FAILURE', message: 'Error: meter stopped', path: ''});
  expect(failedInsideRust).toBe(true);
  expect(meterCalls).toBeGreaterThan(preRustMeterCalls);
});

test('WASM wrapper sends the one tagged operation and handles result and error envelopes', async () => {
  const wasm = await import('../../bindings/core/wasm/index.js');
  const requests = [];
  const fakeModule = {
    protobufInspectProfileVersion: () => wasm.PROTOBUF_INSPECT_PROFILE,
    executeProtobufInspectWire(wire) {
      const request = decodeTransport(JSON.parse(wire));
      requests.push(request);
      if (request.document.id === 'error') return JSON.stringify({profile: 'umf.core-wire/1', status: 'error', code: 'UTF16_TEST', pathUnits: [47, 0xd800], messageUnits: [0xd800, 47, 0xdc00]});
      return JSON.stringify({profile: 'umf.core-wire/1', status: 'ok', wire: JSON.stringify(transport({valid: true, complete: false, diagnostics: []}))});
    },
  };
  const api = wasm.createProtobufInspector(fakeModule);
  expect(api.inspect({id: 'browser'})).toEqual({valid: true, complete: false, diagnostics: []});
  const error = capture(() => api.inspect({id: 'error'}));
  expect(error).toEqual({status: 'error', code: 'UTF16_TEST', path: '/\ud800', message: '\ud800/\udc00'});
  expect(requests).toEqual([
    {op: 'protobuf.descriptor.inspect', document: {id: 'browser'}},
    {op: 'protobuf.descriptor.inspect', document: {id: 'error'}},
  ]);
  await expect(wasm.initializeProtobufInspectWasm(async () => fakeModule, {WebAssembly: {instantiate() {}}})).resolves.toBeDefined();
  await expect(wasm.initializeProtobufInspectWasm(async () => fakeModule, {})).rejects.toThrow('WASM_RUNTIME_UNAVAILABLE');
  expect(() => wasm.createProtobufInspector({...fakeModule, protobufInspectProfileVersion: () => 'other'})).toThrow('RUST_WASM_BINDING_PROFILE_MISMATCH');
});

function decodeTransport(wire) {
  if (wire.kind === 'object') return Object.fromEntries(wire.members.map(member => [String.fromCharCode(...member.key), decodeTransport(member.value)]));
  if (wire.kind === 'array') return wire.items.map(decodeTransport);
  if (wire.kind === 'string') return String.fromCharCode(...wire.units);
  if (wire.kind === 'null') return null;
  if (wire.kind === 'boolean') return wire.value;
  throw new TypeError('Unexpected fake wire value');
}
function transport(value) {
  if (value === null) return {kind: 'null'};
  if (typeof value === 'boolean') return {kind: 'boolean', value};
  if (typeof value === 'string') return {kind: 'string', units: Array.from({length: value.length}, (_, index) => value.charCodeAt(index))};
  if (Array.isArray(value)) return {kind: 'array', items: value.map(transport)};
  return {kind: 'object', members: Object.entries(value).map(([key, item]) => ({key: Array.from({length: key.length}, (_, index) => key.charCodeAt(index)), value: transport(item)}))};
}
