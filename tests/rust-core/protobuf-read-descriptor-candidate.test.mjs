import {expect, test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {readDescriptorSet as predecessor} from '../../src/adapters/protobuf/descriptor.ts';
import {createReadDescriptorSetRustCandidate} from '../../src/adapters/protobuf/descriptor-rust-candidate.ts';
import {UmfError} from '../../src/model/errors.ts';
import * as rust from '../../bindings/core/node/index.js';
import predecessorFixture from './protobuf-read-descriptor-predecessor.json';

const engine = rust.createProtobufDescriptorDocumentEngine();
const candidate = createReadDescriptorSetRustCandidate(engine, rust.isNativeUmfCoreError);
const json = value => JSON.parse(JSON.stringify(value));
const cases = [
  ['empty', new Uint8Array()],
  ['zero-tag', new Uint8Array([0])],
  ['truncated-tag-varint', new Uint8Array([0x80])],
  ['bad-wire-type', new Uint8Array([0x0f])],
  ['truncated-fixed32', new Uint8Array([0x0d, 1])],
  ['truncated-length', new Uint8Array([0x0a, 0x05, 1])],
  ['truncated-field-varint', new Uint8Array([0x10, 0x80])],
  ['malformed-10th-varint', new Uint8Array([0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x02])],
  ['overlong-unknown-varint', new Uint8Array([0xa0,0x06,0x80,0x00])],
  ['true-trailing-tag', new Uint8Array([0x0a,0x00,0x0f])],
  ['offset-valid-file', new Uint8Array([0x99,0x0a,0x00,0x99]).subarray(1,3)],
  ['exact-limit-malformed-first-byte', new Uint8Array(4_000_000)],
  ['limit-plus-one', new Uint8Array(4_000_001)],
  ['unknown-wire-preservation', new Uint8Array([0x82,0xb5,0x18,0x04,0x00,0x01,0x02,0xff])],
];

function capture(fn, input) {
  try { return {ok: true, value: json(fn(input))}; }
  catch (error) { return {ok: false, name: error.name, code: error.code ?? null, path: error.path ?? null, message: error.message}; }
}

test('14 frozen TypeScript/core cases retain exact outcomes and public UmfError diagnostics', () => {
  expect(cases).toHaveLength(14);
  expect(Object.keys(predecessorFixture.cases)).toHaveLength(14);
  const source = readFileSync(new URL('../../src/adapters/protobuf/descriptor.ts', import.meta.url));
  expect(createHash('sha256').update(source).digest('hex')).toBe(predecessorFixture.sourceSha256);
  const report = [];
  for (const [id, bytes] of cases) {
    const expected = capture(predecessor, bytes);
    expect(expected).toEqual(predecessorFixture.cases[id]);
    const actual = capture(candidate, bytes);
    expect(actual.ok).toBe(expected.ok);
    if (expected.ok) expect(actual.value).toEqual(expected.value);
    else {
      expect(actual.name).toBe('UmfError');
      expect(actual.code).toBe(expected.code);
      expect(actual.path).toBe(expected.path);
      expect(actual.message).toBe(expected.message);
      report.push({id, code: actual.code, predecessorMessage: expected.message, rustMessage: actual.message, messageExact: actual.message === expected.message});
    }
  }
  expect(report).toHaveLength(10);
  expect(report.every(row => row.messageExact)).toBe(true);
}, {timeout: 120_000});

test('raw-byte host snapshots the exact offset window and ignores overridden byte accessors', () => {
  const ordinaryBacking = new Uint8Array([0xaa, 0x82,0xb5,0x18,0x04,0,1,2,0xff,0xbb]);
  const ordinaryView = ordinaryBacking.subarray(1, 9);
  expect(json(candidate(ordinaryView))).toEqual(json(predecessor(ordinaryView)));
  class HostileBytes extends Uint8Array {
    get byteLength() { throw new Error('byteLength override touched'); }
    [Symbol.iterator]() { throw new Error('iterator override touched'); }
  }
  const backing = new HostileBytes([0xaa, 0x82,0xb5,0x18,0x04,0,1,2,0xff,0xbb]);
  const view = new HostileBytes(backing.buffer, 1, 8);
  expect(() => predecessor(view)).toThrow(expect.objectContaining({code: 'PROTOBUF_BINARY'}));
  const actual = candidate(view);
  expect(actual.unknown[0].data).toBe('04000102ff');
  backing[1] = 0;
  expect(actual.unknown[0].data).toBe('04000102ff');
});

test('candidate preserves predecessor size-check and catch boundaries', () => {
  expect(() => candidate(null)).toThrow(TypeError); // binary.length is read before the try/catch.
  const tooLarge = new Uint8Array(4_000_001);
  let error;
  try { candidate(tooLarge); } catch (caught) { error = caught; }
  expect(error).toBeInstanceOf(UmfError);
  expect({name: error.name, code: error.code, path: error.path, message: error.message}).toEqual({
    name: 'UmfError', code: 'LIMIT', path: '', message: 'Descriptor input exceeds limit',
  });
});

test('descriptor wire failures keep public UmfError identity through the V4 adapter boundary', () => {
  let native;
  try { engine.readDescriptorSet(new Uint8Array([0])); } catch (error) { native = error; }
  expect(native.name).toBe('UmfError');
  expect(native.code).toBe('PROTOBUF_BINARY');
  let exposed;
  try { candidate(new Uint8Array([0])); } catch (error) { exposed = error; }
  expect(exposed).toBeInstanceOf(UmfError);
  expect(exposed.name).toBe('UmfError');
  expect(exposed.code).toBe(native.code);
  expect(exposed.message).toBe(native.message);
});

test('ArrayBuffer views retain predecessor byte-window admission', () => {
  const backing = Uint8Array.from([0xaa, 0x82,0xb5,0x18,0x04,0x00,0x01,0x02,0xff,0xbb]);
  const views = [
    ['DataView', new DataView(new ArrayBuffer(0))],
    ['Buffer', Buffer.from(backing.buffer, 1, 8)],
  ];
  for (const [id, view] of views) {
    const expected = capture(predecessor, view);
    expect(expected.ok).toBe(true);
    const actual = capture(candidate, view);
    expect(actual).toEqual(expected);
  }
  expect(capture(candidate, new DataView(backing.buffer, 1, 8)).ok).toBe(false);
  const wide = new Uint16Array([0x0a, 0]);
  expect(capture(predecessor, wide).message).toBe('RangeError: premature EOF');
  const wideCandidate = capture(candidate, wide);
  expect(wideCandidate.ok).toBe(false);
  expect(wideCandidate.code).toBe('PROTOBUF_BINARY');
});

test('DataView and non-Uint8 typed arrays stay negative controls with frozen predecessor diagnostics', () => {
  const inputs = [
    ['nonempty-DataView-zero-tag', new DataView(new Uint8Array([0]).buffer)],
    ['nonempty-DataView-valid-byte-sequence', new DataView(new Uint8Array([0x0a, 0]).buffer)],
    ['Uint16Array-tag-then-eof', new Uint16Array([0x0a])],
    ['Uint16Array-illegal-tag', new Uint16Array([0])],
    ['Int16Array-illegal-tag', new Int16Array([0])],
    ['Float32Array-illegal-tag', new Float32Array([0])],
  ];
  const predecessorMessages = [
    'Error: illegal tag: field no 0 wire type 0',
    'Error: illegal tag: field no 0 wire type 0',
    'RangeError: premature EOF',
    'Error: illegal tag: field no 0 wire type 0',
    'Error: illegal tag: field no 0 wire type 0',
    'Error: illegal tag: field no 0 wire type 0',
  ];
  const candidateMessages = [
    'TypeError: Non-empty DataView admission is outside the candidate profile',
    'TypeError: Non-empty DataView admission is outside the candidate profile',
    'TypeError: Non-Uint8 typed-array admission is outside the candidate profile',
    'TypeError: Non-Uint8 typed-array admission is outside the candidate profile',
    'TypeError: Non-Uint8 typed-array admission is outside the candidate profile',
    'TypeError: Non-Uint8 typed-array admission is outside the candidate profile',
  ];
  for (let i = 0; i < inputs.length; i++) {
    const [id, input] = inputs[i];
    const expected = capture(predecessor, input);
    expect(expected, id).toMatchObject({ok: false, name: 'UmfError', code: 'PROTOBUF_BINARY', path: '', message: predecessorMessages[i]});
    expect(capture(candidate, input), id).toMatchObject({ok: false, name: 'UmfError', code: 'PROTOBUF_BINARY', path: '', message: candidateMessages[i]});
  }
});

test('unsupported non-view hosts fail closed with captured predecessor diagnostics', () => {
  for (const value of ['abc', [], new ArrayBuffer(0), {length: 0}, new Proxy(new Uint8Array([0]), {})]) {
    const expected = capture(predecessor, value);
    const actual = capture(candidate, value);
    expect(actual).toEqual(expected);
  }
});
