import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const bindingEntry = process.env.UMF_NODE_BINDING_DIR
  ? pathToFileURL(resolve(process.env.UMF_NODE_BINDING_DIR, 'index.js')).href
  : new URL('../../../bindings/core/node/index.js', import.meta.url).href;
const {createProtobufInspector} = await import(bindingEntry);
const {encodeRequestWire} = await import(new URL('../../../bindings/core/node/src/wire.js', import.meta.url).href);

const baseline = JSON.parse(await readFile(new URL('../../../docs/helix/04-build/evidence/rust-migration/r5-protobuf-descriptor-codec/inspector-predecessor.json', import.meta.url), 'utf8'));
const expected = label => baseline.observations.find(row => row.label === label).value;
const node = (type, fields = {}, unknown = []) => ({type, fields, unknown});
const doc = descriptorSet => ({umf: '0.10.0', id: 'node-inspect', vocabularies: {'umf.protobuf': {version: '0.1.0'}}, modules: [{id: 'schema', namespace: '', elements: [{id: 'schema', extensions: {'umf.protobuf': {descriptorProfile: 'protobuf-es-2.15.0', descriptorSet}}}]}]});
const inspector = createProtobufInspector();
const plain = value => JSON.parse(JSON.stringify(value));
assert.deepEqual(plain(inspector.inspect(doc(node('google.protobuf.FileDescriptorSet'))).diagnostics), expected('empty-document-diagnostics'));
assert.deepEqual(plain(inspector.inspect(doc(node('google.protobuf.FileDescriptorSet', {}, [{number: 50000, wireType: 2, data: '04000102ff'}]))).diagnostics), expected('unknown-root-diagnostic-order'));
const utf16 = doc(node('google.protobuf.FileDescriptorSet'));
utf16.id = '\ud800';
utf16.modules[0].elements[0].extensions['umf.protobuf']['future\ud800'] = true;
assert.equal(inspector.inspect(utf16).diagnostics.find(item => item.code === 'PROTOBUF_REPRESENTATION').path, '/future\ud800');
let charged = 0;
const metered = createProtobufInspector({controls: {meter: amount => { charged += amount; }}});
const first = metered.inspect(utf16);
assert.ok(charged > 0);
const firstCharge = charged;
assert.deepEqual(metered.inspect(utf16), first);
assert.equal(charged, firstCharge * 2);
const failWith = (controls, code) => assert.throws(() => createProtobufInspector({controls}).inspect(utf16), error => error.code === code);
failWith({maxWork: 0}, 'RESOURCE_LIMIT');
failWith({isCancelled: () => true}, 'CANCELLED');
failWith({now: () => 11, deadlineMs: 10}, 'DEADLINE');
const meterRequest = {op: 'protobuf.descriptor.inspect', document: utf16};
let preRustMeterCalls = 1;
encodeRequestWire(meterRequest, () => { preRustMeterCalls++; });
let meterCalls = 0;
let failedInsideRust = false;
assert.throws(() => createProtobufInspector({controls: {meter() {
  meterCalls++;
  if (!failedInsideRust && meterCalls > preRustMeterCalls) { failedInsideRust = true; throw new Error('meter stopped'); }
}}}).inspect(utf16), error => error.code === 'METER_FAILURE' && error.message === 'Error: meter stopped' && error.path === '');
assert.equal(failedInsideRust, true);
assert.ok(meterCalls > preRustMeterCalls);
console.log(JSON.stringify({status: 'pass', runtime: `Node ${process.version}`, profile: 'umf-r5-protobuf-inspect/0.1.0', predecessorCases: 2, utf16DiagnosticPath: 'pass', errorEnvelope: 'pass', failureInsideRustHook: 'pass', meteredWorkPerCall: firstCharge, controls: ['RESOURCE_LIMIT', 'CANCELLED', 'DEADLINE', 'METER_FAILURE']}));
