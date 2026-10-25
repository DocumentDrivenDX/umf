import {expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const bindingEntry = process.env.UMF_NODE_BINDING_DIR
  ? pathToFileURL(resolve(process.env.UMF_NODE_BINDING_DIR, 'index.js')).href
  : new URL('../../bindings/core/node/index.js', import.meta.url).href;
const rust = await import(bindingEntry);
const predecessor = await import('../../src/adapters/protobuf/index.ts');
const root = resolve(import.meta.dir, '../..');
const authored = new Uint8Array(readFileSync(resolve(root, 'fixtures/protobuf/authored.pb')));
const unknown = new Uint8Array([0x82, 0xb5, 0x18, 0x04, 0x00, 0x01, 0x02, 0xff]);
const equal = (a, b) => expect(JSON.parse(JSON.stringify(a))).toEqual(JSON.parse(JSON.stringify(b)));

test('Node/Bun descriptor and document packet matches bounded TypeScript predecessor vectors', () => {
  expect(rust.PROTOBUF_DOCUMENT_PROFILE).toBe('umf-r8-protobuf-descriptor-document/0.1.0');
  const engine = rust.createProtobufDescriptorDocumentEngine();
  for (const bytes of [new Uint8Array(), authored, unknown]) {
    const descriptor = engine.readDescriptorSet(bytes);
    equal(descriptor, predecessor.readDescriptorSet(bytes));
    expect([...engine.writeDescriptorSet(descriptor)]).toEqual([...predecessor.writeDescriptorSet(descriptor)]);
  }
  const descriptor = engine.readDescriptorSet(authored);
  const document = engine.importProtobufDescriptorSet(authored, {id: 'packet'});
  equal(document, predecessor.importProtobufDescriptorSet(authored, {id: 'packet'}));
  equal(engine.getProtobufDescriptorSet(document), predecessor.getProtobufDescriptorSet(document));
  expect([...engine.exportProtobufDescriptorSet(document)]).toEqual([...predecessor.exportProtobufDescriptorSet(document)]);
  equal(engine.inspectProtobuf(document), predecessor.inspectProtobuf(document));
  const bundle = engine.exportProtobufBundle(document);
  const expectedBundle = predecessor.exportProtobufBundle(document);
  expect([...bundle.descriptorSet]).toEqual([...expectedBundle.descriptorSet]);
  equal(bundle.source, expectedBundle.source);
  equal(bundle.diagnostics, expectedBundle.diagnostics);
  expect(engine.readDescriptorSet(authored)).toEqual(descriptor);
}, {timeout: 120_000});

test('packet preserves raw unknown wire bytes and returns isolated byte/tree copies', () => {
  const engine = rust.createProtobufDescriptorDocumentEngine();
  const document = engine.importProtobufDescriptorSet(unknown, {id: 'unknown-wire'});
  const descriptor = engine.getProtobufDescriptorSet(document);
  expect(descriptor.unknown).toEqual([{number: 50000, wireType: 2, data: '04000102ff'}]);
  const first = engine.exportProtobufDescriptorSet(document);
  expect([...first]).toEqual([...unknown]);
  first[0] = 0;
  expect([...engine.exportProtobufDescriptorSet(document)]).toEqual([...unknown]);
  descriptor.unknown[0].data = '00';
  expect(engine.getProtobufDescriptorSet(document).unknown[0].data).toBe('04000102ff');
}, {timeout: 120_000});

test('byte admission uses intrinsic Uint8Array slots and snapshots offset views', () => {
  class HostileBytes extends Uint8Array {
    get byteLength() { throw new Error('byteLength override touched'); }
    [Symbol.iterator]() { throw new Error('iterator override touched'); }
  }
  const backing = new HostileBytes([0xaa, ...unknown, 0xbb]);
  const view = new HostileBytes(backing.buffer, 1, unknown.length);
  const engine = rust.createProtobufDescriptorDocumentEngine();
  const descriptor = engine.readDescriptorSet(view);
  expect(descriptor.unknown).toEqual([{number: 50000, wireType: 2, data: '04000102ff'}]);
  backing[1] = 0;
  expect(descriptor.unknown[0].data).toBe('04000102ff');
  const oversized = new HostileBytes(4_000_001);
  expect(() => engine.readDescriptorSet(oversized)).toThrow(expect.objectContaining({code: 'LIMIT'}));
}, {timeout: 120_000});

test('binary cap and per-call host controls refuse before native byte conversion', () => {
  const tooLarge = new Uint8Array(4_000_001);
  const failWith = (controls, code) => expect(() => rust.createProtobufDescriptorDocumentEngine({controls}).readDescriptorSet(tooLarge)).toThrow(expect.objectContaining({code}));
  failWith({}, 'LIMIT');
  failWith({maxWork: 0}, 'RESOURCE_LIMIT');
  let calls = 0;
  const meter = rust.createProtobufDescriptorDocumentEngine({controls: {meter() { calls++; throw new Error('stopped'); }}});
  expect(() => meter.readDescriptorSet(tooLarge)).toThrow(expect.objectContaining({code: 'METER_FAILURE'}));
  expect(calls).toBe(1);
  const cancelled = rust.createProtobufDescriptorDocumentEngine({controls: {isCancelled: () => true}});
  expect(() => cancelled.readDescriptorSet(tooLarge)).toThrow(expect.objectContaining({code: 'CANCELLED'}));
  const hostileOptions = {};
  Object.defineProperty(hostileOptions, 'id', {enumerable: true, get() { throw new Error('id getter must not run'); }});
  expect(() => rust.createProtobufDescriptorDocumentEngine().importProtobufDescriptorSet(tooLarge, hostileOptions)).toThrow('Engine descriptor property id must be an enumerable data property');
});

test('semantic failure class remains a documented opt-in difference', () => {
  const malformed = new Uint8Array(11).fill(0x80);
  let predecessorError;
  let rustError;
  try { predecessor.readDescriptorSet(malformed); } catch (error) { predecessorError = error; }
  try { rust.createProtobufDescriptorDocumentEngine().readDescriptorSet(malformed); } catch (error) { rustError = error; }
  expect(predecessorError?.name).toBe('UmfError');
  expect(rustError?.name).toBe('UmfCoreError');
  expect(rustError?.code).toBe('PROTOBUF_BINARY');
});
