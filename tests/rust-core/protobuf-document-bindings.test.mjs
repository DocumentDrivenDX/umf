import {expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {UmfError as PublicUmfError} from '../../src/model/errors.ts';

const bindingEntry = process.env.UMF_NODE_BINDING_DIR
  ? pathToFileURL(resolve(process.env.UMF_NODE_BINDING_DIR, 'index.js')).href
  : new URL('../../bindings/core/node/index.js', import.meta.url).href;
const rust = await import(bindingEntry);
const predecessor = await import('../../src/adapters/protobuf/index.ts');
const root = resolve(import.meta.dir, '../..');
const authored = new Uint8Array(readFileSync(resolve(root, 'fixtures/protobuf/authored.pb')));
const unknown = new Uint8Array([0x82, 0xb5, 0x18, 0x04, 0x00, 0x01, 0x02, 0xff]);
const packet = JSON.parse(readFileSync(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r8-protobuf-descriptor-predecessor/predecessor.json'), 'utf8'));
const equal = (a, b) => expect(JSON.parse(JSON.stringify(a))).toEqual(JSON.parse(JSON.stringify(b)));
const hex = bytes => [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');

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
  Object.defineProperty(hostileOptions, 'id', {enumerable: true, get() { throw new Error('id getter observed'); }});
  expect(() => rust.createProtobufDescriptorDocumentEngine().importProtobufDescriptorSet(tooLarge, hostileOptions)).toThrow('id getter observed');
});

test('semantic failure uses the public UmfError class and predecessor diagnostic', () => {
  const malformed = new Uint8Array(11).fill(0x80);
  let predecessorError;
  let rustError;
  try { predecessor.readDescriptorSet(malformed); } catch (error) { predecessorError = error; }
  try { rust.createProtobufDescriptorDocumentEngine().readDescriptorSet(malformed); } catch (error) { rustError = error; }
  expect(predecessorError?.name).toBe('UmfError');
  expect(rustError?.name).toBe('UmfError');
  expect(rustError?.code).toBe('PROTOBUF_BINARY');
  expect(rustError?.message).toBe(predecessorError?.message);
  let injectedError;
  try { rust.createProtobufDescriptorDocumentEngine({ErrorType: PublicUmfError}).readDescriptorSet(malformed); } catch (error) { injectedError = error; }
  expect(injectedError).toBeInstanceOf(PublicUmfError);
  expect(injectedError?.message).toBe(predecessorError?.message);
});

test('raw host admission matches the frozen TypeScript observation packet', () => {
  const engine = rust.createProtobufDescriptorDocumentEngine();
  const vectors = [
    [new Uint8Array([0]), 'Error: illegal tag: field no 0 wire type 0'],
    [Buffer.from([0]), 'Error: illegal tag: field no 0 wire type 0'],
    [new DataView(new ArrayBuffer(0)), null],
    [new DataView(new Uint8Array([0]).buffer), 'Error: illegal tag: field no 0 wire type 0'],
    [new Uint16Array([10]), 'RangeError: premature EOF'],
    [new Int16Array([0]), 'Error: illegal tag: field no 0 wire type 0'],
    [new Float32Array([0]), 'Error: illegal tag: field no 0 wire type 0'],
    [{length: 0}, 'TypeError: Expected ArrayBuffer for the first argument.'],
  ];
  for (const [input, message] of vectors) {
    if (message === null) {
      expect(engine.readDescriptorSet(input).fields).toEqual({});
    } else {
      expect(() => engine.readDescriptorSet(input)).toThrow(expect.objectContaining({name: 'UmfError', code: 'PROTOBUF_BINARY', path: '', message}));
    }
  }
  expect(() => engine.readDescriptorSet(null)).toThrow(TypeError);
});

test('Node operations match all frozen success and error vectors', () => {
  const engine = rust.createProtobufDescriptorDocumentEngine({ErrorType: PublicUmfError});
  const malformed = new Uint8Array(11).fill(0x80);
  const document = predecessor.importProtobufDescriptorSet(authored, {id: 'frozen-packet'});
  const unknownDocument = predecessor.importProtobufDescriptorSet(unknown, {id: 'unknown-wire'});
  const actual = {
    readEmpty: engine.readDescriptorSet(new Uint8Array()),
    readAuthored: engine.readDescriptorSet(authored),
    readUnknownWire: engine.readDescriptorSet(unknown),
    writeAuthored: hex(engine.writeDescriptorSet(engine.readDescriptorSet(authored))),
    writeUnknownWire: hex(engine.writeDescriptorSet(engine.readDescriptorSet(unknown))),
    importAuthored: engine.importProtobufDescriptorSet(authored, {id: 'frozen-packet'}),
    exportAuthored: hex(engine.exportProtobufDescriptorSet(document)),
    getAuthored: engine.getProtobufDescriptorSet(document),
    inspectAuthored: engine.inspectProtobuf(document),
    bundleAuthored: (() => { const result = engine.exportProtobufBundle(document); return {...result, descriptorSet: hex(result.descriptorSet)}; })(),
    inspectMalformedDocument: engine.inspectProtobuf({}),
    exportUnknownWire: hex(engine.exportProtobufDescriptorSet(unknownDocument)),
    unknownWireTree: engine.getProtobufDescriptorSet(unknownDocument),
    writeInvalidUnknownWire: Object.fromEntries([...engine.writeDescriptorSet({type: 'google.protobuf.FileDescriptorSet', fields: {}, unknown: [{number: 50000, wireType: 2, data: '00'}]})].map((byte, index) => [index, byte])),
  };
  for (const [key, value] of Object.entries(actual)) equal(value, packet.vectors[key].value);
  const readMalformed = (() => { try { engine.readDescriptorSet(malformed); } catch (error) { return {name: error.name, code: error.code, path: error.path, message: error.message}; } })();
  equal(readMalformed, {name: packet.vectors.readMalformed.name, code: packet.vectors.readMalformed.code, path: packet.vectors.readMalformed.path, message: packet.vectors.readMalformed.message});
  expect(() => engine.exportProtobufDescriptorSet({})).toThrow(expect.objectContaining({name: 'UmfError', code: packet.vectors.exportMalformedDocument.code, path: packet.vectors.exportMalformedDocument.path, message: packet.vectors.exportMalformedDocument.message}));
  expect(() => engine.writeDescriptorSet({type: 'google.protobuf.FileDescriptorSet', fields: {}, unknown: [], extra: true})).toThrow(expect.objectContaining({name: 'UmfError', code: packet.vectors.writeUnknownRepresentation.code, path: packet.vectors.writeUnknownRepresentation.path, message: packet.vectors.writeUnknownRepresentation.message}));
  expect(engine.inspectProtobuf({})).toEqual(packet.vectors.inspectMalformedDocument.value);
  expect(packet.operations).toEqual(['readDescriptorSet','writeDescriptorSet','importProtobufDescriptorSet','exportProtobufDescriptorSet','getProtobufDescriptorSet','inspectProtobuf','exportProtobufBundle']);
}, {timeout: 120_000});
