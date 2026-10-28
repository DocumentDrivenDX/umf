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

test('descriptor wire failures carry the native brand before public UmfError mapping', () => {
  let native;
  try { engine.readDescriptorSet(new Uint8Array([0])); } catch (error) { native = error; }
  expect(rust.isNativeUmfCoreError(native)).toBe(true);
  let exposed;
  try { candidate(new Uint8Array([0])); } catch (error) { exposed = error; }
  expect(exposed).toBeInstanceOf(UmfError);
  expect(exposed.name).toBe('UmfError');
  expect(exposed.code).toBe(native.code);
  expect(exposed.message).toBe(native.message);
});

test('out-of-signature values remain outside the candidate parity profile', () => {
  for (const value of ['abc', [], new Uint16Array([1])]) {
    const expected = capture(predecessor, value);
    const actual = capture(candidate, value);
    expect(actual.ok).toBe(false);
    expect(actual.name).toBe(expected.name);
    expect(actual.code).toBe(expected.code);
    // Buf and the existing native byte guard report different diagnostic text.
    expect(actual.message).not.toBe(expected.message);
  }
});
