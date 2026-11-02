import {expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {UmfError} from '../../src/model/errors.ts';
import {createProtobufDescriptorDocumentRustDefault} from '../../src/adapters/protobuf/rust-default.ts';

const bindingEntry = process.env.UMF_NODE_BINDING_DIR
  ? pathToFileURL(resolve(process.env.UMF_NODE_BINDING_DIR, 'index.js')).href
  : new URL('../../bindings/core/node/index.js', import.meta.url).href;
const rust = await import(bindingEntry);
const predecessor = await import('../../src/adapters/protobuf/index.ts');
const root = resolve(import.meta.dir, '../..');
const authored = new Uint8Array(readFileSync(resolve(root, 'fixtures/protobuf/authored.pb')));
const unknown = new Uint8Array([0x82, 0xb5, 0x18, 0x04, 0x00, 0x01, 0x02, 0xff]);
const packet = JSON.parse(readFileSync(resolve(root, 'tests/rust-core/fixtures/r8-protobuf-descriptor-predecessor/predecessor.json'), 'utf8'));
const json = value => JSON.parse(JSON.stringify(value));
let suppliedErrorType;
const api = createProtobufDescriptorDocumentRustDefault(options => {
  suppliedErrorType = options.ErrorType;
  return rust.createProtobufDescriptorDocumentEngine(options);
});

test('Rust facade uses the public error constructor and matches frozen operation vectors', () => {
  expect(suppliedErrorType).toBe(UmfError);
  expect(json(api.readDescriptorSet(new Uint8Array()))).toEqual(packet.vectors.readEmpty.value);
  expect(json(api.readDescriptorSet(authored))).toEqual(packet.vectors.readAuthored.value);
  expect(json(api.readDescriptorSet(unknown))).toEqual(packet.vectors.readUnknownWire.value);
  const descriptor = api.readDescriptorSet(authored);
  expect([...api.writeDescriptorSet(descriptor)]).toEqual([...predecessor.writeDescriptorSet(descriptor)]);
  const document = api.importProtobufDescriptorSet(authored, {id: 'frozen-packet'});
  expect(json(document)).toEqual(packet.vectors.importAuthored.value);
  expect(json(api.getProtobufDescriptorSet(document))).toEqual(packet.vectors.getAuthored.value);
  expect([...api.exportProtobufDescriptorSet(document)]).toEqual([...predecessor.exportProtobufDescriptorSet(document)]);
  expect(json(api.inspectProtobuf(document))).toEqual(packet.vectors.inspectAuthored.value);
  const bundle = api.exportProtobufBundle(document);
  const expectedBundle = predecessor.exportProtobufBundle(document);
  expect([...bundle.descriptorSet]).toEqual([...expectedBundle.descriptorSet]);
  expect(json(bundle.source)).toEqual(json(expectedBundle.source));
  expect(json(bundle.diagnostics)).toEqual(json(expectedBundle.diagnostics));
}, {timeout: 120_000});

test('Rust facade preserves public UmfError identity and predecessor option getter order', () => {
  const malformed = new Uint8Array(11).fill(0x80);
  let error;
  try { api.readDescriptorSet(malformed); } catch (caught) { error = caught; }
  expect(error).toBeInstanceOf(UmfError);
  expect({name: error.name, code: error.code, path: error.path, message: error.message}).toEqual({
    name: packet.vectors.readMalformed.name,
    code: packet.vectors.readMalformed.code,
    path: packet.vectors.readMalformed.path,
    message: packet.vectors.readMalformed.message,
  });

  const getterError = new Error('id getter observed');
  const options = {};
  Object.defineProperty(options, 'id', {enumerable: true, get() { throw getterError; }});
  let observed;
  try { api.importProtobufDescriptorSet(new Uint8Array(4_000_001), options); } catch (caught) { observed = caught; }
  expect(observed).toBe(getterError);
}, {timeout: 120_000});

test('Rust facade preserves unknown wire bytes and returns independent output copies', () => {
  const document = api.importProtobufDescriptorSet(unknown, {id: 'unknown-wire'});
  const tree = api.getProtobufDescriptorSet(document);
  expect(tree.unknown).toEqual([{number: 50000, wireType: 2, data: '04000102ff'}]);
  tree.unknown[0].data = '00';
  const firstExport = api.exportProtobufDescriptorSet(document);
  expect([...firstExport]).toEqual([...unknown]);
  firstExport[0] = 0;
  expect([...api.exportProtobufDescriptorSet(document)]).toEqual([...unknown]);
  expect(api.getProtobufDescriptorSet(document).unknown[0].data).toBe('04000102ff');
  const firstRead = api.readDescriptorSet(unknown);
  firstRead.unknown[0].data = '00';
  expect(api.readDescriptorSet(unknown).unknown[0].data).toBe('04000102ff');
});
